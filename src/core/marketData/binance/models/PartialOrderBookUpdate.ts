import { Entry } from "../../models/Entry";

type BinancePartialOrderbookStreamData = {
  lastUpdateId: number;
  bids: [string, string][];
  asks: [string, string][];
};

export class PartialOrderBookUpdate {
  public static getEntries(data: BinancePartialOrderbookStreamData): Entry[] {
    const bids = data.bids.map(
      (entry) =>
        new Entry({
          price: parseFloat(entry[0]),
          qtyProfile: [parseFloat(entry[1])],
          side: "bid",
          transactionId: data.lastUpdateId
        })
    );

    const asks = data.asks.map(
      (entry) =>
        new Entry({
          price: parseFloat(entry[0]),
          qtyProfile: [parseFloat(entry[1])],
          side: "ask",
          transactionId: data.lastUpdateId
        })
    );

    return [...bids, ...asks];
  }
}
