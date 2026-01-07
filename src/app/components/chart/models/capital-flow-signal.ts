export interface CapitalFlowSignal {
  id: number;
  exchangeId: number;
  symbol: string;
  timeframe: string;
  signalType: string;
  isBullish: boolean;
  endTime: string;        // ISO string
  glyph: string;          // already provided by backend
  priority: number;
  description: string;
  createdAt: string;      // ISO string
}
