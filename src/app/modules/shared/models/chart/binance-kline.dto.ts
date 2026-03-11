/**
 * Binance WebSocket kline (candlestick) stream models
 * Reference: https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-streams
 */

/** Raw Binance kline object from websocket payload */
export interface BinanceKlineData {
  t: number; // Kline open time
  T: number; // Kline close time
  s: string; // Symbol
  i: string; // Interval
  f: number; // First trade ID
  L: number; // Last trade ID
  o: string; // Open price (numeric string)
  c: string; // Close price (numeric string)
  h: string; // High price (numeric string)
  l: string; // Low price (numeric string)
  v: string; // Base asset volume (numeric string)
  n: number; // Number of trades
  x: boolean; // Is this kline closed
  q: string; // Quote asset volume (numeric string)
  V: string; // Taker buy base asset volume (numeric string)
  Q: string; // Taker buy quote asset volume (numeric string)
  B: string; // Ignore
}

/** Raw Binance WebSocket kline stream event */
export interface BinanceKlineEvent {
  e: string; // Event type (should be "kline")
  E: number; // Event time
  s: string; // Symbol
  k: BinanceKlineData; // Kline data
}

/** Normalized live kline update for app consumption */
export interface LiveKlineUpdate {
  symbol: string; // Uppercase symbol (e.g., "BTCUSDT")
  interval: string; // Interval (e.g., "1m", "1h")
  openTime: number; // milliseconds
  closeTime: number; // milliseconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean; // true if kline is finalized, false if still open
}
