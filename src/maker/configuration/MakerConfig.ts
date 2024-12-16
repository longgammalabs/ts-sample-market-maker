import { IClientConfig } from "../../core/configuration/IClientConfig";
import { INetworkConfig } from "../../core/configuration/INetworkConfig";
import { ISymbolConfig } from "../../core/configuration/ISymbolConfig";
import { NetworkConfig } from "./NetworkConfig";
import { SymbolConfig } from "./SymbolConfig";
import { ConfigMakerType } from "../config";

export class MakerConfig implements IClientConfig {
  public symbols: Record<string, SymbolConfig>;
  public networks: Record<string, NetworkConfig>;
  public tokens: Record<string, string>;

  constructor({ symbols, networks, tokens }: ConfigMakerType) {
    Object.values(symbols).forEach((symbol) => {
      symbol.contractAddress = symbol.contractAddress.toLowerCase();
      (symbol as unknown as SymbolConfig).asks.qty = BigInt(symbol.asks.qty);
      (symbol as unknown as SymbolConfig).bids.qty = BigInt(symbol.bids.qty);
    });
    this.symbols = symbols as unknown as Record<string, SymbolConfig>;
    this.networks = networks;
    this.tokens = tokens;
  }

  getSymbols(): ISymbolConfig[] {
    return Object.values(this.symbols);
  }

  getNetworks(): INetworkConfig[] {
    return Object.values(this.networks);
  }

  public getNetwork(name: string): INetworkConfig {
    return this.networks[name];
  }

  public getSymbol(symbol: string): ISymbolConfig {
    return this.symbols[symbol];
  }

  public getSymbolByContract(contractAddress: string): ISymbolConfig | undefined {
    return Object.values(this.symbols).find((s) => s.contractAddress.toLowerCase() === contractAddress.toLowerCase());
  }
}
