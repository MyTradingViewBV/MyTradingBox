/**
 * Divergence prediction lines from the DivPredictionBot (GET /SymbolPredictions),
 * drawn like the WPF Market Cipher view: one line between the WaveTrend /
 * Money Flow pivots in the MCB panel and one between the matching candle
 * pivots on the price chart, with the score (%) at the current end.
 *
 * The bot reports bar indexes into its own candle list; like WPF, the largest
 * CurrentPriceBarIndex is mapped onto the last chart candle and the other bars
 * count back from it. The ends are snapped onto the wicks and the panel's own
 * WaveTrend / Money Flow curves.
 */

export interface DivergenceLinePrediction {
  Source: string;
  IsBear: boolean;
  PivotRank: number;
  ScorePct: number;
  AnchorOscBarIndex: number;
  AnchorOscValue: number;
  CurrentOscBarIndex: number;
  CurrentOscValue: number;
  AnchorPriceBarIndex: number;
  AnchorPriceValue: number;
  CurrentPriceBarIndex: number;
  CurrentPriceValue: number;
}

export interface TimeframePrediction {
  Timeframe: string;
  CandleTime: string;
  DivergenceLines: DivergenceLinePrediction[];
}

export interface McbLineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface McbPredictionLine {
  isBear: boolean;
  isMoneyFlow: boolean;
  scorePct: number;
  /** Segment on the oscillator (MCB panel); null when a pivot is off the loaded candles. */
  osc: McbLineSegment | null;
  /** Segment on the candles (main chart); null when a pivot is off the loaded candles. */
  price: McbLineSegment | null;
}

import type { Chart } from 'chart.js';
import type { SymbolPredictionsResponse } from 'src/app/modules/shared/services/http/chart.service';

const BULL_COLOR = 'rgba(0,255,119,0.8)';
const BEAR_COLOR = 'rgba(255,68,68,0.8)';
const MONEY_FLOW_DASH = [6, 4];

/**
 * Per-timeframe results from a /SymbolPredictions response. TimeframeResults is
 * stored as jsonb and arrives as a JSON string (or already parsed).
 */
export function parseTimeframeResults(
  response: SymbolPredictionsResponse | null | undefined,
): TimeframePrediction[] {
  const raw = response?.TimeframeResults ?? response?.timeframeResults;
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed) ? (parsed as TimeframePrediction[]) : [];
}

/**
 * Timeframes the bot does not compute (custom chart timeframes) use the nearest
 * one it does, in this order (WPF MarketCipherBViewModel.GetFallbackPredictionTf).
 */
const PREDICTION_TF_FALLBACKS: Record<string, string[]> = {
  '12m': ['30m', '1h', '4h'],
  '24m': ['1h', '30m', '4h'],
  '3m': ['5m', '15m', '30m', '1h'],
  '6m': ['15m', '30m', '1h'],
};

/**
 * The bot's result for `timeframe`; when it has none, the fallback chain above,
 * then the shortest timeframe available (like the WPF view), so the lines still show.
 * Timeframe keys are case-sensitive: "1m" is a minute, "1M" a month.
 */
export function findTimeframePrediction(
  results: TimeframePrediction[],
  timeframe: string,
): TimeframePrediction | null {
  const byTf = (tf: string) => results.find((r) => r?.Timeframe === tf) ?? null;
  const exact = byTf(timeframe);
  if (exact) return exact;
  for (const tf of PREDICTION_TF_FALLBACKS[timeframe] ?? []) {
    const fallback = byTf(tf);
    if (fallback) return fallback;
  }
  const available = results.filter((r) => typeof r?.Timeframe === 'string');
  if (!available.length) return null;
  return available.reduce((best, r) => (timeframeMs(r.Timeframe) < timeframeMs(best.Timeframe) ? r : best));
}

const TF_UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
  M: 2_592_000_000,
};

