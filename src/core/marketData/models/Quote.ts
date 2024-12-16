export class Quote {
  public symbol: string;
  public timeStamp: Date;
  public bid: number;
  public ask: number;

  constructor({ symbol, timeStamp, bid, ask }: { symbol: string; timeStamp: Date; bid: number; ask: number }) {
    this.symbol = symbol;
    this.timeStamp = timeStamp;
    this.bid = bid;
    this.ask = ask;
  }

  public isValidBid(): boolean {
    return this.bid !== 0;
  }

  public isValidAsk(): boolean {
    return this.ask !== 0 && this.ask !== Number.MAX_VALUE;
  }

  public getMiddlePrice(): number {
    return this.isValidBid() && this.isValidAsk()
      ? (this.ask + this.bid) / 2
      : this.isValidBid()
        ? this.bid
        : this.isValidAsk()
          ? this.ask
          : 0;
  }
}
