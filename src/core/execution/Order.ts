import BigNumber from "bignumber.js";
import { Side, Order as OnchainLobOrder } from "onchain-lob-sdk";

export enum OrderStatus {
  Pending,
  Placed,
  PartiallyFilled,
  PartiallyFilledAndClaimed,
  Filled,
  FilledAndClaimed,
  Canceled,
  CanceledAndClaimed,
  Failed // Rejected
}

export enum OrderType {
  Return,
  FillOrKill,
  ImmediateOrCancel
}

export class Order {
  orderId: string;
  price: BigNumber;
  qty: bigint;
  leaveQty: bigint;
  claimedQty: bigint;
  side: Side;
  symbol: string;
  status: OrderStatus;
  type: OrderType;
  created: Date;
  lastChanged: Date;
  txnHash: string;

  constructor({
    orderId,
    price,
    qty,
    leaveQty,
    claimedQty,
    side,
    symbol,
    status,
    type,
    created,
    lastChanged,
    txnHash
  }: {
    orderId: string;
    price: BigNumber;
    qty: bigint;
    leaveQty: bigint;
    claimedQty: bigint;
    side: Side;
    symbol: string;
    status: OrderStatus;
    type: OrderType;
    created: Date;
    lastChanged: Date;
    txnHash: string;
  }) {
    this.orderId = orderId;
    this.price = price;
    this.qty = qty;
    this.leaveQty = leaveQty;
    this.claimedQty = claimedQty;
    this.side = side;
    this.symbol = symbol;
    this.status = status;
    this.type = type;
    this.created = created;
    this.lastChanged = lastChanged;
    this.txnHash = txnHash;
  }

  static fromOnchainLobOrder(order: OnchainLobOrder, symbol: string): Order {
    const qty = order.rawOrigSize;
    const leaveQty = order.rawSize;
    const claimedQty = order.rawClaimed;
    const executedQty = qty - leaveQty;
    const isUnclaimed = claimedQty < executedQty;

    let status;
    switch (order.status.toLowerCase()) {
      case "open":
        status = leaveQty === qty ? OrderStatus.Placed : OrderStatus.PartiallyFilled;
        break;
      case "filled":
        status = OrderStatus.Filled;
        break;
      case "cancelled":
        status = isUnclaimed ? OrderStatus.Canceled : OrderStatus.CanceledAndClaimed;
        break;
      case "claimed":
        status = claimedQty < qty ? OrderStatus.PartiallyFilledAndClaimed : OrderStatus.FilledAndClaimed;
        break;
      default:
        throw new Error(`Unknown order status`);
    }

    return new Order({
      orderId: order.orderId,
      price: order.price,
      qty: qty,
      leaveQty: leaveQty,
      claimedQty: claimedQty,
      side: order.side,
      symbol: symbol,
      type: OrderType.Return,
      created: new Date(order.createdAt),
      lastChanged: new Date(order.lastTouched),
      status: status,
      txnHash: order.txnHash
    });
  }

  isActive(): boolean {
    return this.status === OrderStatus.Placed || this.status === OrderStatus.PartiallyFilled;
  }

  isUnclaimed(): boolean {
    return this.claimedQty < this.qty - this.leaveQty && this.status !== OrderStatus.Failed;
  }
}
