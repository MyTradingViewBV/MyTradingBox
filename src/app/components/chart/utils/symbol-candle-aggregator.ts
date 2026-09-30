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
  /** Volume of fully closed (or superseded) minutes in this bucket. */
  committedVolume: number;
  /** Volume of the currently forming minute (`liveMinute`), replaced on every tick. */
  liveVolume: number;
  /** Open time of the minute whose volume is held in `liveVolume` (NaN = none). */
  liveMinute: number;
  /** Open time of the last minute whose close was committed (NaN = none). */
  closedMinute: number;
}

const MINUTE_MS = 60_000;

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
        updates.push(
          this.toUpdate(symbol, normalized, baseCandle, isBaseClosed),
        );
        continue;
      }

      const bucketStart = getTimeframeBucketStart(baseCandle.time, normalized);
      const bucketEnd = getTimeframeBucketEnd(bucketStart, normalized);
      const existing = this.buckets.get(normalized);

      // Late message for an older bucket: never let it replace the current one.
      if (existing && bucketStart < existing.bucketStart) continue;

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
          liveMinute: baseCandle.time,
          closedMinute: NaN,
        });
      } else {
        const hasLiveMinute = Number.isFinite(existing.liveMinute);
        // Late message for an older minute inside the current bucket: its
        // volume was already committed when the newer minute arrived, and its
        // close is no longer the bucket's close.
        if (hasLiveMinute && baseCandle.time < existing.liveMinute) continue;

        if (!hasLiveMinute || baseCandle.time > existing.liveMinute) {
          // New minute without having seen the previous minute's close: commit
          // whatever volume the previous minute reached.
          existing.committedVolume += existing.liveVolume;
          existing.liveMinute = baseCandle.time;
        }
        existing.high = Math.max(existing.high, baseCandle.high);
        existing.low = Math.min(existing.low, baseCandle.low);
        existing.close = baseCandle.close;
        // A repeated message for a minute already committed must not add its volume again.
        if (baseCandle.time !== existing.closedMinute) {
          existing.liveVolume = baseCandle.volume;
        }
      }

      const state = this.buckets.get(normalized);
      if (!state) continue;

      const isLastMinuteOfBucket = baseCandle.time + MINUTE_MS >= bucketEnd;
      if (isBaseClosed && baseCandle.time !== state.closedMinute) {
        state.committedVolume += state.liveVolume;
        state.liveVolume = 0;
        state.closedMinute = baseCandle.time;
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

  /**
   * Seed the current bucket from 1m history. Rows at or after the currently
   * forming minute (`floor(nowMs / 60s)`) are still growing: their OHLC is
   * used, but their volume is held as live volume (replaced by the stream's
   * next tick for that minute) instead of being committed, so it is not
   * counted twice.
   */
  seed(
    timeframe: string,
    candles: BaseCandleSnapshot[],
    nowMs = Date.now(),
  ): void {
    const normalized = normalizeTimeframe(timeframe);
    if (isOneMinuteTimeframe(normalized)) return;
    const ordered = (candles || [])
      .filter((candle) => !!candle && Number.isFinite(candle.time))
      .sort((a, b) => a.time - b.time);
    if (!ordered.length) return;

    const bucketStart = getTimeframeBucketStart(ordered[0].time, normalized);
    const inBucket = ordered.filter(
      (candle) =>
        getTimeframeBucketStart(candle.time, normalized) === bucketStart,
    );
    const existing = this.buckets.get(normalized);

    if (existing && existing.bucketStart !== bucketStart) {
      return;
    }

    const formingMinute = Math.floor(nowMs / MINUTE_MS) * MINUTE_MS;
    let committedVolume = 0;
    let liveVolume = 0;
    let liveMinute = NaN;
    for (const candle of inBucket) {
      const volume = Number.isFinite(candle.volume) ? candle.volume : 0;
      if (candle.time >= formingMinute) {
        liveVolume = volume;
        liveMinute = candle.time;
      } else {
        committedVolume += volume;
      }
    }
    if (!Number.isFinite(liveMinute)) {
      // Every seeded minute is closed; the stream's next minute starts fresh.
      liveMinute = inBucket[inBucket.length - 1].time;
    }

    this.buckets.set(normalized, {
      bucketStart,
      open: inBucket[0].open,
      high: Math.max(...inBucket.map((candle) => candle.high)),
      low: Math.min(...inBucket.map((candle) => candle.low)),
      close: inBucket[inBucket.length - 1].close,
      committedVolume,
      liveVolume,
      liveMinute,
      closedMinute: NaN,
    });
  }

  /**
   * Seed the current bucket from a single target-timeframe candle (used when
   * the bucket is too long to rebuild from 1m history, e.g. 1w / 1M). Its
   * volume is treated as committed; the stream's minutes are added on top.
   */
  seedBucket(timeframe: string, candle: BaseCandleSnapshot): void {
    const normalized = normalizeTimeframe(timeframe);
    if (
      isOneMinuteTimeframe(normalized) ||
      !candle ||
      !Number.isFinite(candle.time)
    )
      return;
    const bucketStart = getTimeframeBucketStart(candle.time, normalized);
    const existing = this.buckets.get(normalized);
    if (existing && existing.bucketStart !== bucketStart) return;

    this.buckets.set(normalized, {
      bucketStart,
      open: candle.open,
      high: existing ? Math.max(candle.high, existing.high) : candle.high,
      low: existing ? Math.min(candle.low, existing.low) : candle.low,
      close: existing ? existing.close : candle.close,
      committedVolume: Number.isFinite(candle.volume) ? candle.volume : 0,
      liveVolume: 0,
      liveMinute: NaN,
      closedMinute: NaN,
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
      closeTime: candle.time + MINUTE_MS,
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
