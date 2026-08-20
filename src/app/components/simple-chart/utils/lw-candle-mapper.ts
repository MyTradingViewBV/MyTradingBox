import { UTCTimestamp } from 'lightweight-charts';
import { InternalCandle, normalizeInternalCandle } from '../../chart/utils/custom-timeframe-live';

export interface LwCandle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function msToLwTime(ms: number): UTCTimestamp {
  return Math.floor(Number(ms) / 1000) as UTCTimestamp;
}

export function internalToLwCandle(candle: InternalCandle): LwCandle {
  return {
    time: msToLwTime(candle.x),
    open: candle.o,
    high: candle.h,
    low: candle.l,
    close: candle.c,
  };
}

/** Sort, dedupe, and validate candles before setData. */
export function prepareLwSeriesData(candles: InternalCandle[]): LwCandle[] {
  const sorted = [...(candles || [])]
    .map((c) => normalizeInternalCandle(c as InternalCandle & Record<string, unknown>))
    .filter((c): c is InternalCandle => c !== null)
    .sort((a, b) => a.x - b.x);

  const byTime = new Map<number, LwCandle>();
  for (const candle of sorted) {
    byTime.set(msToLwTime(candle.x), internalToLwCandle(candle));
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

export function isIntradayTimeframe(timeframe: string): boolean {
  const tf = (timeframe || '').toLowerCase();
  return tf.endsWith('m') || tf.endsWith('h') || tf === '12m' || tf === '24m';
}
