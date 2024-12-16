import { INetworkConfig } from "../../core/configuration/INetworkConfig";

export class NetworkConfig implements INetworkConfig {
  public rpcNode: string;
  public chainId: number;

  constructor(rpcNode: string, chainId: number) {
    this.rpcNode = rpcNode;
    this.chainId = chainId;
  }
}
