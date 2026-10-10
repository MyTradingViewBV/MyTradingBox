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

export interface TrendlineLine {
  Id: string;
  Role: TrendlineRole;
  IsConfirmed: boolean;
  IsVisible: boolean;
  Regime: 'Positive' | 'Negative';
  Osc: TrendlineOsc | null;
  Price: TrendlinePrice | null;
  IntermediateViolation?: boolean;
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

export const TRENDLINE_STYLES: Record<'osc' | 'price', { dominant: TrendlineLineStyle; internal: TrendlineLineStyle }> = {
  osc: {
    dominant: { color: 'rgba(186,85,211,0.95)', width: 2 },
    internal: { color: 'rgba(186,85,211,0.55)', width: 1 },
  },
  price: {
    dominant: { color: 'rgba(165,110,60,0.95)', width: 2 },
    internal: { color: 'rgba(165,110,60,0.6)', width: 1.2 },
  },
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
    let data: Array<{ x: number; y: number }> | null;
    if (pane === 'osc') {
      const o = line.Osc;
      data = o ? linePoints(o.T1, o.V1, o.T2, o.V2, o.EndT, opts.extendToX) : null;
    } else {
      const p = line.Price;
      data = p ? linePoints(p.T1, p.P1, p.T2, p.P2, p.EndT, opts.extendToX) : null;
    }
    if (!data) return;
    const styles = TRENDLINE_STYLES[pane];
    const style = line.Role === 'Dominant' ? styles.dominant : styles.internal;
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
