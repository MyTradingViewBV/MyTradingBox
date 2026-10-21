/* Centralized Chart.js custom plugins extracted from chart-component.ts
  Each plugin relies only on dataset flags (isBox, isKeyZone, isIndicator, isOrder)
  and the chart instance; no component state dependency.
  Lint relaxed here because these are thin wrappers over Chart.js runtime objects. */
 

import type { KeyZoneItem } from '../utils/key-zone-layers';
import type { DivergenceDotItem, DivergenceLineItem } from './chart-indicators.service';
import { formatVolume, volumeTitleOf } from './volume.plugin';
import { NEWS_MARKER_CLEARANCE_PX, newsMarkersOf } from './news.plugin';
import { axisPriceTagResetPlugin, registerAxisPriceTag } from '../utils/axis-price-tags';

type ScaleLike = {
  min?: number;
  max?: number;
  options?: { min?: number; max?: number };
  getPixelForValue(value: unknown): number;
  getValueForPixel?(pixel: number): number;
};

type PointLike = {
  x: unknown;
  y?: unknown;
  Price?: unknown;
  value?: unknown;
  [k: string]: unknown;
};

type ChartWithCustom = import('chart.js').Chart & {
  _crosshairX?: number | null;
  _crosshairY?: number | null;
  _crosshairTime?: number | null;
  _isInteracting?: boolean;
  _watermarkImg?: HTMLImageElement;
  _legendIconImg?: HTMLImageElement;
};

type PerfProfileLike = {
  tier?: 'low' | 'balanced' | 'high';
  skipLabelsDuringInteraction?: boolean;
  enableWatermark?: boolean;
};

function getPerfProfile(): PerfProfileLike {
  try {
    const profile = (window as Window & { __chartPerfProfile?: PerfProfileLike }).__chartPerfProfile;
    return profile || { tier: 'balanced', skipLabelsDuringInteraction: false, enableWatermark: true };
  } catch {
    return { tier: 'balanced', skipLabelsDuringInteraction: false, enableWatermark: true };
  }
}

// Helper reused by multiple plugins for rounded rectangles
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: boolean,
  stroke: boolean,
): void {
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// Crosshair lines following tooltip active element
// Extended dataset interface describing custom flags used by our plugins
interface ExtendedDataset {
  label?: string;
  type?: string;
  isBox?: boolean;
  isKeyZone?: boolean;
  isIndicator?: boolean;
  isOrder?: boolean;
  glyph?: string;
  glyphColor?: string;
  glyphSize?: number;
  glyphOffsetX?: number;
  glyphOffsetY?: number;
  /** Pinned to the point's price (candle low/high): drawn this side of it at a fixed pixel gap. */
  glyphAnchor?: 'above' | 'below';
  /** Stack position on that side, 0 = nearest the candle. */
  glyphSlot?: number;
  orderLabel?: string;
  orderColor?: string;
  keyZoneItems?: KeyZoneItem[];
  boxLabelMin?: string;
  boxLabelMax?: string;
  boxLabelText?: string; // combined min/max label
  backgroundColor?: string | CanvasGradient | CanvasPattern;
  borderColor?: string | CanvasGradient | CanvasPattern;
  borderWidth?: number;
  yAxisID?: string;
  data?: PointLike[];
  isDivergence?: boolean;
  divergenceLines?: DivergenceLineItem[];
  divergenceDots?: DivergenceDotItem[];
}

/** Crosshair style shared with linked panels (MCB). */
export const CROSSHAIR_LINE_COLOR = 'rgba(150,150,150,0.6)';
export const CROSSHAIR_DASH = [4, 4];
export const CROSSHAIR_LABEL_BG = '#363a45';
const CROSSHAIR_FONT = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';

/** TradingView candle colours (also the last-price label and the legend values). */
export const CANDLE_UP_COLOR = '#089981';
export const CANDLE_DOWN_COLOR = '#f23645';

/** TradingView label font and the light grey of its legend titles. */
const LEGEND_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
const LEGEND_TITLE_COLOR = '#d1d4dc';

/** Price text with thousands separators and a fixed number of decimals, like TradingView ("82,600.00"). */
export function formatPriceText(value: number, decimals: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Decimals for a price label: 2 from 1 up, more for small prices (max 8). */
export function priceLabelDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 1) return 2;
  return Math.min(8, Math.max(2, Math.ceil(-Math.log10(abs) + 2)));
}
const CROSSHAIR_LABEL_HEIGHT = 22;

