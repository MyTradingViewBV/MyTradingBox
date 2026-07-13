import { parseUtcMs } from './merge-live-candles';

export interface InternalCandle {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
  timeStr?: string;
}

export function mapApiCandlesToInternal(
  candles: Array<{
    Time: string;
    Open: number;
    High: number;
    Low: number;
    Close: number;
    Volume?: number;
  }>,
): InternalCandle[] {
  return (candles || []).map((c) => ({
    x: parseUtcMs(c.Time),
    timeStr: c.Time,
    o: c.Open,
    h: c.High,
    l: c.Low,
    c: c.Close,
    v: c.Volume ?? 0,
  }));
}

export function aggregateToLiveCandle(
  candles: InternalCandle[],
  periodStart: number,
): InternalCandle {
  const first = candles[0];
  const last = candles[candles.length - 1];
  return {
    x: periodStart,
    o: first.o,
    h: Math.max(...candles.map((c) => c.h)),
    l: Math.min(...candles.map((c) => c.l)),
    c: last.c,
    v: candles.reduce((sum, c) => sum + (c.v ?? 0), 0),
  };
}

export function applyLiveCandleToBaseData(
  baseData: InternalCandle[],
  liveCandle: InternalCandle,
): InternalCandle[] {
  if (!baseData?.length) return baseData;
  const last = baseData[baseData.length - 1];
  if (last.x === liveCandle.x) {
    return [...baseData.slice(0, -1), { ...last, ...liveCandle }];
  }
  if (liveCandle.x > (last?.x ?? 0)) {
    return [...baseData, liveCandle];
  }
  return baseData;
}

export function dominanceTimeframeToPeriodMs(timeframe: string): number {
  const map: Record<string, number> = {
    '12m': 12 * 60 * 1000,
    '24m': 24 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1M': 30 * 24 * 60 * 60 * 1000,
  };
  return map[timeframe] ?? 0;
}

export function isDominanceSymbol(symbolName: string): boolean {
  return /DOMINANCE|BTC\.D|ALT\.D|USDT\.D/.test((symbolName || '').toUpperCase());
}

export function isBinanceExchange(exchangeName: string | undefined | null): boolean {
  return (exchangeName || '').toLowerCase().includes('binance');
}
