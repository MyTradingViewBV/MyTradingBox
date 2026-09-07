import {
  BaseCandleSnapshot,
  LiveCandleUpdate,
} from '../models/live-candle-update';
import {
  getTimeframeBucketEnd,
  getTimeframeBucketStart,
  isOneMinuteTimeframe,
  normalizeTimeframe,
} from './timeframe-bucketing';

interface BucketState {
  bucketStart: number;
  open: number;
  high: number;
  low: number;
  close: number;
  committedVolume: number;
  liveVolume: number;
}

export class SymbolCandleAggregator {
  private readonly buckets = new Map<string, BucketState>();

  update(
    symbol: string,
    baseCandle: BaseCandleSnapshot,
    isBaseClosed: boolean,
    timeframes: Iterable<string>,
  ): LiveCandleUpdate[] {
    const updates: LiveCandleUpdate[] = [];

    for (const timeframe of timeframes) {
      const normalized = normalizeTimeframe(timeframe);
      if (isOneMinuteTimeframe(normalized)) {
        updates.push(this.toUpdate(symbol, normalized, baseCandle, isBaseClosed));
        continue;
      }

      const bucketStart = getTimeframeBucketStart(baseCandle.time, normalized);
      const bucketEnd = getTimeframeBucketEnd(bucketStart, normalized);
      const existing = this.buckets.get(normalized);

      if (!existing || existing.bucketStart !== bucketStart) {
        if (existing && existing.bucketStart < bucketStart) {
          updates.push(this.bucketToUpdate(symbol, normalized, existing, true));
        }

        this.buckets.set(normalized, {
          bucketStart,
          open: baseCandle.open,
          high: baseCandle.high,
          low: baseCandle.low,
          close: baseCandle.close,
          committedVolume: 0,
          liveVolume: baseCandle.volume,
        });
      } else {
        existing.high = Math.max(existing.high, baseCandle.high);
        existing.low = Math.min(existing.low, baseCandle.low);
        existing.close = baseCandle.close;
        existing.liveVolume = baseCandle.volume;
      }

      const state = this.buckets.get(normalized);
      if (!state) continue;

      const isLastMinuteOfBucket = baseCandle.time + 60_000 >= bucketEnd;
      if (isBaseClosed) {
        state.committedVolume += state.liveVolume;
        state.liveVolume = 0;
      }

      updates.push(
        this.bucketToUpdate(
          symbol,
          normalized,
          state,
          isBaseClosed && isLastMinuteOfBucket,
        ),
      );
    }

    return updates;
  }

  seed(timeframe: string, candles: BaseCandleSnapshot[]): void {
    const normalized = normalizeTimeframe(timeframe);
    if (isOneMinuteTimeframe(normalized)) return;
    const ordered = [...candles].sort((a, b) => a.time - b.time);
    if (!ordered.length || this.buckets.has(normalized)) return;

    const bucketStart = getTimeframeBucketStart(ordered[0].time, normalized);
    this.buckets.set(normalized, {
      bucketStart,
      open: ordered[0].open,
      high: Math.max(...ordered.map((candle) => candle.high)),
      low: Math.min(...ordered.map((candle) => candle.low)),
      close: ordered[ordered.length - 1].close,
      committedVolume: ordered.reduce((sum, candle) => sum + candle.volume, 0),
      liveVolume: 0,
    });
  }

  private toUpdate(
    symbol: string,
    interval: string,
    candle: BaseCandleSnapshot,
    isClosed: boolean,
  ): LiveCandleUpdate {
    return {
      symbol: symbol.toUpperCase(),
      interval,
      openTime: candle.time,
      closeTime: candle.time + 60_000,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      isClosed,
    };
  }

  private bucketToUpdate(
    symbol: string,
    interval: string,
    state: BucketState,
    isClosed: boolean,
  ): LiveCandleUpdate {
    return {
      symbol: symbol.toUpperCase(),
      interval,
      openTime: state.bucketStart,
      closeTime: getTimeframeBucketEnd(state.bucketStart, interval),
      open: state.open,
      high: state.high,
      low: state.low,
      close: state.close,
      volume: state.committedVolume + state.liveVolume,
      isClosed,
    };
  }
}
