import { parseUtcMs } from './merge-live-candles';
import { Candle } from '../../../modules/shared/models/chart/candle.dto';

export interface InternalCandle {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
  timeStr?: string;
}

function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : NaN;
}

function readTime(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw < 1e12 ? raw * 1000 : raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const asNum = Number(raw);
    if (Number.isFinite(asNum)) {
      return asNum < 1e12 ? asNum * 1000 : asNum;
    }
    return parseUtcMs(raw);
  }
  return NaN;
}

export function normalizeInternalCandle(
  raw: Partial<InternalCandle> & Record<string, unknown>,
): InternalCandle | null {
  const x = readTime(raw['x'] ?? raw['Time'] ?? raw['time'] ?? raw['timestamp']);
  const o = toNumber(raw['o'] ?? raw['Open'] ?? raw['open']);
  const h = toNumber(raw['h'] ?? raw['High'] ?? raw['high']);
  const l = toNumber(raw['l'] ?? raw['Low'] ?? raw['low']);
  const c = toNumber(raw['c'] ?? raw['Close'] ?? raw['close']);
  const v = toNumber(raw['v'] ?? raw['Volume'] ?? raw['volume']);

  if (!Number.isFinite(x) || !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) {
    return null;
  }

  return {
    x,
    o,
    h,
    l,
    c,
    v: Number.isFinite(v) ? v : 0,
    timeStr:
      typeof raw['timeStr'] === 'string'
        ? raw['timeStr']
        : typeof raw['Time'] === 'string'
          ? raw['Time']
          : undefined,
  };
}

export function mapApiCandlesToInternal(candles: Candle[]): InternalCandle[] {
  return (candles || [])
    .map((c) =>
      normalizeInternalCandle({
        Time: c.Time,
        Open: c.Open,
        High: c.High,
        Low: c.Low,
        Close: c.Close,
        Volume: c.Volume,
        timeStr: c.Time,
      }),
    )
    .filter((c): c is InternalCandle => c !== null);
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
