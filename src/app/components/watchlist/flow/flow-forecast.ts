// Flow forecast: reads lower-timeframe candles (12m, 1h, 4h) plus the backend
// capital-flow signals and turns them into a direction score, a market state
// (continuation / reversal / collapse risk / sideways) and a projected price
// path that respects the support/resistance boxes.
//
// Everything here is pure so it can be unit tested without Angular.

export type FlowTimeframe = '12m' | '1h' | '4h';

export const FLOW_TIMEFRAMES: FlowTimeframe[] = ['12m', '1h', '4h'];

export interface FlowCandle {
  Open: number;
  High: number;
  Low: number;
  Close: number;
}

export interface FlowSignal {
  Timeframe: string;
  SignalType?: string | null;
  Tier?: string | null;
  IsBullish: boolean;
  IsBearish: boolean;
  BarsAgo: number | null;
}

export interface FlowBox {
  ZoneMin: number;
  ZoneMax: number;
  PositionType?: string;
  Type?: string;
  Color?: string;
}

export type FlowState =
  | 'trend-up'
  | 'trend-down'
  | 'reversal-up'
  | 'collapse-risk'
  | 'sideways';

export interface TimeframeFlow {
  timeframe: FlowTimeframe;
  /** -1 (strong down) .. +1 (strong up). */
  score: number;
  /** Direction of the last 3 closed candles: +1 green, -1 red, 0 doji. */
  lastCandles: number[];
}

export interface FlowForecast {
  /** -1 .. +1 overall direction, lower timeframes weigh most. */
  score: number;
  /** 0 .. 1, how much the timeframes agree. */
  confidence: number;
  state: FlowState;
  /** Bias of the higher frames (4h candles + 1d/1w capital flow). */
  higherBias: number;
  /** Momentum of the lower frames (12m + 1h candles + 1h capital flow). */
  lowerMomentum: number;
  timeframes: TimeframeFlow[];
  /** Average true range of the 1h candles, in price units. */
  atr1h: number;
  /** Last 1h closes (oldest first), used to draw the past part of the wave. */
  history: number[];
}

export type BoxTone = 'support' | 'resistance' | 'neutral';

export interface ProjectionPoint {
  /** Hours from now (0 = current price). */
  h: number;
  price: number;
  low: number;
  high: number;
}

export interface FlowProjection {
  points: ProjectionPoint[];
  target: number;
  targetPct: number;
  /** Box the projected path runs into, if any. */
  blockedBy?: { box: FlowBox; tone: BoxTone; outcome: 'reject' | 'break' };
}

const clamp = (v: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));

export function resolveBoxTone(box: FlowBox): BoxTone {
  const side = (box.PositionType || box.Type || box.Color || '')
    .toString()
    .toLowerCase();
  if (/short|sell|resistance|red|bear/.test(side)) return 'resistance';
  if (/long|buy|support|green|bull/.test(side)) return 'support';
  return 'neutral';
}

export function isZonedBox(b: FlowBox): boolean {
  return (
    Number.isFinite(b.ZoneMin) &&
    Number.isFinite(b.ZoneMax) &&
    b.ZoneMax > b.ZoneMin
  );
}

/**
 * Same selection as the old level bar: the two nearest boxes below price
 * (support side) and the two nearest at/above price (resistance side).
 */
