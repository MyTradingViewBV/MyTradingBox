export interface LiveCandleUpdate {
  symbol: string;
  interval: string;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: boolean;
}

export interface BaseCandleSnapshot {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
