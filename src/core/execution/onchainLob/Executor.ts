import {
  OnchainLobClient,
  Side,
  Order as OnchainLobOrder
} from "onchain-lob-sdk";
import { IExecutor } from "../abstract/IExecutor";
import { Contract, Signer } from "ethers";
import {
  RpcTransactionTracker,
  TrackerErrorEvent,
  TrackerReceiptReceivedEvent
} from "../../wallet/evm/RpcTransactionTracker";
import { IClientConfig } from "../../configuration/IClientConfig";
import { Order, OrderStatus, OrderType } from "../Order";
import BigNumber from "bignumber.js";
import { NonceManager } from "../../wallet/evm/NonceManager";
import logger from "../../logger";
import { EventEmitter } from "../../eventEmitter";
import { erc20Abi } from "../abi/erc20";
import { Mutex } from "async-mutex";

export class Executor implements IExecutor {
  private static readonly GAS_PRICE = 1000000000n;
  private static readonly PLACE_ORDER_GAS = 2000000n;
  private static readonly CLAIM_ORDER_GAS = 2000000n;
  private static readonly APPROVE_GAS = 1000000;
  private static readonly TRACKER_UPDATE_INTERVAL_MS = 3_000;
  private static readonly TRACKER_TIMEOUT_MS = 60_000;

  public ordersChanged: EventEmitter<[data: Order[]]> = new EventEmitter();
  public availabilityChanged: EventEmitter<[isAvailable: boolean]> =
    new EventEmitter();

  private readonly config: IClientConfig;
  private readonly client: OnchainLobClient;
  private readonly tracker: RpcTransactionTracker;
  private readonly signer: Signer;
  private readonly _marketIds: string[];
  private readonly _marketSnapshotsReceived: Record<string, boolean>;
  private userOrdersMutex: Mutex = new Mutex();

  private readonly _cancellingOrders: Map<string, Map<string, string>>;
  private readonly _pendingOrders: Map<string, Map<string, Order>>;
  private readonly _activeOrders: Map<string, Map<string, Order>>;

  private _isAvailable: boolean = false;
  public get isAvailable(): boolean {
    return this._isAvailable;
  }
  private set isAvailable(value: boolean) {
    if (this._isAvailable !== value) {
      this._isAvailable = value;
      this.availabilityChanged.emit(this._isAvailable);
    }
  }

  constructor({
    config,
    client,
    tracker,
    signer,
    symbols,
    makerAddress
  }: {
    config: IClientConfig;
    client: OnchainLobClient;
    tracker: RpcTransactionTracker;
    signer: Signer;
    symbols: string[];
    makerAddress: string;
  }) {
    this.config = config;
    this.signer = signer;
    this.tracker = tracker;
    this.tracker.receiptReceived.addListener(
      this.trackerReceiptReceived.bind(this)
    );
    this.tracker.errorReceived.addListener(
      this.trackerErrorReceived.bind(this)
    );
    this.tracker.cancelled.addListener(this.trackerCanceled.bind(this));

    this.client = client;
    this.client.spot.events.userOrdersUpdated.addListener(
      this.hanjiClientUserOrdersUpdated.bind(this)
    );
    this.client.spot.subscribeToUserOrders({
      user: makerAddress,
      market: "allMarkets"
    });

    this._cancellingOrders = new Map<string, Map<string, string>>();
    this._pendingOrders = new Map<string, Map<string, Order>>();
    this._activeOrders = new Map<string, Map<string, Order>>();
    for (const symbol of symbols) {
      this._activeOrders.set(symbol, new Map<string, Order>());
      this._pendingOrders.set(symbol, new Map<string, Order>());
      this._cancellingOrders.set(symbol, new Map<string, string>());
    }

    this._marketIds = symbols.map((s) => {
      const symbolConfig = this.config.getSymbol(s);
      if (!symbolConfig.contractAddress) {
        throw new Error(`Can't find hanji marketId for symbol ${s}`);
      }
      return symbolConfig.contractAddress;
    });
    this._marketSnapshotsReceived = Object.fromEntries(
      this._marketIds.map((m) => [m, false])
    );
  }

  public isOrderCanceled(symbol: string, orderId: string): boolean {
    return this._cancellingOrders.get(symbol)!.has(orderId);
  }

  public getActiveOrders(symbol: string): Order[] {
    return Array.from(this._activeOrders.get(symbol)!.values());
  }

  public getPendingOrders(symbol: string): Order[] {
    return Array.from(this._pendingOrders.get(symbol)!.values());
  }

