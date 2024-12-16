import { Entry } from "./models/Entry";
import { Quote } from "./models/Quote";
import { Snapshot } from "./models/Snapshot";

export class OrderBook {
  private _lastTransactionId: number = 0;

  public symbol: string;
  public buys: Map<number, Entry> = new Map();
  public sells: Map<number, Entry> = new Map();

  constructor(symbol: string) {
    if (!symbol) {
      throw new Error("Symbol is required");
    }
    this.symbol = symbol;
  }

  public topOfBook(): Quote {
    const quote = new Quote({
      symbol: this.symbol,
      timeStamp: new Date(), // todo: change to last update time
      bid: this.buys.size !== 0 ? Math.min(...this.buys.keys()) : 0,
      ask: this.sells.size !== 0 ? Math.max(...this.sells.keys()) : Number.MAX_VALUE
    });
    return quote;
  }

  public isValid(): boolean {
    const quote = this.topOfBook();
    return quote.bid !== 0 && quote.ask !== 0 && quote.ask !== Number.MAX_VALUE;
  }

  public applySnapshot(snapshot: Snapshot): void {
    this.buys.clear();
    this.sells.clear();

    snapshot.entries.forEach((entry) => {
      this.applyEntry(entry);
    });

    this._lastTransactionId = snapshot.lastTransactionId;
  }

  public applyEntry(entry: Entry, checkTransactionId: boolean = false): void {
    if (checkTransactionId && entry.transactionId <= this._lastTransactionId) return;

    const book = entry.side === "bid" ? this.buys : this.sells;

    if (entry.qty() > 0) {
      book.set(entry.price, entry);
    } else {
      book.delete(entry.price);
    }
  }

  public clear(): void {
    this.buys.clear();
    this.sells.clear();
  }
}
