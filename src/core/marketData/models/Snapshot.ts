import { Entry } from "./Entry";

export class Snapshot {
  public lastTransactionId: number;
  public symbol: string;
  public entries: Entry[];
  constructor({ lastTransactionId, symbol, entries }: { lastTransactionId: number; symbol: string; entries: Entry[] }) {
    this.lastTransactionId = lastTransactionId;
    this.symbol = symbol;
    this.entries = entries;
  }
}
