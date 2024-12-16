import { EventEmitter } from "../../eventEmitter";
import { OrderBook } from "../OrderBook";

export interface IOrderBookProvider {
  orderBookUpdated: EventEmitter<[orderbook: OrderBook]> | null;
  availabilityChanged: EventEmitter<[isAvailable: boolean]> | null;
  isAvailable: boolean;
}
