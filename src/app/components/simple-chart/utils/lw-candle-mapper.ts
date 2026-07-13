import { UTCTimestamp } from 'lightweight-charts';
import { Candle } from '../../../modules/shared/models/chart/candle.dto';
import { InternalCandle } from '../../chart/utils/custom-timeframe-live';

export interface LwCandle {
  time: UTCTimestamp;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function msToLwTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1000) as UTCTimestamp;
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

export function internalArrayToLw(candles: InternalCandle[]): LwCandle[] {
  return (candles || []).map(internalToLwCandle);
}

export function apiCandlesToInternal(candles: Candle[]): InternalCandle[] {
  return (candles || []).map((c) => ({
    x: new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(c.Time) ? c.Time : c.Time + 'Z').getTime(),
    timeStr: c.Time,
    o: c.Open,
    h: c.High,
    l: c.Low,
    c: c.Close,
    v: c.Volume ?? 0,
  }));
}

export function isIntradayTimeframe(timeframe: string): boolean {
  const tf = (timeframe || '').toLowerCase();
  return tf.endsWith('m') || tf.endsWith('h') || tf === '12m' || tf === '24m';
}
