import { ISymbolConfig } from "./ISymbolConfig";
import { INetworkConfig } from "./INetworkConfig";

export interface IClientConfig {
  symbols: Record<string, ISymbolConfig>;
  networks: Record<string, INetworkConfig>;

  getSymbol(symbol: string): ISymbolConfig;
  getSymbolByContract(contractAddress: string): ISymbolConfig | undefined;
  getNetwork(name: string): INetworkConfig;
}
