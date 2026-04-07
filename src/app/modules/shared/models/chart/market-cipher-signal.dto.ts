export interface MarketCipherSignal {
  id?: number;
  exchangeId?: number;
  symbol?: string;
  timeframe?: string;
  signalType?: string;
  direction?: string;
  strength?: number;
  timestamp?: string;
  [key: string]: unknown;
}
