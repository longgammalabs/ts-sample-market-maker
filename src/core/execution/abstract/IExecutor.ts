import BigNumber from "bignumber.js";
import { Side } from "onchain-lob-sdk";
import { Order } from "../Order";
import { EventEmitter } from "../../eventEmitter";

export interface IExecutor {
  ordersChanged: EventEmitter<[data: Order[]]>;
  availabilityChanged: EventEmitter<[isAvailable: boolean]>;

  isOrderCanceled(symbol: string, orderId: string): boolean;
  getActiveOrders(symbol: string): Order[];
  getPendingOrders(symbol: string): Order[];

  orderSendAsync(
    symbol: string,
    price: BigNumber,
    qty: bigint,
    side: Side,
    marketOnly?: boolean,
    fireAndForget?: boolean
  ): Promise<void>;

  orderCancelAsync(orderId: string, symbol: string): Promise<void>;
}
