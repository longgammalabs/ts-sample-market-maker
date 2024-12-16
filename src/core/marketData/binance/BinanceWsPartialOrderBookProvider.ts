import { WebSocket } from "ws";
import { EventEmitter } from "../../eventEmitter";
import { IOrderBookProvider } from "../abstract/IOrderBookProvider";
import { OrderBook } from "../OrderBook";
import { BinancePartialOrderBookDepth } from "./BinancePartialOrderBookDepth";
import { UpdateSpeed } from "./UpdateSpeed";
import { BinanceSymbols } from "./BinanceSymbols";
import logger from "../../logger";
import { PartialOrderBookUpdate } from "./models/PartialOrderBookUpdate";

export class BinanceWsPartialOrderBookProvider implements IOrderBookProvider {
  private readonly BINANCE_WS_API_URL: string = "wss://stream.binance.com:9443/stream";
  public orderBookUpdated: EventEmitter<[orderbook: OrderBook]> | null = new EventEmitter();
  public availabilityChanged: EventEmitter<[isAvailable: boolean]> | null = new EventEmitter();

  private _isAvailable: boolean = false;
  public get isAvailable(): boolean {
    return this._isAvailable;
  }
  public set isAvailable(value: boolean) {
    if (this._isAvailable !== value) {
      this._isAvailable = value;
      if (this.availabilityChanged) {
        this.availabilityChanged.emit(this._isAvailable);
      }
    }
  }

  private get isConnected() {
    return this._ws !== null && this._ws?.readyState === WebSocket.OPEN;
  }

  private readonly _orderBooks: Map<string, OrderBook>;
  private readonly _depth: BinancePartialOrderBookDepth;
  private readonly _updateSpeed: UpdateSpeed;
  private _ws: WebSocket | null = null;

  constructor({
    depth,
    updateSpeed,
    symbols
  }: {
    depth: BinancePartialOrderBookDepth;
    updateSpeed: UpdateSpeed;
    symbols: string[];
  }) {
    this._depth = depth;
    this._updateSpeed = updateSpeed;
    this._orderBooks = new Map<string, OrderBook>();
    symbols.forEach((symbol) => {
      const binanceSymbol = BinanceSymbols.getSymbol(symbol);
      if (!binanceSymbol) {
        throw new Error(`Can't find Binance symbol for ${symbol}`);
      }
      const streamId = BinanceWsPartialOrderBookProvider.streamBySymbol(binanceSymbol, this._depth, this._updateSpeed);
      this._orderBooks.set(streamId, new OrderBook(symbol));
    });
  }

  public start(): void {
    if (this.isConnected) {
      return;
    }
    logger.info({
      at: "BinanceWsPartialOrderBookProvider#start",
      message: "Starting."
    });

    this._ws = new WebSocket(this.BINANCE_WS_API_URL);
    this._ws.on("open", this.onConnectedEventHandler);
    this._ws.on("close", this.onDisconnectedEventHandler);
    this._ws.on("message", this.onMessageEventHandler);
    this._ws.on("ping", () => this._ws?.pong());
  }

  public stop(): void {
    if (!this.isConnected) {
      return;
    }

    this._ws!.close();
  }

  private subscribeToStreams(streamIds: string[]): void {
    if (!this.isConnected) {
      return;
    }

    const requestJson = JSON.stringify({
      method: "SUBSCRIBE",
      params: streamIds,
      id: 1
    });
    this._ws!.send(requestJson, (err) => {
      if (err) {
        logger.error({
          at: "BinanceWsPartialOrderBookProvider#subscribeToStreams",
          message: "Subscribe attempt failed.",
          error: err
        });
      }
    });
  }

  public static streamBySymbol(symbol: string, depth: number, updateSpeed: number): string {
    return `${symbol}@depth${depth}@${updateSpeed}ms`;
  }

  private onConnectedEventHandler = (): void => {
    logger.info({
      at: "BinanceWsPartialOrderBookProvider#onConnectedEventHandler",
      message: "Connected."
    });
    this.isAvailable = true;
    this.subscribeToStreams(Array.from(this._orderBooks.keys()));
  };

  private onDisconnectedEventHandler = (): void => {
    this.isAvailable = false;
  };

  private onMessageEventHandler = (data: Buffer | ArrayBuffer | Buffer[]): void => {
    const msg = data.toString();
    if (!msg) {
      logger.warning({
        at: "BinanceWsPartialOrderBookProvider#onMessageEventHandler",
        message: "Null text received"
      });
    }

    try {
      const message = JSON.parse(msg);
      if (message["stream"] !== undefined) {
        this.handleStreamMessage(message);
      } else if (message["result"] !== undefined || message["code"] !== undefined) {
        logger.debug({
          at: "BinanceWsPartialOrderBookProvider#onMessageEventHandler",
          message: msg
        });
      }
    } catch (e) {
      logger.error({
        at: "BinanceWsPartialOrderBookProvider#onMessageEventHandler",
        message: "Message event handler error",
        error: e
      });
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleStreamMessage(update: any): void {
    const streamId = update["stream"];
    const orderBook = this._orderBooks.get(streamId);
    if (!orderBook) {
      logger.warning({
        at: "BinanceWsPartialOrderBookProvider#handleStreamMessage",
        message: `Unknown stream ${streamId}`
      });
      return;
    }

    orderBook.clear();

    // apply updates
    for (const entry of PartialOrderBookUpdate.getEntries(update["data"])) {
      orderBook.applyEntry(entry);
    }

    if (this.orderBookUpdated) {
      this.orderBookUpdated.emit(orderBook);
    }
  }
}
