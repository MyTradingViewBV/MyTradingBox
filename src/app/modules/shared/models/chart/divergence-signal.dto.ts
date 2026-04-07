export interface DivergenceSignal {
  id?: number;
  exchangeId?: number;
  symbol?: string;
  timeframe?: string;
  divergenceType?: string;
  isBullish?: boolean;
  startTime?: string;
  endTime?: string;
  [key: string]: unknown;
}
