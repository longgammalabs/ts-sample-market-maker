export class BinanceSymbols {
  private static readonly _symbols: { [key: string]: string } = {
    "ETH/BTC": "ethbtc",
    "LTC/BTC": "ltcbtc",
    "XTZ/BTC": "xtzbtc",
    "XTZ/ETH": "xtzeth",
    "BTC/USDT": "btcusdt",
    "ETH/USDT": "ethusdt",
    "LTC/USDT": "ltcusdt",
    "XTZ/USDT": "xtzusdt"
  };

  public static getSymbol(symbol: string): string | null {
    return this._symbols[symbol] || null;
  }

  public static getRestSymbol(symbol: string): string | null {
    return this._symbols[symbol] ? this._symbols[symbol].toUpperCase() : null;
  }
}
