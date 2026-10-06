/**
 * Types for ChartBaseComponent: the options/data objects it binds to the
 * candlestick baseChart directive, and the slice of the Chart.js instance it
 * reads and writes directly.
 */
import type { ChartRefLike } from './services/chart-interaction.service';
import type { applyTimeTicks } from './utils/axis-ticks';
import type { buildBoxDatasets } from './utils/chart-utils';

// ── Chart.js instance ─────────────────────────────────────────────────────

type InteractionScale = ChartRefLike['scales']['x'];
/** Runtime options object of one scale (min/max are written to pin the viewport). */
export type ScaleOptionsRef = InteractionScale['options'];

/** A Chart.js scale with the pixel/value conversions this component calls. */
export type ChartScaleRef = InteractionScale & {
  getPixelForValue(value: number): number;
  getValueForPixel(pixel: number): number;
};

/** chart.config.options.scales of the main chart (read and written by name). */
export type ChartConfigScalesRef = {
  x?: ScaleOptionsRef;
  y?: ScaleOptionsRef;
  indicator?: ScaleOptionsRef;
};

/** The Chart.js instance behind the main canvas, as far as ChartBaseComponent touches it. */
export interface ChartRef extends ChartRefLike {
  canvas: HTMLCanvasElement;
  scales: {
    x: ChartScaleRef;
    y: ChartScaleRef;
    indicator?: ChartScaleRef;
    [key: string]: ChartScaleRef | undefined;
  };
  config?: { options?: { scales?: ChartConfigScalesRef } };
  resize(): void;
}

// ── Options bound to baseChart ────────────────────────────────────────────

/** Scale passed to `afterBuildTicks` (see utils/axis-ticks). */
export type AxisTickScale = Parameters<typeof applyTimeTicks>[0];

/** Tick label callback (Chart.js passes the tick value, its index and all ticks). */
export type TickLabelCallback = (
  value: number | string,
  index: number,
  ticks: Array<{ value: number }>,
) => string | string[];

export interface ChartTicksOptions {
  display?: boolean;
  padding?: number;
  callback?: TickLabelCallback;
  [key: string]: unknown;
}

export interface ChartScaleOptions {
  min?: number;
  max?: number;
  offset?: boolean;
  display?: boolean;
  ticks?: ChartTicksOptions;
  [key: string]: unknown;
}

/** A price/time axis: always configured with tick options. */
export type ChartAxisOptions = ChartScaleOptions & { ticks: ChartTicksOptions };

export type ChartBaseScales = {
  x: ChartAxisOptions;
  y: ChartAxisOptions;
  /** Hidden axis of the indicator glyphs, kept in sync with y. */
  indicator: ChartScaleOptions;
};

/** `chartOptions` of the candlestick chart pages (other Chart.js options pass through the index signature). */
export interface ChartBaseOptions {
  scales: ChartBaseScales;
  layout: {
    padding: { top?: number; right?: number; bottom?: number; left?: number };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ── Data bound to baseChart ───────────────────────────────────────────────

/** A data point of a main-chart dataset: a candle (o/h/l/c) or a line point (y). */
export interface ChartPoint {
  x: number;
  y?: number;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
}

/**
 * A dataset in `chartData`: Chart.js dataset options plus the marker flags the
 * overlays are found by. `type` stays in the index signature (read as
 * `d['type']`): a declared `type: string` would not bind to the
 * candlestick-typed baseChart directive.
 */
export interface ChartDatasetEntry {
  label?: string;
  data: ChartPoint[];
  isBox?: boolean;
  isKeyZone?: boolean;
  isIndicator?: boolean;
  isOrder?: boolean;
  isMarketCipher?: boolean;
  isDivergence?: boolean;
  barPercentage?: number;
  categoryPercentage?: number;
  maxBarThickness?: number;
  [key: string]: unknown;
}

export interface ChartBaseData {
  datasets: ChartDatasetEntry[];
}

// ── API payload fallbacks ─────────────────────────────────────────────────

/** Box fields read by the box overlay (several API spellings, see chart-utils). */
export type BoxOverlaySource = Parameters<typeof buildBoxDatasets>[0]['boxes'][number];

/** Alternative order field spellings read as fallbacks when drawing order lines. */
export interface LegacyOrderFields {
  Entryprice?: number;
  entryPrice?: number;
  Stoploss?: number;
  stopLoss?: number;
  Target1Price?: number;
  Target1price?: number;
  Target2price?: number;
  Target2?: number;
  direction?: string;
}
