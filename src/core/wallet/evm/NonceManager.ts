import logger from "../../logger";
import { Provider } from "ethers";
import { DefaultBlock } from "./rpc/DefaultBlock";

type NonceEntry = {
  lastUpdated: number;
  nonce: bigint;
};

export class NonceManager {
  private static NONCE_FORCE_UPDATE_INTERVAL_SEC = 3 * 60;
  private static NONCE_VALID_PERIOD_SEC = 60;

  private offlineNonces: Map<string, NonceEntry>;
  private networkNonces: Map<string, NonceEntry>;

  private static instance: NonceManager | null = null;

  private constructor() {
    this.offlineNonces = new Map<string, NonceEntry>();
    this.networkNonces = new Map<string, NonceEntry>();
  }

  public static getInstance(): NonceManager {
    if (this.instance === null) {
      this.instance = new NonceManager();
    }
    return this.instance;
  }

  public async getNonceAsync(rpc: Provider, address: string, pending: boolean = true): Promise<bigint> {
    const nonce = BigInt(await rpc.getTransactionCount(address, pending ? DefaultBlock.Pending : DefaultBlock.Latest));
    const nonceTimeStamp = Date.now();
    logger.debug({
      at: "NonceManager#getNonceAsync",
      message: `Nonce from network: ${nonce.toString()}`
    });

    let cachedNonceEntry = this.networkNonces.get(address);
    if (cachedNonceEntry && cachedNonceEntry.nonce > nonce) {
      logger.warning({
        at: "NonceManager#getNonceAsync",
        message: `Network nonce ${nonce.toString()} less than last network nonce ${cachedNonceEntry.nonce.toString()} `
      });
    }

    if (
      !cachedNonceEntry ||
      cachedNonceEntry.nonce !== nonce ||
      nonceTimeStamp - cachedNonceEntry.lastUpdated >= NonceManager.NONCE_FORCE_UPDATE_INTERVAL_SEC * 1000
    ) {
      this.networkNonces.set(address, { nonce, lastUpdated: nonceTimeStamp });
    }

    cachedNonceEntry = this.networkNonces.get(address)!;

    const offlineNonceEntry = this.offlineNonces.get(address);
    const currentNonce =
      offlineNonceEntry &&
      offlineNonceEntry.nonce > cachedNonceEntry.nonce &&
      offlineNonceEntry.lastUpdated - cachedNonceEntry.lastUpdated < NonceManager.NONCE_VALID_PERIOD_SEC * 1000
        ? offlineNonceEntry.nonce
        : nonce;

    if (
      offlineNonceEntry &&
      offlineNonceEntry.lastUpdated - cachedNonceEntry.lastUpdated >= NonceManager.NONCE_VALID_PERIOD_SEC * 1000
    ) {
      logger.warning({
        at: "NonceManager#getNonceAsync",
        message: `Network nonce lags behind offline nonce by more than ${(offlineNonceEntry.lastUpdated - cachedNonceEntry.lastUpdated) / 1000}
seconds`
      });
    }

    this.offlineNonces.set(address, {
      nonce: currentNonce + 1n,
      lastUpdated: Date.now()
    });

    return currentNonce;
  }
}