/** Crosshair time label text, e.g. "3 Oct 14:00" (local time). */
export function formatCrosshairTime(ms: number): string {
  const date = new Date(ms);
  if (isNaN(date.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${date.getDate()} ${months[date.getMonth()]} ${hh}:${min}`;
}

/** Time label box centred on x (kept inside the plot's width), top edge at `top`. */
export function drawCrosshairTimeLabel(
  ctx: CanvasRenderingContext2D,
  area: { left: number; right: number },
  x: number,
  ms: number,
  top: number,
): void {
  const text = formatCrosshairTime(ms);
  if (!text) return;
  ctx.save();
  ctx.font = CROSSHAIR_FONT;
  const width = ctx.measureText(text).width + 12;
  const left = Math.max(area.left, Math.min(x - width / 2, area.right - width));
  ctx.fillStyle = CROSSHAIR_LABEL_BG;
  roundRect(ctx, left, top, width, CROSSHAIR_LABEL_HEIGHT, 3, true, false);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + width / 2, top + CROSSHAIR_LABEL_HEIGHT / 2);
  ctx.restore();
}

/**
 * x at which a chart maps the shared crosshair `time` through `xScale`, kept inside the plot. The MAIN
 * chart's mapping is the one source of the page-wide crosshair x: linked panes draw at that client x
 * translated by their canvas offset (`ChartLinkedScaleService.sharedCrosshairClientX`) and use their own
 * scale only as the fallback without a main chart. null when the scale cannot map the time.
 */
export function crosshairPixelX(
  xScale: { getPixelForValue?: (value: number) => number } | null | undefined,
  area: { left: number; right: number },
  time: number,
): number | null {
  const px = xScale?.getPixelForValue?.(time);
  return px != null && Number.isFinite(px) ? Math.min(area.right, Math.max(area.left, px)) : null;
}

export const crosshairPlugin = {
  id: 'crosshair',
  // Position is managed by ChartInteractionService (no afterEvent needed).
  // _crosshairX / _crosshairY are set/cleared by touch & mouse handlers.
  // y == null: the pointer is in a linked panel; only the vertical line shows.
  afterDraw(chart: import('chart.js').Chart): void {
    const chartEx = chart as ChartWithCustom;
    const y = chartEx._crosshairY;
    const time = chartEx._crosshairTime;
    if (chartEx._crosshairX == null && time == null) return;

    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    const area = chart.chartArea;
    if (!area) return;
    // The shared time is the source of truth (re-mapped on every draw, so a zoom/pan keeps both panes on it);
    // the stored pixel is only the fallback when no time could be resolved.
    const x = (time != null ? crosshairPixelX(xScale, area, time) : null) ?? chartEx._crosshairX;
    if (x == null) return;

    ctx.save();
    // Draw crosshair lines (dashed, TradingView style)
    ctx.beginPath();
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
    if (y != null) {
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.right, y);
    }
    ctx.lineWidth = 1;
    ctx.setLineDash(CROSSHAIR_DASH);
    ctx.strokeStyle = CROSSHAIR_LINE_COLOR;
    ctx.stroke();
    ctx.setLineDash([]);

    // --- Y-axis label (price) ---
    if (y != null && yScale?.getValueForPixel) {
      const priceValue = yScale.getValueForPixel(y);
      const priceString = formatPriceText(priceValue, priceLabelDecimals(priceValue));

      ctx.font = CROSSHAIR_FONT;
      const priceBoxWidth = ctx.measureText(priceString).width + 12;
      // Draw on the right axis area
      ctx.fillStyle = CROSSHAIR_LABEL_BG;
      roundRect(ctx, area.right + 1, y - CROSSHAIR_LABEL_HEIGHT / 2, priceBoxWidth, CROSSHAIR_LABEL_HEIGHT, 3, true, false);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceString, area.right + 1 + priceBoxWidth / 2, y);
      registerAxisPriceTag(chart, {
        price: priceValue, y, h: CROSSHAIR_LABEL_HEIGHT, label: '', labelKey: 'CHART.PRICE_TAG_CROSSHAIR',
        text: priceString, color: CROSSHAIR_LABEL_BG,
      });
    }

    // --- X-axis label (timestamp); a linked panel shows it when this chart hides its time axis ---
    const xHidden = (chart.options?.scales?.['x'] as { display?: unknown } | undefined)?.display === false;
    if (!xHidden && xScale?.getValueForPixel) {
      drawCrosshairTimeLabel(ctx, area, x, time ?? xScale.getValueForPixel(x), area.bottom + 1);
    }

    ctx.restore();
  },
};
// Dashed guide from the latest candle close to the right price axis.
export const latestCandleGuidePlugin = {
  id: 'latestCandleGuide',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const area = chart.chartArea;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    if (!ctx || !area || !xScale || !yScale) return;

    const candleDataset = (chart.data.datasets as ExtendedDataset[]).find(
      (dataset) => dataset?.type === 'candlestick',
    );
    const points = candleDataset?.data;
    const latest = points?.[points.length - 1];
    if (!latest || latest.x == null || latest['c'] == null) return;

    const candleX = xScale.getPixelForValue(latest.x);
    const closeY = yScale.getPixelForValue(latest['c']);
    if (!Number.isFinite(candleX) || !Number.isFinite(closeY)) return;
    if (candleX < area.left || candleX > area.right) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(area.left, closeY);
    ctx.lineTo(area.right, closeY);
    ctx.lineWidth = 1;
    // TradingView: dotted price line in the colour of the current candle.
    ctx.setLineDash([1, 3]);
    ctx.strokeStyle = Number(latest['c']) >= Number(latest['o']) ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR;
    ctx.stroke();
    ctx.restore();
  },
};

// Filled box polygons painted behind candles
export const boxPainterPlugin = {
  id: 'boxPainter',
  beforeDatasetsDraw(chart: import('chart.js').Chart): void {
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    if (!xScale || !yScale) return;
    const area = chart.chartArea;
    if (!area) return;

    ctx.save();
    try {
      // Clip all box drawing to the chart area so boxes don't cover axes
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
      // Draw boxes before candles so candles appear on top; no composite override needed
      (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
        if (!ds || !ds.isBox) return;
        const pts = ds.data || [];
        if (!pts.length) return;
        ctx.beginPath();
        pts.forEach((p: PointLike, i: number) => {
          const px = xScale.getPixelForValue(p.x);
          const py = yScale.getPixelForValue(p.y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = ds.backgroundColor || 'rgba(8,153,129,0.12)';
        ctx.fill();
        const width = ds.borderWidth ?? 1;
        if (width > 0) {
          ctx.lineWidth = width;
          ctx.strokeStyle = ds.borderColor || 'rgba(8,153,129,0.55)';
          ctx.stroke();
        }
      });
    } finally {
      ctx.restore();
    }
  },
};

// Key zones (levels, nPOCs, volume profiles, order blocks, liquidity, fibs)
// drawn TradingView-style: zones behind candles, lines on top, a short text
// label at the right end of each line and a coloured tag on the price axis.
// Items come from the carrier dataset built in addKeyZoneDatasets
// (isKeyZone + keyZoneItems).
function keyZoneItemsOf(chart: import('chart.js').Chart): KeyZoneItem[] {
  const out: KeyZoneItem[] = [];
  (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
    if (ds?.isKeyZone && Array.isArray(ds.keyZoneItems)) out.push(...ds.keyZoneItems);
  });
  return out;
}

/** Pixel span of an item, clipped to the plot; null when not in view. */
function keyZoneSpan(
  item: { startX: number | null; endX: number | null },
  xScale: ScaleLike,
  area: { left: number; right: number },
): { x1: number; x2: number } | null {
  const x1 = item.startX == null ? area.left : Math.max(area.left, xScale.getPixelForValue(item.startX));
  const x2 = item.endX == null ? area.right : Math.min(area.right, xScale.getPixelForValue(item.endX));
  if (!Number.isFinite(x1) || !Number.isFinite(x2) || x2 - x1 < 1) return null;
  return { x1, x2 };
}

export function formatKeyZonePrice(price: number): string {
  const abs = Math.abs(price);
  const decimals = abs >= 100 ? 2 : abs >= 1 ? 4 : abs >= 0.01 ? 6 : 8;
  return price.toFixed(decimals);
}

function opaque(color: string): string {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*[\d.]+\)$/.exec(color);
  return m ? `rgb(${m[1]},${m[2]},${m[3]})` : color;
}

/** Dark text on light tags (gold, cyan), white on dark ones. */
function tagTextColor(color: string): string {
  let r: number;
  let g: number;
  let b: number;
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  if (hex) {
    const n = parseInt(hex[1], 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else if (rgb) {
    r = +rgb[1];
    g = +rgb[2];
    b = +rgb[3];
  } else return '#fff';
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#131722' : '#fff';
}

const KZ_FONT = '10px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
const KZ_LABEL_H = 13;
const KZ_TAG_H = 16;

export const keyZonePainterPlugin = {
  id: 'keyZonePainter',
  // Zones behind the candles
  beforeDatasetsDraw(chart: import('chart.js').Chart): void {
    const items = keyZoneItemsOf(chart);
    if (!items.length) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    const area = chart.chartArea;
    if (!ctx || !xScale || !yScale || !area) return;
    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
      for (const item of items) {
        if (item.kind !== 'box') continue;
        const span = keyZoneSpan(item, xScale, area);
        if (!span) continue;
        const yTop = yScale.getPixelForValue(item.top);
        const yBottom = yScale.getPixelForValue(item.bottom);
        if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) continue;
        if (yBottom < area.top || yTop > area.bottom) continue;
        const h = Math.max(1, yBottom - yTop);
        ctx.fillStyle = item.fill;
        ctx.fillRect(span.x1, yTop, span.x2 - span.x1, h);
        ctx.lineWidth = 1;
        ctx.strokeStyle = item.border;
        ctx.strokeRect(Math.round(span.x1) + 0.5, Math.round(yTop) + 0.5, span.x2 - span.x1, Math.round(h));
      }
    } finally {
      ctx.restore();
    }
  },
  // Lines, labels and price-axis tags on top
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    const items = keyZoneItemsOf(chart);
    if (!items.length) return;
    const chartEx = chart as ChartWithCustom;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike & { left?: number; right?: number };
    const area = chart.chartArea;
    if (!ctx || !xScale || !yScale || !area) return;

    const pending: Array<{ priority: number; x: number; y: number; text: string; color: string }> = [];
    const tags: Array<{ y: number; price: number; color: string; priority: number; label: string }> = [];

    ctx.save();
    try {
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
      for (const item of items) {
        const span = keyZoneSpan(item, xScale, area);
        if (!span) continue;
        if (item.kind === 'line') {
          const py = yScale.getPixelForValue(item.price);
          if (!Number.isFinite(py) || py < area.top || py > area.bottom) continue;
          const y = Math.round(py) + 0.5;
          ctx.beginPath();
          ctx.moveTo(span.x1, y);
          ctx.lineTo(span.x2, y);
          ctx.lineWidth = item.width;
          ctx.setLineDash(item.dash);
          ctx.strokeStyle = item.color;
          ctx.stroke();
          if (item.label) {
            pending.push({ priority: item.priority, x: span.x2 - 4, y: py - 2, text: item.label, color: opaque(item.color) });
          }
          if (item.axisTag) {
            tags.push({ y: py, price: item.price, color: opaque(item.color), priority: item.priority, label: item.label });
          }
        } else if (item.label) {
          const yTop = yScale.getPixelForValue(item.top);
          const yBottom = yScale.getPixelForValue(item.bottom);
          if (!Number.isFinite(yTop) || !Number.isFinite(yBottom)) continue;
          if (yBottom < area.top || yTop > area.bottom) continue;
          // Inside the zone when it is tall enough, otherwise just above it.
          const inside = yBottom - yTop >= KZ_LABEL_H + 2;
          const y = inside ? (yTop + yBottom) / 2 + KZ_LABEL_H / 2 : yTop - 2;
          pending.push({ priority: item.priority, x: span.x2 - 4, y, text: item.label, color: item.labelColor });
        }
      }
    } finally {
      ctx.restore();
    }

    const perf = getPerfProfile();
    if (perf.tier === 'low') return;
    if (perf.skipLabelsDuringInteraction && chartEx?._isInteracting) return;

    // Text labels (right-aligned, bottom at y): higher priority first; a label
    // colliding with a placed one is merged into it ("4H Level · 1D nPOC +2").
    const labels: Array<{ x: number; y: number; w: number; color: string; texts: string[] }> = [];
    ctx.save();
    ctx.font = KZ_FONT;
    pending.sort((a, b) => b.priority - a.priority);
    for (const p of pending) {
      if (p.y - KZ_LABEL_H < area.top || p.y > area.bottom) continue;
      const w = ctx.measureText(p.text).width;
      const hit = labels.find(
        (l) => p.x - w < l.x && p.x > l.x - l.w && p.y - KZ_LABEL_H < l.y && p.y > l.y - KZ_LABEL_H,
      );
      if (hit) {
        if (!hit.texts.includes(p.text)) hit.texts.push(p.text);
        continue;
      }
      labels.push({ x: p.x, y: p.y, w, color: p.color, texts: [p.text] });
    }
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.shadowColor = 'rgba(19,23,34,0.9)';
    ctx.shadowBlur = 3;
    for (const l of labels) {
      const shown = l.texts.slice(0, 2).join(' · ');
      ctx.fillStyle = l.color;
      ctx.fillText(l.texts.length > 2 ? `${shown} +${l.texts.length - 2}` : shown, l.x, l.y);
    }
    ctx.restore();

    // Price-axis tags; on overlap the higher priority tag wins.
    const axisLeft = Number.isFinite(yScale.left) ? (yScale.left as number) : area.right;
    const axisRight = Number.isFinite(yScale.right) ? (yScale.right as number) : chart.width;
    const tagW = axisRight - axisLeft;
    if (tagW < 20 || !tags.length) return;
    const placed: number[] = [];
    tags.sort((a, b) => b.priority - a.priority);
    ctx.save();
    ctx.font = KZ_FONT;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (const t of tags) {
      if (placed.some((y) => Math.abs(y - t.y) < KZ_TAG_H)) continue;
      placed.push(t.y);
      ctx.fillStyle = t.color;
      roundRect(ctx, axisLeft + 1, t.y - KZ_TAG_H / 2, tagW - 2, KZ_TAG_H, 2, true, false);
      ctx.fillStyle = tagTextColor(t.color);
      const text = formatKeyZonePrice(t.price);
      ctx.fillText(text, axisLeft + 5, t.y, tagW - 8);
      registerAxisPriceTag(chart, { price: t.price, y: t.y, h: KZ_TAG_H, label: t.label, text, color: t.color });
    }
    ctx.restore();
  },
};

/** Gap between the candle low/high and the nearest anchored indicator glyph. */
const GLYPH_GAP_PX = 6;
/** Space between stacked anchored glyphs on one side of a candle. */
const GLYPH_LINE_GAP_PX = 3;

// Indicator glyphs pinned to candles
export const indicatorLabelPlugin = {
  id: 'indicatorLabels',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    const chartEx = chart as ChartWithCustom;
    const perf = getPerfProfile();
    if (perf.skipLabelsDuringInteraction && chartEx?._isInteracting) return;
    if (perf.tier === 'low') return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const chartArea = chart.chartArea;
    if (!xScale || !chartArea) return;
    ctx.save();
    // Keep indicator glyphs inside the plotting area only.
    ctx.beginPath();
    ctx.rect(
      chartArea.left,
      chartArea.top,
      chartArea.right - chartArea.left,
      chartArea.bottom - chartArea.top,
    );
    ctx.clip();
    ctx.textBaseline = 'middle';
    // Draw only indicator datasets and honor dataset order (higher last)
    const indicatorSets = (chart.data.datasets as ExtendedDataset[])
      .filter((ds) => !!ds && !!ds.isIndicator);
    indicatorSets.sort((a, b) => (((a as Record<string, unknown>)['order'] as number) ?? 0) - (((b as Record<string, unknown>)['order'] as number) ?? 0));
    // Candles with a news marker above them: anchored glyphs above start past it.
    const newsXs = new Set(newsMarkersOf(chart).map((m) => m.x));
    indicatorSets.forEach((ds) => {
      if (!ds || !ds.isIndicator) return;
      const pts = ds.data || [];
      if (!pts.length) return;
      const glyph = ds.glyph || '';
      const color = ds.glyphColor || '#fff';
      const size = ds.glyphSize ?? 14;
      ctx.fillStyle = color;
      ctx.font = `${size}px Arial`;
      const yScaleForDs = chart.scales[ds.yAxisID || 'y'] as unknown as ScaleLike | undefined;
      const yScaleToUse = yScaleForDs || (chart.scales['y'] as unknown as ScaleLike);
      pts.forEach((p: PointLike) => {
        const px = xScale.getPixelForValue(p.x);
        let py = yScaleToUse
          ? yScaleToUse.getPixelForValue(p.y)
          : ((chart.scales['y'] as unknown as ScaleLike | undefined)?.getPixelForValue(p.y) ?? 0);
        if (ds.glyphAnchor) {
          // Fixed pixel distance from the candle, whatever the zoom (like the news markers).
          const above = ds.glyphAnchor === 'above';
          const news = above && newsXs.has(Number(p.x)) ? NEWS_MARKER_CLEARANCE_PX : 0;
          const offset = GLYPH_GAP_PX + news + (ds.glyphSlot ?? 0) * (size + GLYPH_LINE_GAP_PX) + size / 2;
          py += above ? -offset : offset;
        }
        if (
          px < chartArea.left ||
          px > chartArea.right ||
          py < chartArea.top ||
          py > chartArea.bottom
        ) {
          return;
        }
        ctx.save();
        if (ds.glyphAnchor) {
          ctx.textAlign = 'center';
          ctx.fillText(glyph, px, py);
        } else {
          ctx.fillText(
            glyph,
            px - size / 2 + (ds.glyphOffsetX ?? 0),
            py + (ds.glyphOffsetY ?? 0),
          );
        }
        ctx.restore();
      });
    });
    ctx.restore();
  },
};

// Order labels stacked on right side
export const orderLabelPlugin = {
  id: 'orderLabels',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    const chartEx = chart as ChartWithCustom;
    const perf = getPerfProfile();
    if (perf.skipLabelsDuringInteraction && chartEx?._isInteracting) return;
    if (perf.tier === 'low') return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    if (!xScale || !yScale) return;
    const chartArea = chart.chartArea;
    const rightX = chartArea.right - 6;
    const entries: Array<{ yVal: number; text: string; color: string }> = [];
    (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
      if (!ds || !ds.isOrder) return;
      const pts = ds.data || [];
      if (!pts.length) return;
      const yVal = pts[0].y ?? pts[0]['Price'] ?? null;
      if (yVal == null) return;
      const text = (ds.orderLabel || ds.label || '').toString();
      const color = ds.orderColor || (typeof ds.borderColor === 'string' ? ds.borderColor : '#fff') || '#fff';
      entries.push({ yVal: Number(yVal), text, color });
    });
    if (!entries.length) return;
    let pixels = entries
      .map((l) => ({ ...l, yPx: yScale.getPixelForValue(l.yVal) }))
      .sort((a, b) => a.yPx - b.yPx);
    const minSpacing = 14;
    const boxH = 18;
    const padding = 6;
    for (let i = 1; i < pixels.length; i++) {
      if (pixels[i].yPx - pixels[i - 1].yPx < minSpacing)
        pixels[i].yPx = pixels[i - 1].yPx + minSpacing;
    }
    for (let i = 0; i < pixels.length; i++) {
      const topLimit = chartArea.top + 6 + i * minSpacing;
      const bottomLimit =
        chartArea.bottom - 6 - (pixels.length - 1 - i) * minSpacing;
      if (pixels[i].yPx < topLimit) pixels[i].yPx = topLimit;
      if (pixels[i].yPx > bottomLimit) pixels[i].yPx = bottomLimit;
    }
    ctx.save();
    ctx.font = '12px Arial';
    ctx.textBaseline = 'middle';
    pixels.forEach((p) => {
      const displayText = p.text || '';
      const metrics = ctx.measureText(displayText);
      const textW = Math.min(metrics.width, (chart.width || 800) * 0.35);
      const boxW = textW + padding * 2 + 8;
      const x = rightX - boxW;
      const y = p.yPx - boxH / 2;
      ctx.fillStyle = 'rgba(10,10,10,0.8)';
      roundRect(ctx, x, y, boxW, boxH, 4, true, false);
      ctx.fillStyle = p.color || '#FFD700';
      ctx.fillRect(x + 2, y + 2, 6, boxH - 4);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(
        displayText,
        x + padding + 8,
        p.yPx,
        boxW - padding * 2 - 10,
      );
    });
    ctx.restore();
  },
};


// Box min/max price labels pinned to right side
export const boxLabelPlugin = {
  id: 'boxLabels',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    if (getPerfProfile().skipLabelsDuringInteraction && (chart as ChartWithCustom)?._isInteracting) return;
    try {
      const ctx = chart.ctx as CanvasRenderingContext2D;
      const yScale = chart.scales['y'] as unknown as ScaleLike;
      const xScale = chart.scales['x'] as unknown as ScaleLike;
      const chartArea = chart.chartArea;
      if (!yScale || !xScale || !chartArea || !ctx) return;
      // Build combined label entries (one per box) centered vertically in each box, drawn on LEFT side
      const entries: Array<{ midY: number; text: string; color: string }> = [];
      (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
        if (!ds || !ds.isBox) return;
        const pts = ds.data || [];
        if (!pts.length) return;
        const ys = pts
          .map((p: PointLike | number) =>
            typeof p === 'object'
              ? Number(p.y ?? p?.Price ?? p?.value ?? NaN)
              : Number(p),
          )
          .filter((v: number) => !Number.isNaN(v));
        if (!ys.length) return;
        // Determine box horizontal span using x values of polygon points
        const xs = pts
          .map((p: PointLike | number) =>
            typeof p === 'object' ? Number(p.x ?? NaN) : Number(p),
          )
          .filter((v: number) => !Number.isNaN(v));
        if (!xs.length) return;
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        // Current visible x range from scale options/runtime
        const visXMin =
          typeof xScale.min === 'number'
            ? xScale.min
            : (xScale.options?.min ?? null);
        const visXMax =
          typeof xScale.max === 'number'
            ? xScale.max
            : (xScale.options?.max ?? null);
        // Skip label if box is completely outside horizontal viewport
        if (visXMin != null && maxX < visXMin) return;
        if (visXMax != null && minX > visXMax) return;
        // Also skip if vertical span entirely outside y visible range
        const visYMin =
          typeof yScale.min === 'number'
            ? yScale.min
            : (yScale.options?.min ?? null);
        const visYMax =
          typeof yScale.max === 'number'
            ? yScale.max
            : (yScale.options?.max ?? null);
        if (visYMin != null && maxY < visYMin) return;
        if (visYMax != null && minY > visYMax) return;
        const midY = minY + (maxY - minY) / 2;
        const combined =
          ds.boxLabelText ||
          `min: ${ds.boxLabelMin ?? (minY >= 1000 ? minY.toLocaleString() : minY.toFixed(2))} - max: ${ds.boxLabelMax ?? (maxY >= 1000 ? maxY.toLocaleString() : maxY.toFixed(2))}`;
        const color = (typeof ds.borderColor === 'string' ? ds.borderColor : '#fff') || '#fff';
        entries.push({ midY, text: combined, color });
      });
      if (!entries.length) return;
      let pixels = entries
        .map((e) => ({ ...e, yPx: yScale.getPixelForValue(e.midY) }))
        .sort((a, b) => a.yPx - b.yPx);
      const canvasWidth =
        chart.width || (chart.canvas && chart.canvas.width) || 800;
      const isNarrow = canvasWidth < 480;
      const fontSize = isNarrow ? 10 : 11;
      const minSpacing = isNarrow ? 24 : 28; // more spacing since labels are taller now
      const boxH = fontSize + 10;
      const padding = 6;
      for (let i = 1; i < pixels.length; i++) {
        if (pixels[i].yPx - pixels[i - 1].yPx < minSpacing)
          pixels[i].yPx = pixels[i - 1].yPx + minSpacing;
      }
      for (let i = 0; i < pixels.length; i++) {
        const topLimit = chartArea.top + 6 + i * minSpacing;
        const bottomLimit =
          chartArea.bottom - 6 - (pixels.length - 1 - i) * minSpacing;
        if (pixels[i].yPx < topLimit) pixels[i].yPx = topLimit;
        if (pixels[i].yPx > bottomLimit) pixels[i].yPx = bottomLimit;
      }
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textBaseline = 'middle';
      const leftX = chartArea.left + 6; // draw at left side
      pixels.forEach((p) => {
        const text = p.text?.toString() ?? '';
        // measureText retained only if needed for future truncation; currently unused so omitted
        const h = boxH;
        const x = leftX; // left aligned container
        const y = p.yPx - h / 2;
        // Removed background: just draw a slim color bar and the text directly.
        const barColor = p.color || '#fff';
        ctx.fillStyle = barColor;
        ctx.fillRect(x, y + 2, 4, h - 4); // slim vertical bar
        ctx.fillStyle = '#fff';
        // Optional slight shadow for readability over box fill
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 3;
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 6 + padding, p.yPx);
        ctx.shadowBlur = 0;
      });
      ctx.restore();
    } catch (err) {
      console.warn('boxLabelPlugin error', err);
    }
  },
};

// User-provided MIN/MAX dual line label plugin (renders two lines: MIN and MAX)
export const minMaxLabelPlugin = {
  id: 'minMaxLabelPlugin',

  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    const chartEx = chart as ChartWithCustom;
    const perf = getPerfProfile();
    if (perf.skipLabelsDuringInteraction && chartEx?._isInteracting) return;
    if (perf.tier === 'low') return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const yScale = chart.scales?.['y'] as unknown as ScaleLike | undefined;
    const xScale = chart.scales?.['x'] as unknown as ScaleLike | undefined;
    const chartArea = chart.chartArea;

    if (!yScale || !chartArea) return;

    const datasets = (chart.data?.datasets || []) as ExtendedDataset[];

    datasets.forEach((dataset, dsIndex: number) => {
      if (!dataset?.isBox) return;

      const meta = chart.getDatasetMeta(dsIndex);
      if (!meta || !meta.data || meta.data.length < 1) return;

      const pts: PointLike[] = dataset.data || [];
      if (!pts.length) return;

      // Extract numeric Y values
      const ys: number[] = pts
        .map((p: PointLike) => Number(p.y))
        .filter((v: number): v is number => !Number.isNaN(v));

      if (!ys.length) return;

      // Extract numeric X values for viewport checks
      const xs: number[] = pts
        .map((p: { x: unknown }) => Number(p.x))
        .filter((v: number): v is number => !Number.isNaN(v));

      // If scales provide visible ranges, skip labels when box is fully outside
      if (xScale) {
        const visXMin =
          typeof xScale.min === 'number' ? xScale.min : (xScale.options?.min ?? null);
        const visXMax =
          typeof xScale.max === 'number' ? xScale.max : (xScale.options?.max ?? null);
        if (xs.length) {
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          if (visXMin != null && maxX < visXMin) return; // entirely left of view
          if (visXMax != null && minX > visXMax) return; // entirely right of view
        }
      }

      const visYMin =
        typeof yScale.min === 'number' ? yScale.min : (yScale.options?.min ?? null);
      const visYMax =
        typeof yScale.max === 'number' ? yScale.max : (yScale.options?.max ?? null);
      const boxMinValue: number = Math.min(...ys);
      const boxMaxValue: number = Math.max(...ys);
      if (visYMin != null && boxMaxValue < visYMin) return; // entirely below view
      if (visYMax != null && boxMinValue > visYMax) return; // entirely above view
      // Compute vertical center of the box in data coordinates
      const boxMidValue: number = boxMinValue + (boxMaxValue - boxMinValue) / 2;
      let y: number = yScale.getPixelForValue(boxMidValue);
      // Keep label inside chart area bounds
      const minInset = 12;
      if (y < chartArea.top + minInset) y = chartArea.top + minInset;
      if (y > chartArea.bottom - minInset) y = chartArea.bottom - minInset;

      // Label shows only the box strength
      const strength = (dataset as Record<string, unknown>)['boxStrength'];
      if (strength === undefined || strength === null || strength === '') return;
      const displayText = `S: ${strength}`;

      // TradingView-style: small text in the zone's colour on a faint plate, no outline or glow.
      const fontSize = 10;
      const x = chartArea.left + 4;
      const color =
        typeof dataset.borderColor === 'string' && dataset.borderColor
          ? opaque(dataset.borderColor)
          : LEGEND_TITLE_COLOR;

      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.font = `${fontSize}px ${LEGEND_FONT_FAMILY}`;
      const textWidth = ctx.measureText(displayText).width;
      ctx.fillStyle = 'rgba(19,23,34,0.7)';
      roundRect(ctx, x, y - fontSize / 2 - 2, textWidth + 8, fontSize + 4, 2, true, false);
      ctx.fillStyle = color;
      ctx.fillText(displayText, x + 4, y);
      ctx.restore();
    });
  },
};

// Divergence painter — draws the items of the carrier dataset built in
// buildDivergenceDatasets (isDivergence + divergenceLines/divergenceDots):
// start→end lines at the carrier's draw order (behind the candles) and
// filled circles with the indicator labels on top. Off-screen items are skipped.
const DIV_DOT_RADIUS = 12;
const DIV_DOT_PAD = 4; // room for the outline and the text shadow
const DIV_DOT_SPRITE_MAX = 200;
const divDotSprites = new Map<string, HTMLCanvasElement | null>();

/**
 * A dot (circle + label) rendered once to an offscreen canvas. Redrawing it is a
 * single drawImage, instead of an arc, two paints and a shadowBlur'd fillText per
 * dot on every frame (crosshair moves redraw the chart; shadowBlur is slow on mobile).
 * Null when no 2D canvas is available; the caller then draws directly.
 */
function divDotSprite(color: string, text: string, dpr: number): HTMLCanvasElement | null {
  const key = `${color}|${text}|${dpr}`;
  if (divDotSprites.has(key)) return divDotSprites.get(key)!;
  if (divDotSprites.size >= DIV_DOT_SPRITE_MAX) divDotSprites.clear();
  let sprite: HTMLCanvasElement | null = null;
  try {
    const size = (DIV_DOT_RADIUS + DIV_DOT_PAD) * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size * dpr);
    canvas.height = Math.ceil(size * dpr);
    const sctx = canvas.getContext('2d');
    if (sctx) {
      sctx.scale(dpr, dpr);
      paintDivDot(sctx, size / 2, size / 2, color, text);
      sprite = canvas;
    }
  } catch {
    sprite = null;
  }
  divDotSprites.set(key, sprite);
  return sprite;
}

function paintDivDot(ctx: CanvasRenderingContext2D, px: number, py: number, color: string, text: string): void {
  const r = DIV_DOT_RADIUS;
  const fontSize = Math.max(7, Math.min(10, Math.floor(r * 0.8)));
  ctx.save();
  // Filled circle
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Indicator label(s) inside the circle
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 3;
  ctx.fillText(text, px, py);
  ctx.restore();
}

export const divergencePainterPlugin = {
  id: 'divergencePainter',
  afterDatasetDraw(chart: import('chart.js').Chart, args: { index: number }): void {
    const ds = chart.data.datasets[args.index] as ExtendedDataset | undefined;
    const lines = ds?.isDivergence ? ds.divergenceLines : undefined;
    if (!lines?.length) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    const area = chart.chartArea;
    if (!ctx || !xScale || !yScale || !area) return;

    // One path (one stroke) per colour instead of one per line
    const paths = new Map<string, Array<[number, number, number, number]>>();
    for (const line of lines) {
      const x1 = xScale.getPixelForValue(line.x1);
      const x2 = xScale.getPixelForValue(line.x2);
      if (x2 < area.left || x1 > area.right) continue;
      const y1 = yScale.getPixelForValue(line.y1);
      const y2 = yScale.getPixelForValue(line.y2);
      if (![x1, x2, y1, y2].every(Number.isFinite)) continue;
      let segs = paths.get(line.color);
      if (!segs) paths.set(line.color, (segs = []));
      segs.push([x1, y1, x2, y2]);
    }
    if (!paths.size) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
    ctx.lineWidth = 2;
    paths.forEach((segs, color) => {
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of segs) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.strokeStyle = color;
      ctx.stroke();
    });
    ctx.restore();
  },
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    const chartEx = chart as ChartWithCustom;
    const perf = getPerfProfile();
    if (perf.skipLabelsDuringInteraction && chartEx?._isInteracting) return;
    if (perf.tier === 'low') return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    const area = chart.chartArea;
    if (!ctx || !xScale || !yScale || !area) return;

    const r = DIV_DOT_RADIUS;
    const half = r + DIV_DOT_PAD;
    const dpr = chart.currentDevicePixelRatio || 1;
    (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
      if (!ds?.isDivergence || !ds.divergenceDots?.length) return;
      for (const dot of ds.divergenceDots) {
        const px = xScale.getPixelForValue(dot.x);
        if (!Number.isFinite(px) || px < area.left - r || px > area.right + r) continue;
        const py = yScale.getPixelForValue(dot.y);
        if (!Number.isFinite(py) || py < area.top - r || py > area.bottom + r) continue;

        const color = dot.color || '#FF1744';
        const text = dot.labels.join('/');
        const sprite = divDotSprite(color, text, dpr);
        if (sprite) ctx.drawImage(sprite, px - half, py - half, half * 2, half * 2);
        else paintDivDot(ctx, px, py, color, text);
      }
    });
  },
};

const LEGEND_LABEL_COLOR = '#787b86';

type LegendCandle = { x: number; o: number; h: number; l: number; c: number };

/** Candle whose time is `time` (binary search on sorted x); null when there is none. */
export function findCandleAt(points: LegendCandle[], time: number): LegendCandle | null {
  let lo = 0;
  let hi = points.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const x = points[mid].x;
    if (x === time) return points[mid];
    if (x < time) lo = mid + 1;
    else hi = mid - 1;
  }
  return null;
}

/** Legend price text: 2 decimals from 1 up, more for small prices, with thousands separators (TradingView). */
export function formatLegendPrice(value: number): string {
  return formatPriceText(value, priceLabelDecimals(value));
}

/** O/H/L/C segments and the change versus the previous close (or the open for the first candle). */
export function buildLegendSegments(
  candle: LegendCandle,
  previousClose: number | null,
): Array<{ text: string; kind: 'label' | 'value' }> {
  const base = previousClose != null && Number.isFinite(previousClose) ? previousClose : candle.o;
  const change = candle.c - base;
  const pct = base !== 0 ? (change / base) * 100 : 0;
  const sign = change >= 0 ? '+' : '';
  return [
    { text: 'O', kind: 'label' },
    { text: formatLegendPrice(candle.o), kind: 'value' },
    { text: ' H', kind: 'label' },
    { text: formatLegendPrice(candle.h), kind: 'value' },
    { text: ' L', kind: 'label' },
    { text: formatLegendPrice(candle.l), kind: 'value' },
    { text: ' C', kind: 'label' },
    { text: formatLegendPrice(candle.c), kind: 'value' },
    { text: ` ${sign}${formatLegendPrice(change)} (${sign}${pct.toFixed(2)}%)`, kind: 'value' },
  ];
}

/** Legend symbol icon size; the title shifts right by this plus a gap when the icon is drawn. */
const LEGEND_ICON_PX = 18;

/** Cached legend icon image; reloaded (and redrawn on load) when the symbol's icon URL changes. */
function legendIconImage(chart: ChartWithCustom, src: string): HTMLImageElement {
  let img = chart._legendIconImg;
  if (!img || img.dataset['legendIconSrc'] !== src) {
    img = new Image();
    img.dataset['legendIconSrc'] = src;
    img.onload = (): void => {
      try {
        chart.draw();
      } catch {
        /* ignore */
      }
    };
    img.src = src;
    chart._legendIconImg = img;
  }
  return img;
}

/**
 * TradingView legend in the top-left of the price pane: the symbol icon, "BTCUSDT · 1H · Binance" and
 * the O/H/L/C of the candle under the crosshair (the latest candle otherwise). Title and icon come from
 * the canvas attributes data-legend-title / data-legend-icon, which Angular keeps current; charts
 * without candles or title draw nothing.
 */
export const legendPlugin = {
  id: 'mtbLegend',
  afterDraw(chart: import('chart.js').Chart): void {
    const chartEx = chart as ChartWithCustom;
    const area = chart.chartArea;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    if (!area || !ctx) return;
    const title = (chart.canvas as HTMLCanvasElement | undefined)?.dataset?.['legendTitle'] ?? '';
    const candleDataset = (chart.data.datasets as ExtendedDataset[]).find((d) => d?.type === 'candlestick');
    const points = (candleDataset?.data ?? []) as unknown as LegendCandle[];
    if (!title && !points.length) return;

    const time = chartEx._crosshairTime;
    let candle = time != null ? findCandleAt(points, time) : null;
    if (!candle) candle = points[points.length - 1] ?? null;
    const index = candle ? points.indexOf(candle) : -1;
    const previousClose = index > 0 ? points[index - 1].c : null;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const x = area.left + 8;
    let y = area.top + 6;
    if (title) {
      let titleX = x;
      const iconSrc = (chart.canvas as HTMLCanvasElement | undefined)?.dataset?.['legendIcon'] ?? '';
      if (iconSrc) {
        const icon = legendIconImage(chartEx, iconSrc);
        if (icon.complete && icon.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x + LEGEND_ICON_PX / 2, y + LEGEND_ICON_PX / 2 - 2, LEGEND_ICON_PX / 2, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(icon, x, y - 2, LEGEND_ICON_PX, LEGEND_ICON_PX);
          ctx.restore();
          titleX = x + LEGEND_ICON_PX + 6;
        }
      }
      ctx.font = `500 13px ${LEGEND_FONT_FAMILY}`;
      ctx.fillStyle = LEGEND_TITLE_COLOR;
      ctx.fillText(title, titleX, y);
      y += 19;
    }
    if (candle && [candle.o, candle.h, candle.l, candle.c].every((v) => Number.isFinite(v))) {
      const valueColor = candle.c >= candle.o ? CANDLE_UP_COLOR : CANDLE_DOWN_COLOR;
      ctx.font = `12px ${LEGEND_FONT_FAMILY}`;
      let cx = x;
      for (const seg of buildLegendSegments(candle, previousClose)) {
        ctx.fillStyle = seg.kind === 'label' ? LEGEND_LABEL_COLOR : valueColor;
        ctx.fillText(seg.text, cx, y);
        cx += ctx.measureText(seg.text).width + (seg.kind === 'label' ? 2 : 0);
        if (cx > area.right - 8) break;
      }
      // Volume overlay legend row (TradingView "Vol · BTC 1.96K"), only when the overlay is on.
      const volumeTitle = volumeTitleOf(chart);
      const volume = (candle as LegendCandle & { v?: number }).v;
      if (volumeTitle && Number.isFinite(volume)) {
        y += 18;
        ctx.fillStyle = LEGEND_TITLE_COLOR;
        ctx.fillText(volumeTitle, x, y);
        ctx.fillStyle = valueColor;
        ctx.fillText(formatVolume(volume as number), x + ctx.measureText(volumeTitle).width + 6, y);
      }
    }
    ctx.restore();
  },
};

// TradingView-style canvas background fill
const chartBackgroundPlugin = {
  id: 'chartBackground',
  beforeDraw(chart: import('chart.js').Chart): void {
    const ctx = chart.ctx as CanvasRenderingContext2D;
    ctx.save();
    ctx.fillStyle = '#131722';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

const WATERMARK_MAX_FRACTION = 0.35;
const WATERMARK_ALPHA = 0.15;

/** Watermark box: centred in the plot, at most 35% of the plot in both directions. */
export function watermarkRect(
  area: { left: number; top: number; bottom: number; width: number; height: number },
  naturalWidth: number,
  naturalHeight: number,
): { drawW: number; drawH: number; x: number; y: number } {
  const aspect = naturalWidth / (naturalHeight || 1);
  let drawW = Math.min(naturalWidth, area.width * WATERMARK_MAX_FRACTION);
  let drawH = drawW / aspect;
  const maxHeight = area.height * WATERMARK_MAX_FRACTION;
  if (drawH > maxHeight) {
    drawH = maxHeight;
    drawW = drawH * aspect;
  }
  return {
    drawW,
    drawH,
    x: area.left + (area.width - drawW) / 2,
    y: area.top + (area.height - drawH) / 2,
  };
}

// Aggregate export for easy import
export const chartCustomPlugins = [
  axisPriceTagResetPlugin,
  chartBackgroundPlugin,
  crosshairPlugin,
  latestCandleGuidePlugin,
  boxPainterPlugin,
  keyZonePainterPlugin,
  indicatorLabelPlugin,
  divergencePainterPlugin,
  orderLabelPlugin,
  // boxLabelPlugin removed to avoid duplicate min/max text rendering
  minMaxLabelPlugin,
  legendPlugin,
  // Watermark plugin (added dynamically)
  {
    id: 'watermark',
    afterDraw(chart: import('chart.js').Chart): void {
      try {
        const chartEx = chart as ChartWithCustom;
        const perf = getPerfProfile();
        if (!perf.enableWatermark) return;
        const ctx = chart.ctx as CanvasRenderingContext2D;
        const area = chart.chartArea;
        if (!area || !ctx) return;
        // Avoid drawing during interaction for performance
        if (perf.skipLabelsDuringInteraction && chartEx?._isInteracting) return;
        const imgCache = chartEx._watermarkImg as
          | HTMLImageElement
          | undefined;
        let img = imgCache;
        if (!img) {
          img = new Image();
          img.src = 'assets/watermark.png'; // relative to app root
          chartEx._watermarkImg = img;
        }
        if (!img.complete) {
          img.onload = (): void => {
            try {
              chart.draw();
            } catch {
              /* ignore */
            }
          };
          return;
        }
        const { drawW, drawH, x, y } = watermarkRect(area, img.naturalWidth, img.naturalHeight);
        ctx.save();
        ctx.globalAlpha = WATERMARK_ALPHA;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, drawW, drawH);
        ctx.restore();
      } catch {
        // swallow errors
      }
    },
  },
];
