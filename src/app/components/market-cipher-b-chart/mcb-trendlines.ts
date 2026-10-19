/**
 * Momentum trendlines computed by the DivPredictionBot (GET /SymbolPredictions →
 * TimeframeResults[i].Trendlines). Times are unix ms candle open times (the chart's
 * candle x values); osc values are the Slow Momentum Wave (wt2). Lines are drawn from
 * (T1,V1) through (T2,V2) and extended to the last candle along their own slope.
 */
import type { SymbolPredictionsResponse } from 'src/app/modules/shared/services/http/chart.service';

export type TrendlineRole = 'Dominant' | 'Internal' | 'Developing';

export interface TrendlinePivot {
  TimeMs: number | null;
  Value: number | null;
}

export interface TrendlineOsc {
  T1: number | null;
  V1: number | null;
  T2: number | null;
  V2: number | null;
  EndT: number | null;
  EndV: number | null;
}

export interface TrendlinePrice {
  T1: number | null;
  P1: number | null;
  T2: number | null;
  P2: number | null;
  EndT: number | null;
  EndP: number | null;
  Kind1?: string;
  Kind2?: string;
}

/** Per-pane breakout state; absent means Active. Confirmed/Invalidated lines are not drawn on that pane; WaitingForNewPivot lines are drawn dimmed. */
export type TrendlineBreakoutState =
  | 'Active'
  | 'BreakoutPending'
  | 'BreakoutConfirmed'
  | 'Invalidated'
  | 'WaitingForNewPivot';

export type MoneyFlowRole = 'LongTerm' | 'ShortTerm';
export type MoneyFlowDirection = 'Rising' | 'Falling' | 'Sideways';

export interface TrendlineLine {
  Id: string;
  Role: TrendlineRole | MoneyFlowRole;
  IsConfirmed: boolean;
  IsVisible: boolean;
  Regime: 'Positive' | 'Negative';
  Osc: TrendlineOsc | null;
  Price: TrendlinePrice | null;
  IntermediateViolation?: boolean;
  OscBreakout?: TrendlineBreakoutState;
  PriceBreakout?: TrendlineBreakoutState;
}

export interface MoneyFlowTrendlines {
  Regime: 'Positive' | 'Negative' | null;
  LongTerm: { Direction: MoneyFlowDirection } | null;
  ShortTerm: { Direction: MoneyFlowDirection } | null;
  Lines: TrendlineLine[];
  HiddenLineCount: number;
}

export interface TimeframeTrendlines {
  Version: number;
  EndTimeMs: number;
  ClosedCount: number;
  Regime: 'Positive' | 'Negative' | null;
  StructureStatus: 'NoRegime' | 'WaitingForPivots' | 'Established' | 'PendingReplacement' | 'WarmUp' | 'NoStructure';
  Dominant: TrendlinePivot | null;
  PendingDominant: TrendlinePivot | null;
  Internal: TrendlinePivot[];
  Lines: TrendlineLine[];
  /** Open time (ms) of the last closed candle; monotonic per symbol+timeframe. Absent on older bots. */
  Generation?: number;
  MoneyFlow?: MoneyFlowTrendlines | null;
}

/** One entry of TimeframeResults; only the fields used here. */
export interface TimeframeResult {
  Timeframe: string;
  Trendlines?: TimeframeTrendlines | null;
  [key: string]: unknown;
}

/** Chart candle as used by the MCB chart (OHLC optional so x-only data still maps). */
export interface McbChartCandle {
  x: number;
  h?: number;
  l?: number;
  c?: number;
}

/** Flag on every trendline dataset so they can be replaced atomically. */
export type McbTrendlineDataset = {
  isMcbTrendline: true;
  type: 'line';
  label: string;
  data: Array<{ x: number; y: number }>;
  borderColor: string;
  borderWidth: number;
  borderDash: number[];
  /** Per-point radii (anchors get the dot, the extension none). */
  pointRadius: number[];
  pointHitRadius: number;
  pointBackgroundColor: string;
  pointBorderColor: string;
  tension: number;
  fill: boolean;
  spanGaps: boolean;
  xAxisID?: string;
  yAxisID?: string;
  order: number;
};

export interface TrendlineLineStyle {
  color: string;
  width: number;
}

export interface TrendlineRoleStyles {
  dominant: TrendlineLineStyle;
  internal: TrendlineLineStyle;
}

/** MCB panel lines are green in a Positive regime and red in a Negative one; grey when the bot sends no regime. */
export type TrendlineOscColorKey = 'Positive' | 'Negative' | 'None';