export function selectVisibleBoxes(
  boxes: FlowBox[],
  price: number,
): { below: FlowBox[]; above: FlowBox[] } {
  const zoned = (boxes || []).filter(isZonedBox);
  const below = zoned
    .filter((b) => b.ZoneMax <= price)
    .sort((a, b) => b.ZoneMax - a.ZoneMax)
    .slice(0, 2);
  const above = zoned
    .filter((b) => b.ZoneMax > price)
    .sort((a, b) => a.ZoneMin - b.ZoneMin)
    .slice(0, 2);
  return { below, above };
}

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (const v of values) {
    prev = v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function averageTrueRange(candles: FlowCandle[], period = 14): number {
  if (!candles || candles.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].Close;
    trs.push(
      Math.max(
        c.High - c.Low,
        Math.abs(c.High - prevClose),
        Math.abs(c.Low - prevClose),
      ),
    );
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function candleDir(c: FlowCandle): number {
  const body = c.Close - c.Open;
  const range = c.High - c.Low || 1;
  if (Math.abs(body) / range < 0.1) return 0;
  return body > 0 ? 1 : -1;
}

/**
 * Score one timeframe from its candles:
 *  - 50% EMA(8) slope over the last 3 bars, measured in ATRs
 *  - 30% direction of the last 3 candles ("next 3x 1h = +")
 *  - 20% EMA(8) above/below EMA(21)
 */
export function scoreTimeframe(
  timeframe: FlowTimeframe,
  candles: FlowCandle[],
): TimeframeFlow | undefined {
  const valid = (candles || []).filter(
    (c) => Number.isFinite(c?.Close) && Number.isFinite(c?.Open),
  );
  if (valid.length < 10) return undefined;
  const closes = valid.map((c) => c.Close);
  const fast = ema(closes, 8);
  const slow = ema(closes, 21);
  const atr = averageTrueRange(valid) || Math.abs(closes[closes.length - 1]) * 0.001 || 1;
  const n = fast.length - 1;
  const slope = (fast[n] - fast[Math.max(0, n - 3)]) / 3 / atr;
  const lastCandles = valid.slice(-3).map(candleDir);
  const streak = lastCandles.reduce((a, b) => a + b, 0) / 3;
  const cross = Math.sign(fast[n] - slow[n]);
  const score = clamp(0.5 * Math.tanh(slope * 2) + 0.3 * streak + 0.2 * cross);
  return { timeframe, score, lastCandles };
}

const TIER_WEIGHT: Record<string, number> = {
  bronze: 0.4,
  silver: 0.6,
  gold: 0.8,
  platinum: 0.9,
  diamond: 1,
};

/** Capital-flow signal as -1..+1, weighted by tier and faded by age. */
export function signalScore(
  signals: FlowSignal[] | undefined,
  timeframe: string,
  maxBarsAgo = 5,
): number {
  const s = (signals || []).find(
    (cf) =>
      (cf?.Timeframe || '').toLowerCase() === timeframe.toLowerCase() &&
      (cf.IsBullish || cf.IsBearish),
  );
  if (!s) return 0;
  const barsAgo = typeof s.BarsAgo === 'number' ? s.BarsAgo : 0;
  if (barsAgo > maxBarsAgo) return 0;
  const label = `${s.Tier || ''} ${s.SignalType || ''}`.toLowerCase();
  const tier = Object.keys(TIER_WEIGHT).find((t) => label.includes(t));
  const weight = tier ? TIER_WEIGHT[tier] : 0.5;
  const fade = 1 - barsAgo / (maxBarsAgo + 1);
  return (s.IsBullish ? 1 : -1) * weight * fade;
}

function weighted(parts: Array<[number | undefined, number]>): number {
  let sum = 0;
  let w = 0;
  for (const [v, weight] of parts) {
    if (v == null || !Number.isFinite(v)) continue;
    sum += v * weight;
    w += weight;
  }
  return w ? sum / w : 0;
}

export function computeFlowForecast(input: {
  candles: Partial<Record<FlowTimeframe, FlowCandle[]>>;
  signals?: FlowSignal[];
}): FlowForecast | undefined {
  const tfs = FLOW_TIMEFRAMES.map((tf) =>
    scoreTimeframe(tf, input.candles[tf] || []),
  ).filter((t): t is TimeframeFlow => !!t);
  if (!tfs.length) return undefined;
  const byTf = (tf: FlowTimeframe) => tfs.find((t) => t.timeframe === tf)?.score;

  const cf1h = signalScore(input.signals, '1h');
  const cf4h = signalScore(input.signals, '4h');
  const cf1d = signalScore(input.signals, '1d');
  const cf1w = signalScore(input.signals, '1w');

  const lowerMomentum = clamp(
    weighted([
      [byTf('12m'), 0.45],
      [byTf('1h'), 0.4],
      [cf1h || undefined, 0.15],
    ]),
  );
  const higherBias = clamp(
    weighted([
      [byTf('4h'), 0.55],
      [cf4h || undefined, 0.15],
      [cf1d || undefined, 0.2],
      [cf1w || undefined, 0.1],
    ]),
  );

  // Lower frames lead: they show where the flow is going next.
  const score = clamp(0.6 * lowerMomentum + 0.4 * higherBias);

  const directions = [
    ...tfs.map((t) => t.score),
    cf1h,
    cf4h,
    cf1d,
  ].filter((v) => Math.abs(v) > 0.1);
  const agree = directions.length
    ? directions.filter((v) => Math.sign(v) === Math.sign(score || 1)).length /
      directions.length
    : 0;
  const confidence = clamp(agree * (0.4 + 0.6 * Math.abs(score)), 0, 1);

  let state: FlowState = 'sideways';
  const opposed = Math.sign(lowerMomentum) !== Math.sign(higherBias);
  if (opposed && Math.abs(lowerMomentum) > 0.3 && Math.abs(higherBias) > 0.2) {
    state = higherBias > 0 ? 'collapse-risk' : 'reversal-up';
  } else if (score > 0.2) {
    state = 'trend-up';
  } else if (score < -0.2) {
    state = 'trend-down';
  }

  const candles1h = input.candles['1h'] || [];
  const atr1h =
    averageTrueRange(candles1h) ||
    averageTrueRange(input.candles['4h'] || []) / 2 ||
    averageTrueRange(input.candles['12m'] || []) * 2;
  const historySource = candles1h.length ? candles1h : input.candles['12m'] || [];
  const history = historySource
    .slice(-24)
    .map((c) => c.Close)
    .filter(Number.isFinite);

  return {
    score,
    confidence,
    state,
    higherBias,
    lowerMomentum,
    timeframes: tfs,
    atr1h,
    history,
  };
}

/**
 * Project the price `hours` ahead. Drift per hour = score * 0.6 ATR (the
 * lower-frame momentum at a turning point), slowing
 * down over time. A box in the way rejects the move unless the flow is
 * strong and aligned, in which case the path breaks into/through it.
 */
export function projectFlow(
  price: number,
  forecast: FlowForecast,
  boxes: FlowBox[],
  hours = 6,
): FlowProjection | undefined {
  if (!price || !forecast || !forecast.atr1h) return undefined;
  const { confidence, atr1h, state } = forecast;
  // At a turning point the lower frames lead, so the path follows them.
  const turning = state === 'collapse-risk' || state === 'reversal-up';
  const score = turning ? forecast.lowerMomentum * 0.8 : forecast.score;
  const strong =
    Math.abs(score) > 0.55 && (state === 'trend-up' || state === 'trend-down');
  const zoned = (boxes || []).filter(isZonedBox);
  const up = score >= 0;
  const barrier = up
    ? zoned.filter((b) => b.ZoneMin > price).sort((a, b) => a.ZoneMin - b.ZoneMin)[0]
    : zoned.filter((b) => b.ZoneMax < price).sort((a, b) => b.ZoneMax - a.ZoneMax)[0];

  const points: ProjectionPoint[] = [{ h: 0, price, low: price, high: price }];
  let blockedBy: FlowProjection['blockedBy'];
  let p = price;
  for (let h = 1; h <= hours; h++) {
    const decay = 1 / Math.sqrt(h);
    let next = p + score * atr1h * 0.6 * decay;
    if (barrier) {
      const edge = up ? barrier.ZoneMin : barrier.ZoneMax;
      const far = up ? barrier.ZoneMax : barrier.ZoneMin;
      const crossed = up ? next >= edge : next <= edge;
      if (crossed) {
        const outcome: 'reject' | 'break' = strong ? 'break' : 'reject';
        blockedBy = { box: barrier, tone: resolveBoxTone(barrier), outcome };
        if (outcome === 'reject') {
          // Tap the edge, then pull back a bit.
          const pull = (edge - price) * 0.25;
          next = h === hours ? edge - pull : edge - pull * 0.2;
          p = next;
          points.push(cone(h, next, atr1h, confidence));
          for (let r = h + 1; r <= hours; r++) {
            const back = edge - pull * Math.min(1, (r - h) / 2);
            points.push(cone(r, back, atr1h, confidence));
          }
          break;
        }
        // Break: drift slows inside the box, capped at the far side.
        next = up ? Math.min(next, far) : Math.max(next, far);
      }
    }
    p = next;
    points.push(cone(h, next, atr1h, confidence));
  }

  const target = points[points.length - 1].price;
  return {
    points,
    target,
    targetPct: ((target - price) / price) * 100,
    blockedBy,
  };
}

function cone(h: number, price: number, atr: number, confidence: number): ProjectionPoint {
  const spread = atr * 0.5 * Math.sqrt(h) * (1.2 - confidence * 0.6);
  return { h, price, low: price - spread, high: price + spread };
}
