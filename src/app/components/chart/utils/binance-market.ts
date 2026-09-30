/**
 * Single source of truth for which Binance market (spot vs USDT-M futures) an
 * exchange id maps to, and which WebSocket host serves it.
 *
 * Exchange ids (see Bots/BotShared/Connectors/ExchangeCandleServiceFactory.cs):
 *   production 1=BYBIT, 2=BINANCE, 3=KRAKEN, 4=BITVAVO
 *   test       6=BYBIT, 7=BINANCE, 8=KRAKEN, 9=BITVAVO
 * The backend serves Binance candles from USDT-M futures (fapi.binance.com /
 * fstream.binance.com) for both 2 and 7, so every browser-side Binance stream
 * must use the futures host too — otherwise prices differ from the chart data
 * and futures-only symbols (e.g. 1000PEPEUSDT) never tick.
 */
export type BinanceMarket = 'spot' | 'futures';

export const BINANCE_EXCHANGE_IDS: readonly number[] = [2, 7];

/** Default Binance exchange id used when a caller does not pass one. */
export const DEFAULT_BINANCE_EXCHANGE_ID = 2;

const BINANCE_MARKET_BY_EXCHANGE_ID: Readonly<Record<number, BinanceMarket>> = {
  2: 'futures',
  7: 'futures',
};

const BINANCE_WS_BASE: Readonly<Record<BinanceMarket, string>> = {
  spot: 'wss://stream.binance.com:9443',
  futures: 'wss://fstream.binance.com',
};

export function isBinanceExchangeId(exchangeId: number | null | undefined): boolean {
  return BINANCE_EXCHANGE_IDS.includes(Number(exchangeId));
}

export function binanceMarketForExchange(
  exchangeId: number | null | undefined = DEFAULT_BINANCE_EXCHANGE_ID,
): BinanceMarket {
  return BINANCE_MARKET_BY_EXCHANGE_ID[Number(exchangeId)] ?? 'futures';
}

export function binanceWsBaseUrl(market: BinanceMarket): string {
  return BINANCE_WS_BASE[market];
}

const STREAM_SYMBOL_PATTERN = /^[A-Z0-9_-]+$/;

/**
 * Upper-cases/trims a symbol and returns it only if it is safe to embed in a
 * stream URL or subscribe message; returns null (and warns) otherwise.
 */
export function sanitizeStreamSymbol(symbol: string, context = 'stream'): string | null {
  const normalized = (symbol || '').toUpperCase().trim();
  if (!normalized) return null;
  if (!STREAM_SYMBOL_PATTERN.test(normalized)) {
    console.warn(`[${context}] Skipping invalid stream symbol`, symbol);
    return null;
  }
  return normalized;
}

/**
 * Combined-stream URL (`/stream?streams=a/b/c`) for the given stream names.
 * Stream names must be built from symbols that passed `sanitizeStreamSymbol`
 * (the `@` separator is kept literal; Binance does not accept it encoded).
 */
export function binanceCombinedStreamUrl(market: BinanceMarket, streams: string[]): string {
  return `${binanceWsBaseUrl(market)}/stream?streams=${streams.join('/')}`;
}

/** Combined-stream URL of `<symbol>@miniTicker` streams for valid symbols. */
export function binanceMiniTickerUrl(market: BinanceMarket, symbols: string[]): string {
  return binanceCombinedStreamUrl(
    market,
    symbols.map((s) => `${s.toLowerCase()}@miniTicker`),
  );
}