export const TRENDLINE_STYLES: { osc: Record<TrendlineOscColorKey, TrendlineRoleStyles>; price: TrendlineRoleStyles } = {
  osc: {
    Positive: {
      dominant: { color: 'rgba(0,230,118,0.95)', width: 2 },
      internal: { color: 'rgba(0,230,118,0.55)', width: 1 },
    },
    Negative: {
      dominant: { color: 'rgba(255,82,82,0.95)', width: 2 },
      internal: { color: 'rgba(255,82,82,0.55)', width: 1 },
    },
    None: {
      dominant: { color: 'rgba(180,180,180,0.95)', width: 2 },
      internal: { color: 'rgba(180,180,180,0.55)', width: 1 },
    },
  },
  price: {
    dominant: { color: 'rgba(165,110,60,0.95)', width: 2 },
    internal: { color: 'rgba(165,110,60,0.6)', width: 1.2 },
  },
};
export const MONEY_FLOW_STYLES: Record<MoneyFlowRole, TrendlineLineStyle & { dash: number[] }> = {
  LongTerm: { color: 'rgba(255,255,255,0.9)', width: 1.6, dash: [] },
  ShortTerm: { color: 'rgba(255,255,255,0.65)', width: 1, dash: [2, 4] },
};
export const TRENDLINE_DEVELOPING_DASH = [4, 4];
export const TRENDLINE_PRICE_ORDER = 850;
export const TRENDLINE_OSC_ORDER = -2;

export interface TrendlineBuildOptions {
  /** Draw Developing lines (dashed). Default true. */
  showDeveloping?: boolean;
  /** x (ms) the lines are extended to, normally the last chart candle. Default: the line's EndT. */
  extendToX?: number | null;
  /** Radius of the dots on the two anchors; 0 (default) draws none. */
  anchorRadius?: number;
}

/** Per-timeframe results from a /SymbolPredictions response (jsonb: JSON string or already parsed). */
export function parseTimeframeResults(response: SymbolPredictionsResponse | null | undefined): TimeframeResult[] {
  const raw = response?.TimeframeResults ?? response?.timeframeResults;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? (parsed as TimeframeResult[]) : [];
}

/**
 * Trendlines the bot computed for exactly `timeframe` (case-sensitive: "1m" is a minute,
 * "1M" a month). No fallback: other timeframes' timestamps and pivots do not belong here.
 */