/** Length of a timeframe key like "15m", "4h" or "1M" (ms); Infinity when unknown. */
function timeframeMs(tf: string): number {
  const match = /^(\d+)([smhdwM])$/.exec(tf?.trim() ?? '');
  return match ? Number(match[1]) * TF_UNIT_MS[match[2]] : Infinity;
}

/** Chart candle as used by the MCB chart (OHLC optional so x-only data still maps). */
export interface McbChartCandle {
  x: number;
  h?: number;
  l?: number;
  c?: number;
}

/** The panel's own oscillator series, used to put osc line ends exactly on the plotted curves. */
export interface McbOscSeries {
  x: number[];
  wt1: Array<number | null>;
  mf: Array<number | null>;
}

/** Map the bot's divergence lines for one timeframe onto the chart candles (ascending x). */
export function mapPredictionLines(
  prediction: TimeframePrediction | null,
  candles: McbChartCandle[],
  osc?: McbOscSeries | null,
): McbPredictionLine[] {
  const lines = prediction?.DivergenceLines;
  const n = candles?.length ?? 0;
  if (!lines?.length || !n) return [];

  // Same mapping as WPF (MarketCipherBViewModel / MainViewModel): the largest
  // CurrentPriceBarIndex is the last chart candle and every bar maps back from there.
  const lastBar = Math.max(...lines.map((l) => l.CurrentPriceBarIndex).filter(Number.isFinite));
  if (!Number.isFinite(lastBar)) return [];
  const toIdx = (bar: number): number | null => {
    const idx = n - 1 - (lastBar - bar);
    return Number.isFinite(idx) && idx >= 0 ? Math.min(idx, n - 1) : null;
  };

  const oscIndex = new Map<number, number>();
  osc?.x.forEach((x, i) => oscIndex.set(x, i));
  // Line ends sit on the candle wick (high for bear, low for bull) and on the panel's own curve.
  const snapPrice = (idx: number, isBear: boolean, value: number): number => {
    const wick = Number(isBear ? candles[idx].h : candles[idx].l);
    return Number.isFinite(wick) ? wick : value;
  };
  const snapOsc = (idx: number, isMoneyFlow: boolean, value: number): number => {
    const i = oscIndex.get(candles[idx].x);
    const v = i == null ? null : (isMoneyFlow ? osc!.mf : osc!.wt1)[i];
    return v != null && Number.isFinite(v) ? v : value;
  };
  const segment = (
    anchorBar: number,
    anchorValue: number,
    currentBar: number,
    currentValue: number,
    snap: (idx: number, value: number) => number,
  ): McbLineSegment | null => {
    const a = toIdx(anchorBar);
    const c = toIdx(currentBar);
    if (a == null || c == null || a === c) return null;
    if (!Number.isFinite(anchorValue) || !Number.isFinite(currentValue)) return null;
    return { x1: candles[a].x, y1: snap(a, anchorValue), x2: candles[c].x, y2: snap(c, currentValue) };
  };

  return lines
    .map((l) => {
      const isBear = !!l.IsBear;
      const isMoneyFlow = /^moneyflow/i.test(l.Source ?? '');
      return {
        isBear,
        isMoneyFlow,
        scorePct: Number(l.ScorePct) || 0,
        osc: segment(l.AnchorOscBarIndex, l.AnchorOscValue, l.CurrentOscBarIndex, l.CurrentOscValue, (i, v) =>
          snapOsc(i, isMoneyFlow, v),
        ),
        price: segment(l.AnchorPriceBarIndex, l.AnchorPriceValue, l.CurrentPriceBarIndex, l.CurrentPriceValue, (i, v) =>
          snapPrice(i, isBear, v),
        ),
      };
    })
    .filter((l) => l.osc || l.price);
}

