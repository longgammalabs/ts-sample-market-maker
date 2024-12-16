import { Mutex } from "async-mutex";
import { IExecutor } from "../core/execution/abstract/IExecutor";
import { IOrderBookProvider } from "../core/marketData/abstract/IOrderBookProvider";
import { Quote } from "../core/marketData/models/Quote";
import { OrderBook } from "../core/marketData/OrderBook";
import { SideConfig, SymbolConfig } from "./configuration/SymbolConfig";
import logger from "../core/logger";
import { MakerCancelAction, MakerPlaceAction } from "./common/MakerAction";
import { Side } from "onchain-lob-sdk";
import BigNumber from "bignumber.js";

export class Maker {
  private readonly _config: SymbolConfig;
  private readonly _executor: IExecutor;
  private readonly _sourceOrderBookProvider: IOrderBookProvider;

  private _lastTopOfBook?: Quote;
  private _isExecutorAvailable: boolean = false;
  private _isSourceAvailable: boolean = false;
  private _onTickSequentialMutex: Mutex;

  constructor({
    config,
    executor,
    sourceOrderBookProvider
  }: {
    config: SymbolConfig;
    executor: IExecutor;
    sourceOrderBookProvider: IOrderBookProvider;
  }) {
    if (!config) throw new Error("config is required");
    this._config = config;
    if (!executor) throw new Error("executor is required");
    this._executor = executor;
    if (!sourceOrderBookProvider) throw new Error("sourceOrderBookProvider is required");
    this._sourceOrderBookProvider = sourceOrderBookProvider;
    this._onTickSequentialMutex = new Mutex();
    this.ordersChanged = this.ordersChanged.bind(this);
    this.executorAvailabilityChanged = this.executorAvailabilityChanged.bind(this);
    this.sourceAvailabilityChanged = this.sourceAvailabilityChanged.bind(this);
    this.sourceOrderBookUpdated = this.sourceOrderBookUpdated.bind(this);
  }

  public start(): void {
    this._executor.ordersChanged.addListener(this.ordersChanged);
    this._executor.availabilityChanged.addListener(this.executorAvailabilityChanged);
    this._sourceOrderBookProvider.availabilityChanged?.addListener(this.sourceAvailabilityChanged);
    this._sourceOrderBookProvider.orderBookUpdated?.addListener(this.sourceOrderBookUpdated);
  }

  public stop(): void {
    this._executor.ordersChanged.removeListener(this.ordersChanged);
    this._executor.availabilityChanged.removeListener(this.executorAvailabilityChanged);
    this._sourceOrderBookProvider.availabilityChanged?.removeListener(this.sourceAvailabilityChanged);
    this._sourceOrderBookProvider.orderBookUpdated?.removeListener(this.sourceOrderBookUpdated);
  }

  private ordersChanged(): void {
    if (this._onTickSequentialMutex.isLocked()) {
      logger.debug({
        at: "maker#ordersChanged",
        message: `OnTick call for ${this._config.symbol} skipped`
      });
      return;
    }
    this._onTickSequentialMutex.runExclusive(async () => {
      await this.onTick();
    });
  }

  private sourceAvailabilityChanged(isAvailable: boolean): void {
    this._isSourceAvailable = isAvailable;

    if (this._isSourceAvailable) {
      logger.debug({
        at: "maker#sourceAvailabilityChanged",
        message: `[${this._config.symbol}] Price source available`
      });
    } else {
      logger.debug({
        at: "maker#sourceAvailabilityChanged",
        message: `[${this._config.symbol}] Price source not available`
      });
    }

    if (!this._isSourceAvailable || this._onTickSequentialMutex.isLocked()) {
      logger.debug({
        at: "maker#sourceAvailabilityChanged",
        message: `[${this._config.symbol}] OnTick call skipped`
      });
    } else {
      this._onTickSequentialMutex.runExclusive(async () => {
        await this.onTick();
      });
    }
  }

  private sourceOrderBookUpdated(orderBook: OrderBook): void {
    if (orderBook.symbol !== this._config.sourceSymbol) {
      logger.debug({
        at: "maker#sourceOrderBookUpdated",
        message: `Symbols mismatch: [${this._config.sourceSymbol}] [${orderBook.symbol}]`
      });
      return;
    }

    const topOfBook = orderBook.topOfBook();

    if (
      topOfBook == null ||
      (this._lastTopOfBook != null &&
        this._lastTopOfBook.ask == topOfBook.ask &&
        this._lastTopOfBook.bid == topOfBook.bid)
    )
      return;

    this._lastTopOfBook = topOfBook;
    logger.info({
      at: "maker#sourceOrderBookUpdated",
      message: `[${this._config.symbol}] Ask: ${this._lastTopOfBook.ask}, Bid: ${this._lastTopOfBook.bid}`
    });

    if (this._onTickSequentialMutex.isLocked()) {
      logger.debug({
        at: "maker#sourceOrderBookUpdated",
        message: `[${this._config.symbol}] OnTick call skipped`
      });
    } else {
      this._onTickSequentialMutex.runExclusive(async () => {
        await this.onTick();
      });
    }
  }

