/* Centralized Chart.js custom plugins extracted from chart-component.ts
  Each plugin relies only on dataset flags (isBox, isKeyZone, isIndicator, isOrder)
  and the chart instance; no component state dependency.
  Lint relaxed here because these are thin wrappers over Chart.js runtime objects. */
 

import type { KeyZoneItem } from '../utils/key-zone-layers';

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
  _isInteracting?: boolean;
  _watermarkImg?: HTMLImageElement;
};

type PerfProfileLike = {
  tier?: 'low' | 'balanced' | 'high';
  skipLabelsDuringInteraction?: boolean;
  enableWatermark?: boolean;
};

function getPerfProfile(): PerfProfileLike {
  try {
    const profile = (window as Window & { __chartPerfProfile?: PerfProfileLike }).__chartPerfProfile;
    return profile || { tier: 'balanced', skipLabelsDuringInteraction: true, enableWatermark: true };
  } catch {
    return { tier: 'balanced', skipLabelsDuringInteraction: true, enableWatermark: true };
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
  isDivergenceLine?: boolean;
  divLabels?: string[];
  divColor?: string;
}

/** Crosshair style shared with linked panels (MCB). */
export const CROSSHAIR_LINE_COLOR = 'rgba(150,150,150,0.6)';
export const CROSSHAIR_DASH = [4, 4];
export const CROSSHAIR_LABEL_BG = '#363a45';
const CROSSHAIR_FONT = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
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

export const crosshairPlugin = {
  id: 'crosshair',
  // Position is managed by ChartInteractionService (no afterEvent needed).
  // _crosshairX / _crosshairY are set/cleared by touch & mouse handlers.
  // y == null: the pointer is in a linked panel; only the vertical line shows.
  afterDraw(chart: import('chart.js').Chart): void {
    const chartEx = chart as ChartWithCustom;
    const x = chartEx._crosshairX;
    const y = chartEx._crosshairY;
    if (x == null) return;

    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    const area = chart.chartArea;
    if (!area) return;

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
      const abs = Math.abs(priceValue);
      let priceString = '';
      if (abs === 0) {
        priceString = '0.00';
      } else if (abs >= 1) {
        priceString = priceValue.toFixed(2);
      } else {
        const mag = -Math.log10(abs);
        const decimals = Math.min(8, Math.max(2, Math.ceil(mag + 2)));
        priceString = priceValue.toFixed(decimals);
      }

      ctx.font = CROSSHAIR_FONT;
      const priceBoxWidth = ctx.measureText(priceString).width + 12;
      // Draw on the right axis area
      ctx.fillStyle = CROSSHAIR_LABEL_BG;
      roundRect(ctx, area.right + 1, y - CROSSHAIR_LABEL_HEIGHT / 2, priceBoxWidth, CROSSHAIR_LABEL_HEIGHT, 3, true, false);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceString, area.right + 1 + priceBoxWidth / 2, y);
    }

    // --- X-axis label (timestamp); a linked panel shows it when this chart hides its time axis ---
    const xHidden = (chart.options?.scales?.['x'] as { display?: unknown } | undefined)?.display === false;
    if (!xHidden && xScale?.getValueForPixel) {
      drawCrosshairTimeLabel(ctx, area, x, xScale.getValueForPixel(x), area.bottom + 1);
    }

    ctx.restore();
  },
};
// Small L-shaped guide from the latest candle close to the right price axis
// and down to the matching timestamp axis.
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
    ctx.moveTo(candleX, closeY);
    ctx.lineTo(area.right, closeY);
    // Without an x-axis (MCB page: a linked panel below carries it) run to the
    // canvas edge so the line continues into that panel.
    const xHidden = (chart.options?.scales?.['x'] as { display?: unknown } | undefined)?.display === false;
    ctx.moveTo(candleX, closeY);
    ctx.lineTo(candleX, xHidden ? chart.height : area.bottom);
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(190, 196, 210, 0.7)';
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
        ctx.fillStyle = ds.backgroundColor || 'rgba(0,200,0,0.12)';
        ctx.fill();
        ctx.lineWidth = ds.borderWidth ?? 2;
        ctx.strokeStyle = ds.borderColor || 'rgba(57,255,20,0.9)';
        ctx.stroke();
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
    const tags: Array<{ y: number; price: number; color: string; priority: number }> = [];

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
          if (item.axisTag) tags.push({ y: py, price: item.price, color: opaque(item.color), priority: item.priority });
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
      ctx.fillText(formatKeyZonePrice(t.price), axisLeft + 5, t.y, tagW - 8);
    }
    ctx.restore();
  },
};

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
        const py = yScaleToUse
          ? yScaleToUse.getPixelForValue(p.y)
          : ((chart.scales['y'] as unknown as ScaleLike | undefined)?.getPixelForValue(p.y) ?? 0);
        if (
          px < chartArea.left ||
          px > chartArea.right ||
          py < chartArea.top ||
          py > chartArea.bottom
        ) {
          return;
        }
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText(
          glyph,
          px - size / 2 + (ds.glyphOffsetX ?? 0),
          py + (ds.glyphOffsetY ?? 0),
        );
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
    if ((chart as ChartWithCustom)?._isInteracting) return;
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

      // Slightly larger for readability on most screens
      const fontSize = 9;
      const padding = 4;
      const textPaddingX = 4;
      const textPaddingY = 2;

      // Label X position
      let x = chartArea.left + padding;

      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.font = `${fontSize}px Roboto`;

      //
      // 1. Draw HIGH-VISIBILITY BACKGROUND PLATE
      //

      const metrics = ctx.measureText(displayText);
      const textWidth = metrics.width;

      // Background rect geometry
      const bgX = x + 14; // leave room for the small colored icon
      const bgY = y - fontSize / 2 - textPaddingY;
      const bgW = textWidth + textPaddingX * 2;
      const bgH = fontSize + textPaddingY * 2;

      // Rounded box
      ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;

      const radius = 3;

      ctx.beginPath();
      ctx.moveTo(bgX + radius, bgY);
      ctx.lineTo(bgX + bgW - radius, bgY);
      ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + radius);
      ctx.lineTo(bgX + bgW, bgY + bgH - radius);
      ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - radius, bgY + bgH);
      ctx.lineTo(bgX + radius, bgY + bgH);
      ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + radius);
      ctx.lineTo(bgX, bgY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      //
      // 2. Draw small icon showing box color
      //
      const iconSize = 10;
      const iconX = x;
      const iconY = y - iconSize / 2;

      const fillColor =
        typeof dataset.backgroundColor === 'string'
          ? dataset.backgroundColor
          : 'rgba(255,255,255,0.15)';

      const strokeColor =
        typeof dataset.borderColor === 'string'
          ? dataset.borderColor
          : '#ffffff';

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.rect(iconX, iconY, iconSize, iconSize);
      ctx.fill();
      ctx.stroke();

      //
      // 3. Draw high-contrast text with glow
      //
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';

      const textX = bgX + textPaddingX;
      ctx.fillText(displayText, textX, y);

      ctx.restore();
    });
  },
};