export function findTimeframeTrendlines(
  results: TimeframeResult[] | null | undefined,
  timeframe: string,
): TimeframeTrendlines | null {
  const hit = results?.find((r) => r?.Timeframe === timeframe);
  const t = hit?.Trendlines;
  return t && typeof t === 'object' && Array.isArray(t.Lines) ? t : null;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** (t1,v1) → (t2,v2) → extension on the same slope; null when any value is invalid. */
function linePoints(
  t1: unknown,
  v1: unknown,
  t2: unknown,
  v2: unknown,
  endT: unknown,
  extendToX: number | null | undefined,
): Array<{ x: number; y: number }> | null {
  if (!finite(t1) || !finite(v1) || !finite(t2) || !finite(v2) || t2 === t1) return null;
  const points = [
    { x: t1, y: v1 },
    { x: t2, y: v2 },
  ];
  const target = finite(extendToX) ? extendToX : finite(endT) ? endT : null;
  if (target != null && target > t2) {
    const slope = (v2 - v1) / (t2 - t1);
    points.push({ x: target, y: v2 + slope * (target - t2) });
  }
  return points;
}

/** A line whose breakout is confirmed (or that was invalidated) on this pane is no longer drawn there. */
function isBrokenOnPane(line: TrendlineLine, pane: 'osc' | 'price'): boolean {
  const state = pane === 'osc' ? line.OscBreakout : line.PriceBreakout;
  return state === 'BreakoutConfirmed' || state === 'Invalidated';
}

/** Factor applied to the alpha of lines waiting for a new pivot (same colour/width/dash, just dimmed). */
export const TRENDLINE_WAITING_ALPHA_FACTOR = 0.5;

/** Lines that broke out and now wait for a new pivot on this pane are drawn dimmed. */
function isWaitingOnPane(line: TrendlineLine, pane: 'osc' | 'price'): boolean {
  return (pane === 'osc' ? line.OscBreakout : line.PriceBreakout) === 'WaitingForNewPivot';
}

/** rgba(r,g,b,a) -> rgba(r,g,b,a*factor); other formats are returned unchanged. */
function dimColor(color: string, factor: number): string {
  const m = /^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(color);
  if (!m) return color;
  const a = Number(m[4]);
  if (!Number.isFinite(a)) return color;
  return `rgba(${m[1].trim()},${m[2].trim()},${m[3].trim()},${Math.round(a * factor * 1000) / 1000})`;
}

function oscColorKey(regime: unknown): TrendlineOscColorKey {
  return regime === 'Positive' || regime === 'Negative' ? regime : 'None';
}

/** Chart.js datasets for one pane (osc: MCB panel, price: main chart), one per visible line. */
export function buildTrendlineDatasets(
  trendlines: TimeframeTrendlines | null | undefined,
  pane: 'osc' | 'price',
  opts: TrendlineBuildOptions = {},
): McbTrendlineDataset[] {
  const lines = trendlines?.Lines;
  if (!Array.isArray(lines)) return [];
  const showDeveloping = opts.showDeveloping ?? true;
  const anchorRadius = opts.anchorRadius ?? 0;
  const out: McbTrendlineDataset[] = [];
  lines.forEach((line, i) => {
    if (!line || line.IsVisible !== true) return;
    if (line.Role === 'Developing' && !showDeveloping) return;
    if (isBrokenOnPane(line, pane)) return;
    let data: Array<{ x: number; y: number }> | null;
    if (pane === 'osc') {
      const o = line.Osc;
      data = o ? linePoints(o.T1, o.V1, o.T2, o.V2, o.EndT, opts.extendToX) : null;
    } else {
      const p = line.Price;
      data = p ? linePoints(p.T1, p.P1, p.T2, p.P2, p.EndT, opts.extendToX) : null;
    }
    if (!data) return;
    const styles = pane === 'osc' ? TRENDLINE_STYLES.osc[oscColorKey(line.Regime ?? trendlines?.Regime)] : TRENDLINE_STYLES.price;
    const base = line.Role === 'Dominant' ? styles.dominant : styles.internal;
    const style = isWaitingOnPane(line, pane) ? { ...base, color: dimColor(base.color, TRENDLINE_WAITING_ALPHA_FACTOR) } : base;
    out.push({
      isMcbTrendline: true,
      type: 'line',
      label: `MCB_TL_${pane}_${line.Id ?? i}`,
      data,
      borderColor: style.color,
      borderWidth: style.width,
      borderDash: line.Role === 'Developing' ? [...TRENDLINE_DEVELOPING_DASH] : [],
      pointRadius: data.map((_, k) => (k < 2 ? anchorRadius : 0)),
      pointHitRadius: 0,
      pointBackgroundColor: style.color,
      pointBorderColor: style.color,
      tension: 0,
      fill: false,
      spanGaps: true,
      ...(pane === 'price'
        ? { xAxisID: 'x', yAxisID: 'y', order: TRENDLINE_PRICE_ORDER }
        : { order: TRENDLINE_OSC_ORDER }),
    });
  });
  return out;
}

/**
 * White Money Flow trendlines for the MCB (oscillator) panel only; values are raw MF units on
 * the panel's own y-axis. Long-term solid, short-term thin dashed, unconfirmed lines use the
 * developing dash.
 */
export function buildMoneyFlowTrendlineDatasets(
  trendlines: TimeframeTrendlines | null | undefined,
  opts: TrendlineBuildOptions = {},
): McbTrendlineDataset[] {
  const lines = trendlines?.MoneyFlow?.Lines;
  if (!Array.isArray(lines)) return [];
  const showDeveloping = opts.showDeveloping ?? true;
  const anchorRadius = opts.anchorRadius ?? 0;
  const out: McbTrendlineDataset[] = [];
  lines.forEach((line, i) => {
    if (!line || line.IsVisible !== true) return;
    if (line.IsConfirmed === false && !showDeveloping) return;
    if (isBrokenOnPane(line, 'osc')) return;
    const o = line.Osc;
    const data = o ? linePoints(o.T1, o.V1, o.T2, o.V2, o.EndT, opts.extendToX) : null;
    if (!data) return;
    const base = line.Role === 'LongTerm' ? MONEY_FLOW_STYLES.LongTerm : MONEY_FLOW_STYLES.ShortTerm;
    const style = isWaitingOnPane(line, 'osc') ? { ...base, color: dimColor(base.color, TRENDLINE_WAITING_ALPHA_FACTOR) } : base;
    out.push({
      isMcbTrendline: true,
      type: 'line',
      label: `MCB_TL_mf_${line.Id ?? i}`,
      data,
      borderColor: style.color,
      borderWidth: style.width,
      borderDash: line.IsConfirmed === false ? [...TRENDLINE_DEVELOPING_DASH] : [...style.dash],
      pointRadius: data.map((_, k) => (k < 2 ? anchorRadius : 0)),
      pointHitRadius: 0,
      pointBackgroundColor: style.color,
      pointBorderColor: style.color,
      tension: 0,
      fill: false,
      spanGaps: true,
      order: TRENDLINE_OSC_ORDER,
    });
  });
  return out;
}