  public async orderSendAsync(
    symbol: string,
    price: BigNumber,
    qty: bigint,
    side: Side,
    marketOnly: boolean = false,
    fireAndForget: boolean = false
  ): Promise<void> {
    const symbolConfig = this.config.getSymbol(symbol);
    const fromAddress = await this.signer.getAddress();

    if (!this.signer.provider) {
      logger.error({
        at: "Executor#orderSendAsync",
        message: "Provide signer with a provider"
      });
      return;
    }

    const nonce = await NonceManager.getInstance().getNonceAsync(
      this.signer.provider,
      fromAddress,
      true
    );

    let txId;
    try {
      const response = await this.client.spot.placeOrder({
        market: symbolConfig.contractAddress,
        type: marketOnly ? "ioc" : "limit",
        side,
        size: qty,
        price: price,
        transferExecutedTokens: false,
        gasLimit: Executor.PLACE_ORDER_GAS,
        maxFeePerGas: Executor.GAS_PRICE,
        maxPriorityFeePerGas: 0n,
        nonce
      });
      txId = response.hash;
    } catch (error) {
      logger.error({
        at: "Executor#orderSendAsync",
        message: "Tx send error",
        error
      });
      return;
    }

    logger.info({
      at: "Executor#orderSendAsync",
      message: `[${symbol}] txId: ${txId} by orderSend with nonce: ${nonce}`
    });

    const pendingOrder = new Order({
      status: OrderStatus.Pending,
      orderId: txId!,
      symbol,
      side,
      type: OrderType.Return,
      price: price,
      qty: qty,
      leaveQty: qty,
      claimedQty: 0n,
      created: new Date(),
      lastChanged: new Date(),
      txnHash: txId
    });

    this._pendingOrders.get(symbol)!.set(txId!, pendingOrder);

    if (!fireAndForget) {
      this.tracker.trackTransactionAsync(
        symbol,
        txId!,
        this.signer.provider,
        Executor.TRACKER_UPDATE_INTERVAL_MS,
        Executor.TRACKER_TIMEOUT_MS
      );
    }
  }

  public async orderCancelAsync(orderId: string, symbol: string) {
    const symbolCancellingOrders = this._cancellingOrders.get(symbol)!;
    if (!symbolCancellingOrders.has(orderId)) return; // order already canceled

    if (!this.signer.provider) {
      logger.error({
        at: "Executor#orderCancelAsync",
        message: "Provide signer with a provider"
      });
      return;
    }
    symbolCancellingOrders.set(orderId, orderId);
    const symbolConfig = this.config.getSymbol(symbol);
    const fromAddress = await this.signer.getAddress();

    const nonce = await NonceManager.getInstance().getNonceAsync(
      this.signer.provider,
      fromAddress,
      true
    );

    logger.info({
      at: "Executor#orderCancelAsync",
      message: `[${symbol}] nonce: ${nonce.toString()}`
    });

    let txId;
    try {
      const response = await this.client.spot.claimOrder({
        market: symbolConfig.contractAddress,
        orderId,
        onlyClaim: false,
        transferExecutedTokens: false,
        gasLimit: Executor.CLAIM_ORDER_GAS,
        maxFeePerGas: Executor.GAS_PRICE,
        maxPriorityFeePerGas: 0n,
        nonce
      });
      txId = response.hash;
    } catch (error) {
      logger.error({
        at: "Executor#orderCancelAsync",
        message: "Tx send error",
        error
      });
      return;
    }

    symbolCancellingOrders.set(txId, orderId);

    logger.info({
      at: "Executor#orderCancelAsync",
      message: `[${symbol}] txId: ${txId} by orderCancel with nonce: ${nonce.toString()}`
    });

    this.tracker.trackTransactionAsync(
      symbol,
      txId!,
      this.signer.provider,
      Executor.TRACKER_UPDATE_INTERVAL_MS,
      Executor.TRACKER_TIMEOUT_MS
    );
  }
  async approveAsync(
    symbol: string,
    tokenContract: string,
    value: bigint
  ): Promise<string> {
    const symbolConfig = this.config.getSymbol(symbol);
    const fromAddress = await this.signer.getAddress();

    const nonce = await NonceManager.getInstance().getNonceAsync(
      this.signer.provider!,
      fromAddress,
      true
    );

    const contract = new Contract(tokenContract, erc20Abi, this.signer);
    const txId = await contract.approve(symbolConfig.contractAddress, value, {
      nonce,
      gasLimit: Executor.APPROVE_GAS,
      maxFeePerGas: Executor.GAS_PRICE,
      maxPriorityFeePerGas: 0n
    });

    return txId!;
  }

  async allowanceAsync(symbol: string, tokenContract: string): Promise<bigint> {
    const symbolConfig = this.config.getSymbol(symbol);
    const fromAddress = await this.signer.getAddress();
    const contract = new Contract(tokenContract, erc20Abi, this.signer);
    const allowance = await contract.allowance(
      fromAddress,
      symbolConfig.contractAddress
    );
    return allowance;
  }

  private hanjiClientUserOrdersUpdated(
    marketId: string,
    isSnapshot: boolean,
    data: OnchainLobOrder[]
  ): void {
    this.userOrdersMutex.runExclusive(async () =>
      this.UserOrdersHandler(marketId, isSnapshot, data)
    );
  }