/** Chart.js line dataset of one prediction line (plus the label plugin's mcbPred* fields). */
export type McbPredictionDataset = {
  isMcbPrediction: true;
  mcbPredLabel: string;
  mcbPredIsBear: boolean;
  type: 'line';
  label: string;
  data: Array<{ x: number; y: number }>;
  borderColor: string;
  borderWidth: number;
  borderDash: number[];
  pointRadius: number;
  pointHitRadius: number;
  tension: number;
  fill: boolean;
  spanGaps: boolean;
  xAxisID?: string;
  yAxisID?: string;
  order: number;
};

/**
 * Chart.js line datasets for one pane: solid = WaveTrend, dashed = Money Flow,
 * green = bullish, red = bearish. The score label is drawn by mcbPredictionLabelPlugin.
 */
export function buildPredictionDatasets(
  lines: McbPredictionLine[],
  pane: 'osc' | 'price',
): McbPredictionDataset[] {
  const datasets: McbPredictionDataset[] = [];
  lines.forEach((line, i) => {
    const seg = line[pane];
    if (!seg) return;
    const color = line.isBear ? BEAR_COLOR : BULL_COLOR;
    datasets.push({
      isMcbPrediction: true,
      mcbPredLabel: `${line.scorePct.toFixed(1)}%`,
      mcbPredIsBear: line.isBear,
      type: 'line',
      label: `MCB_PRED_${pane}_${i}`,
      data: [
        { x: seg.x1, y: seg.y1 },
        { x: seg.x2, y: seg.y2 },
      ],
      borderColor: color,
      borderWidth: pane === 'price' ? 2 : 1.5,
      borderDash: line.isMoneyFlow ? MONEY_FLOW_DASH : [],
      pointRadius: 0,
      pointHitRadius: 0,
      tension: 0,
      fill: false,
      spanGaps: true,
      ...(pane === 'price' ? { xAxisID: 'x', yAxisID: 'y', order: 850 } : { order: -2 }),
    });
  });
  return datasets;
}

/** Scale members the label plugin uses (x/y may be undefined for points off the data). */
interface PixelScaleLike {
  getPixelForValue(value: number | undefined): number;
}

const LABEL_GAP_PX = 4;
const LABEL_STEP_PX = 12;

/**
 * Score labels at the current end of each prediction line (bull above, bear
 * below), stacked when several lines end on the same candle. Registered
 * globally; only acts on datasets flagged isMcbPrediction.
 */
export const mcbPredictionLabelPlugin = {
  id: 'mcbPredictionLabels',
  afterDatasetsDraw(chart: Chart): void {
    const datasets = chart?.data?.datasets as
      | Array<McbPredictionDataset | { isMcbPrediction?: false } | null | undefined>
      | undefined;
    if (!datasets?.some((ds) => ds?.isMcbPrediction)) return;
    const xScale = chart.scales?.['x'] as PixelScaleLike | undefined;
    const yScale = chart.scales?.['y'] as PixelScaleLike | undefined;
    const area = chart.chartArea;
    if (!xScale || !yScale || !area) return;

    const ctx = chart.ctx;
    const stack = new Map<string, number>();
    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    datasets.forEach((ds, i) => {
      if (!ds?.isMcbPrediction || !ds.mcbPredLabel || !chart.isDatasetVisible(i)) return;
      const end = ds.data?.[ds.data.length - 1];
      const px = xScale.getPixelForValue(end?.x);
      const py = yScale.getPixelForValue(end?.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      const key = `${Math.round(px)}_${ds.mcbPredIsBear ? 'bear' : 'bull'}`;
      const slot = stack.get(key) ?? 0;
      stack.set(key, slot + 1);
      const offset = LABEL_GAP_PX + slot * LABEL_STEP_PX;
      ctx.textBaseline = ds.mcbPredIsBear ? 'top' : 'bottom';
      ctx.fillStyle = ds.borderColor;
      ctx.fillText(ds.mcbPredLabel, px, ds.mcbPredIsBear ? py + offset : py - offset);
    });
    ctx.restore();
  },
};