  private async onTick(): Promise<void> {
    if (!this._isExecutorAvailable || this._lastTopOfBook == null) return;

    try {
      const lastTopOfBook = this._lastTopOfBook;
      const middlePrice = lastTopOfBook.getMiddlePrice();

      logger.notice({
        at: "maker#onTick",
        message: `[${this._config.symbol}] OnTick start. Ask: ${lastTopOfBook.ask}. Bid: ${lastTopOfBook.bid}. Middle: ${middlePrice}`
      });

      const activeOrders = this._executor.getActiveOrders(this._config.symbol);
      const pendingOrders = this._executor
        .getPendingOrders(this._config.symbol)
        .filter((o) => !activeOrders.some((ao) => ao.txnHash == o.txnHash));
      const sides: [Side, SideConfig][] = [
        ["bid", this._config.bids],
        ["ask", this._config.asks]
      ];

      const bestPrices: Record<Side, BigNumber | null> = {
        bid: null,
        ask: null
      };
      const minPriceStep = 1 / Math.pow(10, this._config.pricePrecision);

      for (const [side, params] of sides) {
        const actions = new Array<MakerCancelAction | MakerPlaceAction>();
        const sidePendingOrders = pendingOrders.filter((o) => o.side == side);

        const sideActiveOrders = activeOrders
          .filter((o) => o.side == side)
          .sort((a, b) => a.price.minus(b.price).toNumber());

        const maxDistanceInPercents =
          params.spreadInPercents +
          params.limitDistanceInPercents / 2 +
          (params.limitCount - 1) * params.limitDistanceInPercents;
        const maxDistance = (middlePrice * maxDistanceInPercents) / 100;

        for (const order of sideActiveOrders) {
          const distanceInPercents =
            order.side === "bid"
              ? ((middlePrice - order.price.toNumber()) / middlePrice) * 100
              : ((order.price.toNumber() - middlePrice) / middlePrice) * 100;

          const isOrderTooClose = distanceInPercents <= this._config.modifySpreadInPercents;
          const isOrderTooFar = distanceInPercents >= maxDistanceInPercents;

          // check if order must be canceled
          if (isOrderTooClose || isOrderTooFar || !params.enabled || !this._isSourceAvailable) {
            const reason = Maker.getOrderCancellationReason(isOrderTooClose, isOrderTooFar, params.enabled);
            logger.notice({
              at: "maker#onTick",
              message: `[${this._config.symbol}] Need to cancel ${side} order with id ${order.orderId} and price ${order.price.toString()} and distance ${distanceInPercents}. Reason: ${reason}`
            });

            actions.push({
              type: "cancel",
              orderId: order.orderId,
              symbol: this._config.symbol,
              price: order.price
            });
          }
        }

        // do not place orders if the side is disabled or the price source is unavailable
        if (!params.enabled || !this._isSourceAvailable) continue;

        const sideOrders = sideActiveOrders
          .filter((o) => !actions.some((a) => a.type === "cancel" && a.orderId == o.orderId))
          .concat(sidePendingOrders)
          .sort((a, b) => (side == "bid" ? b.price.minus(a.price).toNumber() : a.price.minus(b.price).toNumber()));

        logger.notice({
          at: "maker#onTick",
          message: `[${this._config.symbol}] ${side} filtered orders count: ${sideOrders.length}, active orders count: ${sideActiveOrders.length}`
        });

        let targetBestPrice =
          side == "bid"
            ? middlePrice - (middlePrice * params.spreadInPercents) / 100
            : middlePrice + (middlePrice * params.spreadInPercents) / 100;

        const targetBestPriceBN = this.truncatePrice(targetBestPrice, this._config.pricePrecision);

        logger.notice({
          at: "maker#onTick",
          message: `[${this._config.symbol}] ${side} target best price is ${targetBestPriceBN.toString()}`
        });

        if (sideOrders.length > 0) {
          const bestOrder = sideOrders[0];

          const distanceInPercents =
            bestOrder.side == "bid"
              ? ((middlePrice - bestOrder.price.toNumber()) / middlePrice) * 100
              : ((bestOrder.price.toNumber() - middlePrice) / middlePrice) * 100;

          // save current side best price to control cross trades
          bestPrices[side] = bestOrder.price;

          logger.notice({
            at: "maker#onTick",
            message: `[${this._config.symbol}] ${side} best order has price ${bestOrder.price.toString()} and distance in percent: ${distanceInPercents}`
          });

          // move best price closer to middle price
          if (distanceInPercents >= params.spreadInPercents * 2 - this._config.modifySpreadInPercents) {
            logger.notice({
              at: "maker#onTick",
              message: `[${this._config.symbol}] Move ${side} best order with ${bestOrder.orderId} and price ${bestOrder.price.toString()} near to ${targetBestPrice}`
            });

            actions.push({
              type: "place",
              symbol: this._config.symbol,
              side: side,
              qty: params.qty,
              price: targetBestPriceBN
            });
          } else {
            logger.notice({
              at: "maker#onTick",
              message: `[${this._config.symbol}] Set ${side} target best price to ${bestOrder.price.toString()}`
            });
            targetBestPrice = bestOrder.price.toNumber();
          }
        } else {
          logger.notice({
            at: "maker#onTick",
            message: `[${this._config.symbol}] Place new ${side} best order with price ${targetBestPriceBN.toString()}`
          });
          actions.push({
            type: "place",
            symbol: this._config.symbol,
            side: side,
            qty: params.qty,
            price: targetBestPriceBN
          });
        }

        const sign = side == "bid" ? -1 : 1;
        let priceIncrement = (middlePrice * params.limitDistanceInPercents) / 100;

        // if price increment less than minPriceStep, use minPriceStep instead
        priceIncrement = Math.max(
          this.truncatePrice(priceIncrement, this._config.pricePrecision).toNumber(),
          minPriceStep
        );

        const signedPriceIncrement = sign * priceIncrement;
        const startPrice = targetBestPrice + signedPriceIncrement;
        const maxPrice = side == "bid" ? middlePrice - maxDistance : middlePrice + maxDistance;

        for (
          let price = startPrice;
          side == "bid" ? price > maxPrice : price < maxPrice;
          price += signedPriceIncrement
        ) {
          const halfLimitDistance = (middlePrice * params.limitDistanceInPercents) / 100 / 2;

          const nearestOrder = sideOrders.find((o) => Math.abs(o.price.toNumber() - price) <= halfLimitDistance);

          if (nearestOrder != null) continue;

          logger.notice({
            at: "maker#onTick",
            message: `[${this._config.symbol}] Can't find ${side} order near price ${price}`
          });

          actions.push({
            symbol: this._config.symbol,
            type: "place",
            side: side,
            qty: params.qty,
            price: this.truncatePrice(price, this._config.pricePrecision) // new BigNumber(price)
          });
        }

        for (const action of actions) {
          if (action.type === "cancel") {
            if (this._executor.isOrderCanceled(action.symbol, action.orderId)) continue;

            logger.info({
              at: "maker#onTick",
              message: `[${this._config.symbol}] Try cancel order ${action.orderId} with price ${action.price.toString()}`
            });

            await this._executor.orderCancelAsync(action.orderId, action.symbol);
          } else if (action.type === "place") {
            logger.info({
              at: "maker#onTick",
              message: `[${this._config.symbol}] Try place ${action.side} order with price ${action.price.toString()}`
            });

            const oppositeSide: Side = action.side === "bid" ? "ask" : "bid";
            const oppositeBestPrice = bestPrices[oppositeSide];

            if (
              oppositeBestPrice != null &&
              ((action.side == "bid" && action.price.gte(oppositeBestPrice)) ||
                (action.side == "ask" && action.price.lte(oppositeBestPrice)))
            ) {
              logger.info({
                at: "maker#onTick",
                message: `[${this._config.symbol}] Skip ${action.side} order place with price ${action.price} to prevent cross trade`
              });
              continue;
            }
            await this._executor.orderSendAsync(action.symbol, action.price, action.qty, action.side);
          }
        }
      }
    } catch (e) {
      logger.error({
        at: "maker#onTick",
        message: `[${this._config.symbol}] Source order book tick handler error`,
        error: e
      });
    } finally {
      logger.notice({
        at: "maker#onTick",
        message: `[${this._config.symbol}] OnTick exit`
      });
    }
  }

  truncatePrice(targetBestPrice: number, pricePrecision: number): BigNumber {
    return BigNumber(targetBestPrice.toFixed(pricePrecision));
  }

  private executorAvailabilityChanged(isAvailable: boolean): void {
    if (isAvailable) {
      logger.info({
        at: "maker#executorAvailabilityChanged",
        message: `[${this._config.symbol}] Executor is available`
      });
    } else {
      logger.info({
        at: "maker#executorAvailabilityChanged",
        message: `[${this._config.symbol}] Executor is not available`
      });
    }

    this._isExecutorAvailable = isAvailable;
  }

  private static getOrderCancellationReason(
    isOrderTooClose: boolean,
    isOrderTooFar: boolean,
    isSideDisabled: boolean
  ): string {
    return isOrderTooClose
      ? "order too close"
      : isOrderTooFar
        ? "order too far"
        : isSideDisabled
          ? "side is disabled"
          : "price source is unavailable";
  }
}