// Divergence dot plugin — draws filled circles with indicator label text inside
export const divergenceDotPlugin = {
  id: 'divergenceDots',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    const chartEx = chart as ChartWithCustom;
    const perf = getPerfProfile();
    if (perf.skipLabelsDuringInteraction && chartEx?._isInteracting) return;
    if (perf.tier === 'low') return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale = chart.scales['x'] as unknown as ScaleLike;
    const yScale = chart.scales['y'] as unknown as ScaleLike;
    if (!xScale || !yScale) return;

    ctx.save();
    (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
      if (!ds?.isDivergence || ds.isDivergenceLine) return;
      const pts = ds.data || [];
      if (!pts.length) return;

      const labels: string[] = ds.divLabels || [];
      const color = ds.divColor || '#FF1744';
      const radius = 12;
      const fontSize = Math.max(7, Math.min(10, Math.floor(radius * 0.8)));

      pts.forEach((p: PointLike) => {
        const px = xScale.getPixelForValue(p.x);
        const py = yScale.getPixelForValue(p.y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return;

        // Draw filled circle
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw indicator label(s) inside the circle
        const text = labels.join('/');
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 3;
        ctx.fillText(text, px, py);
        ctx.shadowBlur = 0;
      });
    });
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

// Aggregate export for easy import
export const chartCustomPlugins = [
  chartBackgroundPlugin,
  crosshairPlugin,
  latestCandleGuidePlugin,
  boxPainterPlugin,
  keyZonePainterPlugin,
  indicatorLabelPlugin,
  divergenceDotPlugin,
  orderLabelPlugin,
  // boxLabelPlugin removed to avoid duplicate min/max text rendering
  minMaxLabelPlugin,
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
        const maxWidth = area.width * 0.35; // scale relative to chart width
        const aspect = img.naturalWidth / (img.naturalHeight || 1);
        let drawW = Math.min(img.naturalWidth, maxWidth);
        let drawH = drawW / aspect;
        const maxHeight = area.height * 0.35;
        if (drawH > maxHeight) {
          drawH = maxHeight;
          drawW = drawH * aspect;
        }
        const cx = area.left + area.width / 2;
        const cy = area.top + area.height / 2;
        const x = cx - drawW / 2;
        const y = cy - drawH / 2;
        ctx.save();
        // Brighten watermark: previously 0.08 (very subtle). Increased alpha for more visibility.
        ctx.globalAlpha = 0.15; // brighter watermark
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, drawW, drawH);
        ctx.restore();
      } catch {
        // swallow errors
      }
    },
  },
];
