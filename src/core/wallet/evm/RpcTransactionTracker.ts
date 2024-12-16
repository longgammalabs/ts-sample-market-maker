import logger from "../../logger";
import { EventEmitter } from "../../eventEmitter";
import { Provider, TransactionReceipt } from "ethers";

export type TrackerErrorEvent = {
  symbol: string;
  txId: string;
  error: Error;
};

export type TrackerReceiptReceivedEvent = {
  symbol: string;
  receipt: TransactionReceipt;
};

export class RpcTransactionTracker {
  static readonly TRACKING_ERROR = "TRACKING_ERROR";
  static readonly TIMEOUT_REACHED_ERROR = "TIMEOUT_REACHED";

  public receiptReceived = new EventEmitter<[event: TrackerReceiptReceivedEvent]>();
  public errorReceived = new EventEmitter<[event: TrackerErrorEvent]>();
  public cancelled = new EventEmitter<[event: TrackerErrorEvent]>();

  public async trackTransactionAsync(
    symbol: string,
    txId: string,
    rpc: Provider,
    updateInterval: number,
    timeOut: number | null = null
  ) {
    try {
      const startTimeStamp = Date.now();

      while (true) {
        if (timeOut !== null && Date.now() >= startTimeStamp + timeOut) {
          logger.debug({
            at: "RpcTransactionTracker#trackTransactionAsync",
            message: `Timeout reached waiting receipt for ${txId}`
          });
          this.cancelled.emit({
            symbol,
            txId,
            error: {
              name: RpcTransactionTracker.TIMEOUT_REACHED_ERROR,
              message: "Timeout reached"
            }
          });
          return;
        }
        const receipt = await rpc.getTransactionReceipt(txId);

        if (receipt !== null) {
          this.receiptReceived.emit({ symbol, receipt });
          return;
        }

        logger.info({
          at: "RpcTransactionTracker#trackTransactionAsync",
          message: `Waiting for receipt for ${txId}`
        });

        await new Promise((resolve) => setTimeout(resolve, updateInterval));
      }
    } catch (e) {
      logger.debug({
        at: "RpcTransactionTracker#trackTransactionAsync",
        message: `Error catched waiting receipt for ${txId}: ${e.toString()}`
      });
      this.errorReceived.emit({
        symbol,
        txId,
        error: {
          name: RpcTransactionTracker.TRACKING_ERROR,
          message: `Transaction tracker error: ${e.toString()}`
        }
      });
    }
  }
}
