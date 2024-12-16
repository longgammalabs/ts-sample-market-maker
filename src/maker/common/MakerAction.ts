import BigNumber from "bignumber.js";
import { Side } from "onchain-lob-sdk";

export type MakerCancelAction = {
  type: "cancel";
  orderId: string;
  symbol: string;
  price: BigNumber;
};

export type MakerPlaceAction = {
  type: "place";
  symbol: string;
  side: Side;
  price: BigNumber;
  qty: bigint;
};