  private async UserOrdersHandler(
    marketId: string,
    isSnapshot: boolean,
    userOrders: OnchainLobOrder[]
  ): Promise<void> {
    try {
      const isAllMarkets = marketId === "allMarkets";

      const marketIds = isAllMarkets
        ? isSnapshot
          ? this._marketIds
          : userOrders
              .map((o) => o.market.id)
              .filter((v, i, a) => a.indexOf(v) === i)
        : [marketId];

      for (const marketId of marketIds) {
        const symbolConfig = this.config.getSymbolByContract(marketId);

        if (symbolConfig === undefined) {
          logger.warning({
            at: "Executor#UserOrdersHandler",
            message: `Can't find symbol for marketId: ${marketId}`
          });
          return;
        }

        const orders = userOrders
          .filter((o) => o.market.id === marketId)
          .map((o) => Order.fromOnchainLobOrder(o, symbolConfig.symbol));

        for (const order of orders) {
          this.saveOrder(order);
        }

        // if snapshot
        if (isSnapshot) {
          // request active orders from api
          const address = await this.signer.getAddress();
          const activeOrders = await this.client.spot.getOrders({
            market: marketId,
            user: address,
            status: "open",
            limit: 0x7fffffff
          });

          for (const activeOrder of activeOrders) {
            this.saveOrder(
              Order.fromOnchainLobOrder(activeOrder, symbolConfig.symbol)
            );
          }

          this._marketSnapshotsReceived[marketId] = true;

          const isAllSnapshotsReceived =
            isAllMarkets ||
            Object.values(this._marketSnapshotsReceived).reduce(
              (s, p) => s && p,
              true
            );

          this.isAvailable = isAllSnapshotsReceived;
        }

        this.ordersChanged.emit(orders);
      }
    } catch (error) {
      logger.error({
        at: "Executor#UserOrdersHandler",
        message: "User orders events handler error",
        error
      });
    }
  }

  private saveOrder(order: Order): void {
    if (order.isActive()) {
      logger.debug({
        at: "Executor#saveOrder",
        message: `[${order.symbol}] Update ${order.side} active order with orderId: ${order.orderId} and txId: ${order.txnHash}`
      });

      this._activeOrders.get(order.symbol)!.set(order.orderId, order);
    } else {
      logger.debug({
        at: "Executor#saveOrder",
        message: `[${order.symbol}] Remove ${order.side} history order with orderId: ${order.orderId} and txId: ${order.txnHash}`
      });

      // try remove history order from active orders
      this._activeOrders.get(order.symbol)!.delete(order.orderId);
    }

    // try remove pending orders if exists
    this.tryRemovePendingOrder(order.symbol, order.txnHash);
  }

  private tryRemovePendingOrder(symbol: string, txId: string): void {
    const symbolPendingOrders = this._pendingOrders.get(symbol);
    const order = symbolPendingOrders!.get(txId);
    if (!order) {
      return;
    }

    symbolPendingOrders!.delete(txId);

    logger.debug({
      at: "Executor#tryRemovePendingOrder",
      message: `[${order.symbol}] ${order.side} pending order for txId: ${txId} removed`
    });

    this.ordersChanged.emit([order]);
  }

  private trackerErrorReceived({ symbol, txId }: TrackerErrorEvent): void {
    // transaction failed, try remove pending order if exists
    const symbolCancellingOrders = this._cancellingOrders.get(symbol)!;

    this.tryRemovePendingOrder(symbol, txId);

    const orderId = symbolCancellingOrders.get(txId);
    if (orderId) {
      symbolCancellingOrders.delete(txId);
      symbolCancellingOrders.delete(orderId);
    }
  }

  private trackerReceiptReceived({
    symbol,
    receipt
  }: TrackerReceiptReceivedEvent): void {
    // transaction failed, try remove pending order if exists
    if (receipt.status !== 0x1) {
      this.tryRemovePendingOrder(symbol, receipt.hash);

      const symbolCancellingOrders = this._cancellingOrders.get(symbol)!;
      const orderId = symbolCancellingOrders.get(receipt.hash);
      if (orderId) {
        symbolCancellingOrders.delete(receipt.hash);
        symbolCancellingOrders.delete(orderId);
      }
    }
  }

  private trackerCanceled({ symbol, error, txId }: TrackerErrorEvent): void {
    // transaction failed, try remove pending order if exists
    if (error.name === RpcTransactionTracker.TIMEOUT_REACHED_ERROR) {
      this.tryRemovePendingOrder(symbol, txId);

      const symbolCancellingOrders = this._cancellingOrders.get(symbol)!;
      const orderId = symbolCancellingOrders.get(txId);
      if (orderId) {
        symbolCancellingOrders.delete(txId);
        symbolCancellingOrders.delete(orderId);
      }
    }
  }
}
