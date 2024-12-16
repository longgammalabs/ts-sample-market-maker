import { Side } from "onchain-lob-sdk";

export class Entry {
  public transactionId: number;
  public side: Side;
  public price: number;
  public qtyProfile: number[];

  constructor({
    transactionId,
    side,
    price,
    qtyProfile
  }: {
    transactionId: number;
    side: Side;
    price: number;
    qtyProfile: number[];
  }) {
    this.transactionId = transactionId;
    this.side = side;
    this.price = price;
    this.qtyProfile = qtyProfile;
  }

  public qty(): number {
    return this.qtyProfile.reduce((a, b) => a + b, 0);
  }
}
