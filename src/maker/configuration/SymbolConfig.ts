export interface SideConfig {
  enabled: boolean;
  spreadInPercents: number;
  limitCount: number;
  limitDistanceInPercents: number;
  qty: bigint;
}

export interface SymbolConfig {
  symbol: string;
  sourceSymbol: string;
  bids: SideConfig;
  asks: SideConfig;
  modifySpreadInPercents: number;
  contractAddress: string;
  network: string;
  pricePrecision: number;
}
