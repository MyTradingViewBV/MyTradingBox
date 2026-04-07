/**
 * Chart.js plugin that renders user-drawn objects:
 * - Horizontal lines
 * - Vertical lines
 * - Fibonacci retracement
 * - Fibonacci extension
 * - Green / Red boxes (price zones)
 * - In-progress drawing previews
 */

import {
  Drawing,
  DrawingToolsService,
  DEFAULT_FIB_RETRACEMENT_LEVELS,
  DEFAULT_FIB_EXTENSION_LEVELS,
} from './drawing-tools.service';

// Fib level colors (TradingView-style)
const FIB_COLORS: Record<number, string> = {
  0:     'rgba(128,128,128,0.8)',
  0.236: 'rgba(244,67,54,0.7)',
  0.382: 'rgba(255,152,0,0.7)',
  0.5:   'rgba(76,175,80,0.7)',
  0.618: 'rgba(33,150,243,0.7)',
  0.786: 'rgba(156,39,176,0.7)',
  1:     'rgba(128,128,128,0.8)',
  1.618: 'rgba(233,30,99,0.7)',
  2:     'rgba(0,150,136,0.7)',
  2.618: 'rgba(255,87,34,0.7)',
  3.618: 'rgba(103,58,183,0.7)',
  4.236: 'rgba(0,188,212,0.7)',
};

function fibColor(level: number): string {
  return FIB_COLORS[level] || 'rgba(150,150,150,0.6)';
}

function formatPrice(v: number): string {
  const abs = Math.abs(v);
  if (abs === 0) return '0.00';
  if (abs >= 1) return v.toFixed(2);
  const mag = -Math.log10(abs);
  const dec = Math.min(8, Math.max(2, Math.ceil(mag + 2)));
  return v.toFixed(dec);
}

function formatSignedPercent(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function getPositionMiddleBand(
  entryY: number,
  ...edgeYs: number[]
): { top: number; bottom: number; height: number } {
  const distances = edgeYs
    .map((edgeY) => Math.abs(edgeY - entryY))
    .filter((distance) => distance > 0);
  const referenceDistance = distances.length ? Math.min(...distances) : 0;
  const halfBand = Math.max(7, Math.min(13, referenceDistance * 0.18 || 7));
  return {
    top: entryY - halfBand,
    bottom: entryY + halfBand,
    height: halfBand * 2,
  };
}

/**
 * Build the drawing tools plugin.
 * Receives a reference to DrawingToolsService so it can read current drawings.
 */
export function createDrawingToolsPlugin(service: DrawingToolsService) {
  return {
    id: 'drawingTools',

    afterDatasetsDraw(chart: import('chart.js').Chart): void {
      const ctx = chart.ctx as CanvasRenderingContext2D;
      const xScale: any = (chart.scales as any)['x'];
      const yScale: any = (chart.scales as any)['y'];
      const area = chart.chartArea;
      if (!ctx || !xScale || !yScale || !area) return;

      // ── Pass 1: chart-area drawings (clipped) ─────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();

      const rawData: any[] = (chart.data?.datasets?.[0]?.data as any[]) ?? [];

      for (const d of service.drawingsValue) {
        drawDrawing(ctx, d, xScale, yScale, area, service, rawData);
      }

      drawPreview(ctx, service, xScale, yScale, area, rawData);

      ctx.restore();

      // ── Pass 2: y-axis labels (unclipped, right of area.right) ────
      const canvasWidth = (chart.canvas as HTMLCanvasElement).width /
        (window.devicePixelRatio || 1);
      for (const d of service.drawingsValue) {
        drawYAxisLabels(ctx, d, yScale, area, canvasWidth);
      }
      drawPreviewYAxisLabels(ctx, service, yScale, area, canvasWidth);
    },
  };
}

function drawDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: { left: number; right: number; top: number; bottom: number },
  service?: DrawingToolsService,
  rawData?: any[],
): void {
  switch (d.type) {
    case 'horizontal-line':
      drawHorizontalLine(ctx, d, yScale, area, service);
      break;
    case 'vertical-line':
      drawVerticalLine(ctx, d, xScale, area, service);
      break;
    case 'trend-line':
      drawTrendLine(ctx, d, xScale, yScale, service);
      break;
    case 'fib-retracement':
      drawFibRetracement(ctx, d, xScale, yScale, area, service);
      break;
    case 'fib-extension':
      drawFibExtension(ctx, d, xScale, yScale, area, service);
      break;
    case 'box-green':
    case 'box-red':
      drawBox(ctx, d, xScale, yScale, area, service);
      break;
    case 'long-position':
    case 'short-position':
      drawPosition(ctx, d, xScale, yScale, area, service);
      break;
    case 'ruler':
      drawRuler(ctx, d, xScale, yScale, area, service, rawData);
      break;
  }
}

// ─── Trend line ──────────────────────────────
function drawTrendLine(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  service?: DrawingToolsService,
): void {
  if (d.points.length < 2) return;

  const x1 = xScale.getPixelForValue(d.points[0].x);
  const y1 = yScale.getPixelForValue(d.points[0].y);
  const x2 = xScale.getPixelForValue(d.points[1].x);
  const y2 = yScale.getPixelForValue(d.points[1].y);

  const isDragging = service?.draggingId === d.id;
  const isSelected = service?.selectedDrawingId === d.id;
  const isHovered = service?.hoveredId === d.id;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isDragging ? d.lineWidth + 1.5 : d.lineWidth;
  ctx.setLineDash([]);
  if (isDragging || isSelected || isHovered) {
    ctx.shadowColor = d.color;
    ctx.shadowBlur = isDragging ? 8 : 4;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (isSelected || isHovered || isDragging) {
    for (const p of [d.points[0], d.points[1]]) {
      const px = xScale.getPixelForValue(p.x);
      const py = yScale.getPixelForValue(p.y);
      ctx.beginPath();
      ctx.arc(px, py, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = d.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
}

// ─── Horizontal line ─────────────────────────
function drawHorizontalLine(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  yScale: any,
  area: any,
  service?: DrawingToolsService,
): void {
  const py = yScale.getPixelForValue(d.points[0].y);
  const isDragging = service?.draggingId === d.id;
  const isHovered  = service?.hoveredId  === d.id;

  ctx.beginPath();
  ctx.moveTo(area.left, py);
  ctx.lineTo(area.right, py);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isDragging ? d.lineWidth + 1.5 : d.lineWidth;
  ctx.setLineDash([]);
  if (isDragging || isHovered) {
    ctx.shadowColor = d.color;
    ctx.shadowBlur  = isDragging ? 8 : 4;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Small grab handle in the centre of the line when interactive
  if (isHovered || isDragging) {
    const cx = (area.left + area.right) / 2;
    ctx.beginPath();
    ctx.arc(cx, py, 5, 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  // Price label is drawn in the y-axis column via drawYAxisLabels (Pass 2)
}

// ─── Vertical line ───────────────────────────
function drawVerticalLine(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  area: any,
  service?: DrawingToolsService,
): void {
  const px = xScale.getPixelForValue(d.points[0].x);
  const isDragging = service?.draggingId === d.id;
  const isHovered  = service?.hoveredId  === d.id;

  ctx.beginPath();
  ctx.moveTo(px, area.top);
  ctx.lineTo(px, area.bottom);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isDragging ? d.lineWidth + 1.5 : d.lineWidth;
  ctx.setLineDash([]);
  if (isDragging || isHovered) {
    ctx.shadowColor = d.color;
    ctx.shadowBlur  = isDragging ? 8 : 4;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Small grab handle in the centre of the line when interactive
  if (isHovered || isDragging) {
    const cy = (area.top + area.bottom) / 2;
    ctx.beginPath();
    ctx.arc(px, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ─── Position (Long/Short trade zone) ────────
function drawPosition(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: any,
  service?: DrawingToolsService,
): void {
  if (d.points.length < 3) return;
  const isDragging = service?.draggingId === d.id;
  const isHovered  = service?.hoveredId  === d.id;

  const x1 = xScale.getPixelForValue(d.points[0].x);
  const x2 = xScale.getPixelForValue(d.points[1].x);
  const entryY = yScale.getPixelForValue(d.points[0].y);
  const tpY    = yScale.getPixelForValue(d.points[1].y);
  const slY    = yScale.getPixelForValue(d.points[2].y);

  const left  = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const w = right - left;
  if (w < 2) return;

  const entryPrice = d.points[0].y;
  const tpPrice = d.points[1].y;
  const slPrice = d.points[2].y;
  const isLong = tpPrice > entryPrice;
  const base = Math.abs(entryPrice) > Number.EPSILON ? Math.abs(entryPrice) : 1;
  const tpPct = isLong
    ? ((tpPrice - entryPrice) / base) * 100
    : ((entryPrice - tpPrice) / base) * 100;
  const slPct = isLong
    ? -((entryPrice - slPrice) / base) * 100
    : -((slPrice - entryPrice) / base) * 100;

  const alphaGreen = isDragging ? 0.50 : isHovered ? 0.42 : 0.35;
  const alphaRed   = isDragging ? 0.40 : isHovered ? 0.32 : 0.25;
  const alphaMid   = isDragging ? 0.36 : isHovered ? 0.30 : 0.24;
  const middleBand = getPositionMiddleBand(entryY, tpY, slY);

  // ── Profit zone (green: entry → TP) ──────────────────────────────
  const tpAnchorY = tpY < entryY ? middleBand.bottom : middleBand.top;
  const tpTop = Math.min(tpY, tpAnchorY);
  const tpH   = Math.abs(tpY - tpAnchorY);
  if (tpH > 0) {
    ctx.fillStyle = `rgba(8,153,129,${alphaGreen})`;
    ctx.fillRect(left, tpTop, w, tpH);
    ctx.strokeStyle = '#089981';
    ctx.lineWidth = isDragging ? 2.5 : 2;
    if (isDragging || isHovered) { ctx.shadowColor = '#089981'; ctx.shadowBlur = isDragging ? 8 : 4; }
    ctx.strokeRect(left, tpTop, w, tpH);
    ctx.shadowBlur = 0;
    // TP label centred inside profit zone
    if (tpH > 16) {
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`TP  ${formatPrice(tpPrice)} (${formatSignedPercent(tpPct)})`, left + 6, tpTop + tpH / 2);
    }
  }

  // ── Loss zone (red: SL → entry) ───────────────────────────────────
  const slAnchorY = slY < entryY ? middleBand.bottom : middleBand.top;
  const slTop = Math.min(slY, slAnchorY);
  const slH   = Math.abs(slY - slAnchorY);
  if (slH > 0) {
    ctx.fillStyle = `rgba(247,82,95,${alphaRed})`;
    ctx.fillRect(left, slTop, w, slH);
    ctx.strokeStyle = '#F7525F';
    ctx.lineWidth = isDragging ? 2.5 : 2;
    if (isDragging || isHovered) { ctx.shadowColor = '#F7525F'; ctx.shadowBlur = isDragging ? 8 : 4; }
    ctx.strokeRect(left, slTop, w, slH);
    ctx.shadowBlur = 0;
    // SL label centred inside loss zone
    if (slH > 16) {
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`SL  ${formatPrice(slPrice)} (${formatSignedPercent(slPct)})`, left + 6, slTop + slH / 2);
    }
  }

  // ── Neutral middle zone (grey around entry) ──────────────────────
  ctx.fillStyle = `rgba(107,114,128,${alphaMid})`;
  ctx.fillRect(left, middleBand.top, w, middleBand.height);
  ctx.strokeStyle = 'rgba(203,213,225,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(left, middleBand.top, w, middleBand.height);

  // ── Entry line ────────────────────────────────────────────────────
  ctx.beginPath();
  ctx.moveTo(left, entryY);
  ctx.lineTo(right, entryY);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Entry price label at left edge of entry line
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(formatPrice(d.points[0].y), left + 6, middleBand.top - 3);

  // ── R:R badge ─────────────────────────────────────────────────────
  const tpPips = Math.abs(tpPrice - entryPrice);
  const slPips = Math.abs(slPrice - entryPrice);
  if (slPips > 0 && w > 60) {
    const rr = (tpPips / slPips).toFixed(2);
    const rrLabel = `${isLong ? 'Long' : 'Short'}  R:R ${rr}`;
    ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
    const tw = ctx.measureText(rrLabel).width + 12;
    const bx = left + (w - tw) / 2;
    const badgeH = 16;
    const by = entryY - badgeH / 2;
    ctx.fillStyle = 'rgba(31,41,55,0.92)';
    ctx.beginPath();
    if ((ctx as any).roundRect) (ctx as any).roundRect(bx, by, tw, badgeH, 3);
    else ctx.rect(bx, by, tw, badgeH);
    ctx.fill();
    ctx.fillStyle = isLong ? '#089981' : '#F7525F';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(rrLabel, bx + tw / 2, by + badgeH / 2);
  }

  // ── Selection handles (shown when drawing is tapped/selected) ────
  if (service?.selectedDrawingId === d.id) {
    const handles: [number, number][] = [
      [left,  tpY], [right, tpY],
      [left,  entryY], [right, entryY],
      [left,  slY], [right, slY],
    ];
    for (const [hx, hy] of handles) {
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(41,98,255,0.85)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
function drawBox(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: any,
  service?: DrawingToolsService,
): void {
  if (d.points.length < 2) return;
  const isDragging = service?.draggingId === d.id;
  const isHovered  = service?.hoveredId  === d.id;
  const isGreen = d.type === 'box-green';

  const x1 = xScale.getPixelForValue(d.points[0].x);
  const y1 = yScale.getPixelForValue(d.points[0].y);
  const x2 = xScale.getPixelForValue(d.points[1].x);
  const y2 = yScale.getPixelForValue(d.points[1].y);
  const left   = Math.min(x1, x2);
  const top    = Math.min(y1, y2);
  const width  = Math.abs(x2 - x1);
  const height = Math.abs(y2 - y1);
  if (width < 1 || height < 1) return;

  // Semi-transparent fill
  ctx.fillStyle = isGreen ? 'rgba(8,153,129,0.15)' : 'rgba(247,82,95,0.15)';
  ctx.fillRect(left, top, width, height);

  // Border
  ctx.strokeStyle = d.color;
  ctx.lineWidth   = isDragging ? 2 : isHovered ? 1.8 : 1.5;
  ctx.setLineDash([]);
  if (isDragging || isHovered) {
    ctx.shadowColor = d.color;
    ctx.shadowBlur  = isDragging ? 8 : 4;
  }
  ctx.strokeRect(left, top, width, height);
  ctx.shadowBlur = 0;

  // Label ("Long" / "Short") centred inside the box
  const label = isGreen ? 'Long' : 'Short';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = d.color;
  ctx.globalAlpha = 0.7;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, left + width / 2, top + height / 2);
  ctx.globalAlpha = 1;
}

// ─── Fib Retracement ─────────────────────────
function drawFibRetracement(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: any,
  service?: DrawingToolsService,
): void {
  const p0 = d.points[0]; // start (e.g. swing low)
  const p1 = d.points[1]; // end (e.g. swing high)
  const levels = d.fibLevels || DEFAULT_FIB_RETRACEMENT_LEVELS;
  const range = p1.y - p0.y;
  const isSelected = service?.selectedDrawingId === d.id;
  const isDragging = service?.draggingId === d.id;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const price = p1.y - level * range;
    const py = yScale.getPixelForValue(price);

    // Fill zone between this level and next
    if (i < levels.length - 1) {
      const nextPrice = p1.y - levels[i + 1] * range;
      const nextPy = yScale.getPixelForValue(nextPrice);
      ctx.fillStyle = fibColor(level).replace(/[\d.]+\)$/, '0.06)');
      ctx.fillRect(area.left, Math.min(py, nextPy), area.right - area.left, Math.abs(nextPy - py));
    }

    // Line
    ctx.beginPath();
    ctx.moveTo(area.left, py);
    ctx.lineTo(area.right, py);
    ctx.strokeStyle = fibColor(level);
    ctx.lineWidth = level === 0 || level === 1 ? 1.5 : 1;
    ctx.setLineDash(level === 0.5 ? [4, 4] : []);
    ctx.stroke();

    // Label
    const pct = (level * 100).toFixed(1);
    const label = `${pct}%  ${formatPrice(price)}`;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
    ctx.fillStyle = fibColor(level);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, area.left + 8, py - 3);
  }
  ctx.setLineDash([]);

  // Draw editable anchors + baseline for retracement.
  const px0 = xScale.getPixelForValue(p0.x);
  const py0 = yScale.getPixelForValue(p0.y);
  const px1 = xScale.getPixelForValue(p1.x);
  const py1 = yScale.getPixelForValue(p1.y);

  ctx.beginPath();
  ctx.moveTo(px0, py0);
  ctx.lineTo(px1, py1);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isDragging ? 2 : 1.5;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  const r = isSelected ? 6 : 4;
  for (const [px, py] of [[px0, py0], [px1, py1]]) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? 'rgba(41,98,255,0.9)' : d.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();
  }
}

// ─── Fib Extension ───────────────────────────
function drawFibExtension(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: any,
  service?: DrawingToolsService,
): void {
  // 3 points: A (swing start), B (swing end), C (pullback)
  const pA = d.points[0];
  const pB = d.points[1];
  const pC = d.points[2];
  const range = pB.y - pA.y; // direction of the initial move
  const levels = d.fibLevels || DEFAULT_FIB_EXTENSION_LEVELS;
  const isSelected = service?.selectedDrawingId === d.id;
  const isDragging = service?.draggingId === d.id;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const price = pC.y + level * range;
    const py = yScale.getPixelForValue(price);

    // Fill zone
    if (i < levels.length - 1) {
      const nextPrice = pC.y + levels[i + 1] * range;
      const nextPy = yScale.getPixelForValue(nextPrice);
      ctx.fillStyle = fibColor(level).replace(/[\d.]+\)$/, '0.06)');
      ctx.fillRect(area.left, Math.min(py, nextPy), area.right - area.left, Math.abs(nextPy - py));
    }

    // Line
    ctx.beginPath();
    ctx.moveTo(area.left, py);
    ctx.lineTo(area.right, py);
    ctx.strokeStyle = fibColor(level);
    ctx.lineWidth = level === 0 || level === 1 ? 1.5 : 1;
    ctx.setLineDash(level === 0.5 ? [4, 4] : []);
    ctx.stroke();

    // Label
    const pct = (level * 100).toFixed(1);
    const label = `${pct}%  ${formatPrice(price)}`;
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
    ctx.fillStyle = fibColor(level);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, area.left + 8, py - 3);
  }
  ctx.setLineDash([]);

  // Draw connecting lines A→B→C
  const pxA = xScale.getPixelForValue(pA.x);
  const pyA = yScale.getPixelForValue(pA.y);
  const pxB = xScale.getPixelForValue(pB.x);
  const pyB = yScale.getPixelForValue(pB.y);
  const pxC = xScale.getPixelForValue(pC.x);
  const pyC = yScale.getPixelForValue(pC.y);

  ctx.beginPath();
  ctx.moveTo(pxA, pyA);
  ctx.lineTo(pxB, pyB);
  ctx.lineTo(pxC, pyC);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = isDragging ? 2 : 1.5;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw small circles at anchor points
  const r = isSelected ? 6 : 4;
  for (const [px, py] of [[pxA, pyA], [pxB, pyB], [pxC, pyC]]) {
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? 'rgba(41,98,255,0.9)' : d.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.stroke();
  }
}

// ─── Preview (in-progress drawing) ───────────
// ─── Ruler ───────────────────────────────────
function drawRuler(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: any,
  service?: DrawingToolsService,
  rawData?: any[],
): void {
  if (d.points.length < 2) return;
  const p0 = d.points[0];
  const p1 = d.points[1];

  const x0px = xScale.getPixelForValue(p0.x);
  const y0px = yScale.getPixelForValue(p0.y);
  const x1px = xScale.getPixelForValue(p1.x);
  const y1px = yScale.getPixelForValue(p1.y);

  const isSelected = service?.selectedDrawingId === d.id;
  const isUp = p1.y >= p0.y;
  const color = isUp ? '#089981' : '#F7525F';

  const left   = Math.min(x0px, x1px);
  const right  = Math.max(x0px, x1px);
  const top    = Math.min(y0px, y1px);
  const bottom = Math.max(y0px, y1px);
  const w = right - left;
  const h = bottom - top;

  // Semi-transparent fill
  ctx.fillStyle = isUp ? 'rgba(8,153,129,0.15)' : 'rgba(247,82,95,0.15)';
  ctx.fillRect(left, top, w, h);

  // Horizontal edges (dashed)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 3]);
  ctx.beginPath(); ctx.moveTo(left, top);    ctx.lineTo(right, top);    ctx.stroke();
  ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
  ctx.setLineDash([]);

  // Vertical edges (dashed)
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(x0px, top); ctx.lineTo(x0px, bottom); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1px, top); ctx.lineTo(x1px, bottom); ctx.stroke();
  ctx.setLineDash([]);

  // Anchor dots
  for (const [px, py] of [[x0px, y0px], [x1px, y1px]] as [number, number][]) {
    ctx.beginPath();
    ctx.arc(px, py, isSelected ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.stroke();
  }

  // Info badge
  const priceDiff = p1.y - p0.y;
  const pctChange = p0.y !== 0 ? (priceDiff / p0.y) * 100 : 0;
  const sign = priceDiff >= 0 ? '+' : '';

  let barCount = 0;
  if (rawData && rawData.length) {
    const minX = Math.min(p0.x, p1.x);
    const maxX = Math.max(p0.x, p1.x);
    barCount = rawData.filter((c: any) => c.x >= minX && c.x <= maxX).length - 1;
    if (barCount < 0) barCount = 0;
  }
  const days = Math.round(Math.abs(p1.x - p0.x) / (1000 * 60 * 60 * 24));

  drawRulerBadge(ctx, area, (left + right) / 2, (top + bottom) / 2, priceDiff, pctChange, sign, barCount, days, color);
}

function drawRulerBadge(
  ctx: CanvasRenderingContext2D,
  area: any,
  centerX: number,
  centerY: number,
  priceDiff: number,
  pctChange: number,
  sign: string,
  barCount: number,
  days: number,
  color: string,
): void {
  const line1 = `${formatPrice(Math.abs(priceDiff))}  (${sign}${pctChange.toFixed(2)}%)`;
  const line2 = barCount > 0 ? `${barCount} bars, ${days}d` : `${days}d`;

  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
  const tw1 = ctx.measureText(line1).width;
  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  const tw2 = ctx.measureText(line2).width;

  const badgeW = Math.max(tw1, tw2) + 20;
  const badgeH = 44;
  const cx = Math.max(area.left + badgeW / 2 + 4, Math.min(area.right - badgeW / 2 - 4, centerX));
  const cy = Math.max(area.top  + badgeH / 2 + 4, Math.min(area.bottom - badgeH / 2 - 4, centerY));
  const bx = cx - badgeW / 2;
  const by = cy - badgeH / 2;

  ctx.fillStyle = 'rgba(13,17,28,0.92)';
  ctx.beginPath();
  if ((ctx as any).roundRect) { (ctx as any).roundRect(bx, by, badgeW, badgeH, 5); }
  else { ctx.rect(bx, by, badgeW, badgeH); }
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(line1, cx, by + 7);

  ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillStyle = '#ccc';
  ctx.fillText(line2, cx, by + 26);
}

function drawPreview(
  ctx: CanvasRenderingContext2D,
  service: DrawingToolsService,
  xScale: any,
  yScale: any,
  area: any,
  rawData?: any[],
): void {
  const tool    = service.activeToolValue;
  const pending = service.pendingDrawingPoints;
  const cursor  = service.cursorPosition;

  // ── Snap indicator (always drawn when magnet locks) ──────────────
  const snap = service.snapIndicator;
  if (snap) {
    ctx.save();
    const isStrong   = service.magnetMode === 'strong';
    const snapFill   = isStrong ? 'rgba(249,115,22,0.2)'  : 'rgba(251,191,36,0.2)';
    const snapStroke = isStrong ? '#f97316' : '#fbbf24';
    ctx.beginPath();
    ctx.arc(snap.px, snap.py, 7, 0, Math.PI * 2);
    ctx.fillStyle = snapFill;
    ctx.fill();
    ctx.strokeStyle = snapStroke;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = snapStroke;
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(snap.label, snap.px + 9, snap.py - 5);
    ctx.restore();
  }

  if (!tool || !cursor) return;

  const fibRetColor = '#F7525F'; // TradingView red
  const fibExtColor = '#089981'; // TradingView teal
  // ── Long/Short Position preview ──────────────────────────────────
  if (tool === 'long-position' || tool === 'short-position') {
    const posColor = '#2962FF';
    if (pending.length === 0) {
      // Step 1: place entry point
      drawCursorCrosshair(ctx, cursor, area, posColor);
    } else if (pending.length === 1) {
      // Step 2: drag to set right edge + TP
      const ax = xScale.getPixelForValue(pending[0].x);
      const ay = yScale.getPixelForValue(pending[0].y); // entry
      const bx = cursor.x;
      const tpY = cursor.y;
      const left  = Math.min(ax, bx);
      const right = Math.max(ax, bx);
      const w = right - left;
      const middleBand = getPositionMiddleBand(ay, tpY);
      // Profit zone preview (entry to cursor)
      if (w > 2 && Math.abs(tpY - ay) > 2) {
        const tpAnchorY = tpY < ay ? middleBand.bottom : middleBand.top;
        const tpTop = Math.min(tpY, tpAnchorY);
        const tpH   = Math.abs(tpY - tpAnchorY);
        ctx.fillStyle = 'rgba(8,153,129,0.15)';
        ctx.fillRect(left, tpTop, w, tpH);
        ctx.strokeStyle = '#089981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(left, tpTop, w, tpH);
        ctx.setLineDash([]);
      }
      ctx.fillStyle = 'rgba(107,114,128,0.20)';
      ctx.fillRect(left, middleBand.top, w, middleBand.height);
      ctx.strokeStyle = 'rgba(203,213,225,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(left, middleBand.top, w, middleBand.height);
      // Entry line
      ctx.beginPath();
      ctx.moveTo(left, ay);
      ctx.lineTo(right, ay);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      drawLockedAnchor(ctx, ax, ay, posColor, '1');
      drawCursorDot(ctx, cursor.x, cursor.y, '#089981', '2');
    } else if (pending.length === 2) {
      // Step 3: cursor sets SL price (x fixed)
      const ax   = xScale.getPixelForValue(pending[0].x);
      const bx   = xScale.getPixelForValue(pending[1].x);
      const entryY = yScale.getPixelForValue(pending[0].y);
      const tpY    = yScale.getPixelForValue(pending[1].y);
      const slY    = cursor.y;
      const left  = Math.min(ax, bx);
      const right = Math.max(ax, bx);
      const w = right - left;
      const middleBand = getPositionMiddleBand(entryY, tpY, slY);
      // TP zone
      const tpAnchorY = tpY < entryY ? middleBand.bottom : middleBand.top;
      const tpTop = Math.min(tpY, tpAnchorY);
      const tpH   = Math.abs(tpY - tpAnchorY);
      if (tpH > 0 && w > 2) {
        ctx.fillStyle = 'rgba(8,153,129,0.15)';
        ctx.fillRect(left, tpTop, w, tpH);
        ctx.strokeStyle = '#089981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(left, tpTop, w, tpH);
      }
      // SL zone (rubber-band)
      const slAnchorY = slY < entryY ? middleBand.bottom : middleBand.top;
      const slTop = Math.min(slY, slAnchorY);
      const slH   = Math.abs(slY - slAnchorY);
      if (slH > 0 && w > 2) {
        ctx.fillStyle = 'rgba(247,82,95,0.15)';
        ctx.fillRect(left, slTop, w, slH);
        ctx.strokeStyle = '#F7525F';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(left, slTop, w, slH);
        ctx.setLineDash([]);
      }
      ctx.fillStyle = 'rgba(107,114,128,0.20)';
      ctx.fillRect(left, middleBand.top, w, middleBand.height);
      ctx.strokeStyle = 'rgba(203,213,225,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(left, middleBand.top, w, middleBand.height);
      // Entry line
      ctx.beginPath();
      ctx.moveTo(left, entryY);
      ctx.lineTo(right, entryY);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      drawLockedAnchor(ctx, ax, yScale.getPixelForValue(pending[0].y), posColor, '1');
      drawLockedAnchor(ctx, bx, tpY, '#089981', '2');
      drawCursorDot(ctx, cursor.x, cursor.y, '#F7525F', '3');
    }
    return;
  }
  // ── Box (green/red zone) preview ─────────────────────────────────
  if (tool === 'box-green' || tool === 'box-red') {
    const isGreen = tool === 'box-green';
    const color   = isGreen ? '#089981' : '#F7525F';

    if (pending.length === 0) {
      // Step 1: no anchor yet — show crosshair
      drawCursorCrosshair(ctx, cursor, area, color);
    } else if (pending.length === 1) {
      // Step 2: first corner placed, rubber-band box to cursor
      const ax = xScale.getPixelForValue(pending[0].x);
      const ay = yScale.getPixelForValue(pending[0].y);
      const bx = cursor.x;
      const by = cursor.y;
      const left   = Math.min(ax, bx);
      const top    = Math.min(ay, by);
      const width  = Math.abs(bx - ax);
      const height = Math.abs(by - ay);
      if (width > 2 && height > 2) {
        ctx.fillStyle = isGreen ? 'rgba(8,153,129,0.12)' : 'rgba(247,82,95,0.12)';
        ctx.fillRect(left, top, width, height);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(left, top, width, height);
        ctx.setLineDash([]);
      }
      drawLockedAnchor(ctx, ax, ay, color, '1');
      drawCursorDot(ctx, cursor.x, cursor.y, color, '2');
    }
    return;
  }

  // ── Horizontal line preview ──────────────────────────────────────
  if (tool === 'horizontal-line' && pending.length === 0) {
    ctx.beginPath();
    ctx.moveTo(area.left, cursor.y);
    ctx.lineTo(area.right, cursor.y);
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Price badge rendered in y-axis column by drawPreviewYAxisLabels (Pass 2)
    return;
  }

  // ── Trend line preview ───────────────────────────────────────────
  if (tool === 'trend-line') {
    const color = '#2962FF';
    if (pending.length === 0) {
      drawCursorCrosshair(ctx, cursor, area, color);
      return;
    }
    if (pending.length === 1) {
      const x1 = xScale.getPixelForValue(pending[0].x);
      const y1 = yScale.getPixelForValue(pending[0].y);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      drawLockedAnchor(ctx, x1, y1, color, '1');
      drawCursorDot(ctx, cursor.x, cursor.y, color, '2');
      return;
    }
  }

  // ── Fib Retracement ─────────────────────────────────────────────
  if (tool === 'fib-retracement') {
    if (pending.length === 0) {
      // No points yet — crosshair + cursor dot; price badge via Pass 2
      drawCursorCrosshair(ctx, cursor, area, fibRetColor);
    } else if (pending.length === 1) {
      const p0x = xScale.getPixelForValue(pending[0].x);
      const p0y = yScale.getPixelForValue(pending[0].y);
      if (Math.abs(cursor.y - p0y) < 6) return;

      const price1 = yScale.getValueForPixel(cursor.y);
      const range  = price1 - pending[0].y;
      const levels = DEFAULT_FIB_RETRACEMENT_LEVELS;

      // Fib level preview lines
      ctx.globalAlpha = 0.75;
      for (const level of levels) {
        const price = price1 - level * range;
        const py    = yScale.getPixelForValue(price);
        ctx.beginPath();
        ctx.moveTo(area.left, py);
        ctx.lineTo(area.right, py);
        ctx.strokeStyle = fibColor(level);
        ctx.lineWidth   = level === 0 || level === 1 ? 1.5 : 1;
        ctx.setLineDash(level === 0.5 ? [4, 4] : []);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Solid connecting line p0 → cursor
      ctx.beginPath();
      ctx.moveTo(p0x, p0y);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.strokeStyle = fibRetColor;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();

      // Locked anchor at p0 (step 1 placed)
      drawLockedAnchor(ctx, p0x, p0y, fibRetColor, '1');
      // Floating cursor dot for step 2
      drawCursorDot(ctx, cursor.x, cursor.y, fibRetColor, '2');
      // Price badges rendered in y-axis column by drawPreviewYAxisLabels (Pass 2)
    }
    return;
  }

  // ── Fib Extension ───────────────────────────────────────────────
  if (tool === 'fib-extension') {
    if (pending.length === 0) {
      // No points yet — crosshair + cursor dot; price badge via Pass 2
      drawCursorCrosshair(ctx, cursor, area, fibExtColor);
    } else if (pending.length === 1) {
      const pxA = xScale.getPixelForValue(pending[0].x);
      const pyA = yScale.getPixelForValue(pending[0].y);
      if (Math.hypot(cursor.x - pxA, cursor.y - pyA) < 6) return;

      ctx.beginPath();
      ctx.moveTo(pxA, pyA);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.strokeStyle = fibExtColor;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();

      drawLockedAnchor(ctx, pxA, pyA, fibExtColor, '1');
      drawCursorDot(ctx, cursor.x, cursor.y, fibExtColor, '2');
      // Price badges rendered in y-axis column by drawPreviewYAxisLabels (Pass 2)
    } else if (pending.length === 2) {
      const pxA = xScale.getPixelForValue(pending[0].x);
      const pyA = yScale.getPixelForValue(pending[0].y);
      const pxB = xScale.getPixelForValue(pending[1].x);
      const pyB = yScale.getPixelForValue(pending[1].y);

      ctx.beginPath();
      ctx.moveTo(pxA, pyA);
      ctx.lineTo(pxB, pyB);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.strokeStyle = fibExtColor;
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([]);
      ctx.stroke();

      // Extension levels preview
      ctx.globalAlpha = 0.75;
      const rangeAB = pending[1].y - pending[0].y;
      const priceC  = yScale.getValueForPixel(cursor.y);
      for (const level of DEFAULT_FIB_EXTENSION_LEVELS) {
        const price = priceC + level * rangeAB;
        const py    = yScale.getPixelForValue(price);
        ctx.beginPath();
        ctx.moveTo(area.left, py);
        ctx.lineTo(area.right, py);
        ctx.strokeStyle = fibColor(level);
        ctx.lineWidth   = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      drawLockedAnchor(ctx, pxA, pyA, fibExtColor, '1');
      drawLockedAnchor(ctx, pxB, pyB, fibExtColor, '2');
      drawCursorDot(ctx, cursor.x, cursor.y, fibExtColor, '3');
      // Price badges rendered in y-axis column by drawPreviewYAxisLabels (Pass 2)
    }
    return;
  }

  // ── Ruler preview ────────────────────────────────────────────────
  if (tool === 'ruler') {
    if (pending.length === 0) {
      drawCursorCrosshair(ctx, cursor, area, '#1E90FF');
    } else if (pending.length === 1) {
      const p0 = pending[0];
      const x0px = xScale.getPixelForValue(p0.x);
      const y0px = yScale.getPixelForValue(p0.y);
      const x1px = cursor.x;
      const y1px = cursor.y;

      const p1Price = yScale.getValueForPixel(y1px);
      const isUp = p1Price >= p0.y;
      const previewColor = isUp ? '#089981' : '#F7525F';

      const left   = Math.min(x0px, x1px);
      const right  = Math.max(x0px, x1px);
      const top    = Math.min(y0px, y1px);
      const bottom = Math.max(y0px, y1px);
      const w = right - left;
      const h = bottom - top;

      if (w > 2 && h > 2) {
        ctx.fillStyle = isUp ? 'rgba(8,153,129,0.12)' : 'rgba(247,82,95,0.12)';
        ctx.fillRect(left, top, w, h);

        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath(); ctx.moveTo(left, top);    ctx.lineTo(right, top);    ctx.stroke();
        ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = previewColor;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(x0px, top); ctx.lineTo(x0px, bottom); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1px, top); ctx.lineTo(x1px, bottom); ctx.stroke();
        ctx.setLineDash([]);

        // Live badge
        const priceDiff = p1Price - p0.y;
        const pctChange = p0.y !== 0 ? (priceDiff / p0.y) * 100 : 0;
        const sign = priceDiff >= 0 ? '+' : '';
        const cursorDataX = xScale.getValueForPixel(cursor.x);

        let barCount = 0;
        if (rawData && rawData.length) {
          const minX = Math.min(p0.x, cursorDataX);
          const maxX = Math.max(p0.x, cursorDataX);
          barCount = rawData.filter((c: any) => c.x >= minX && c.x <= maxX).length - 1;
          if (barCount < 0) barCount = 0;
        }
        const days = Math.round(Math.abs(cursorDataX - p0.x) / (1000 * 60 * 60 * 24));

        drawRulerBadge(ctx, area, (left + right) / 2, (top + bottom) / 2, priceDiff, pctChange, sign, barCount, days, previewColor);
      }

      drawLockedAnchor(ctx, x0px, y0px, '#1E90FF', '1');
      drawCursorDot(ctx, cursor.x, cursor.y, previewColor, '2');
    }
    return;
  }
}

/** Dashed crosshair through cursor + small filled dot (step 0: no point placed yet). */
function drawCursorCrosshair(
  ctx: CanvasRenderingContext2D,
  cursor: { x: number; y: number },
  area: { left: number; right: number; top: number; bottom: number },
  color: string,
): void {
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(area.left, cursor.y);
  ctx.lineTo(area.right, cursor.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cursor.x, area.top);
  ctx.lineTo(cursor.x, area.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // Solid cursor dot
  ctx.beginPath();
  ctx.arc(cursor.x, cursor.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Large locked anchor dot: white outer ring + colored fill + step digit.
 * Makes it immediately obvious that a point has been placed.
 */
function drawLockedAnchor(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  step: string,
): void {
  // Soft halo
  ctx.beginPath();
  ctx.arc(px, py, 11, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  // White outer ring
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = 2;
  ctx.setLineDash([]);
  ctx.stroke();
  // Colored inner fill
  ctx.beginPath();
  ctx.arc(px, py, 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // Step digit
  ctx.fillStyle       = '#ffffff';
  ctx.font            = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign       = 'center';
  ctx.textBaseline    = 'middle';
  ctx.fillText(step, px, py);
}

/**
 * Floating cursor dot with dashed ring + step label.
 * Shows where the NEXT point will be locked if the user clicks.
 */
function drawCursorDot(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  color: string,
  step: string,
): void {
  // Dashed ring
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);
  // Center dot
  ctx.beginPath();
  ctx.arc(px, py, 3, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  // Step label to the right of cursor
  ctx.fillStyle    = color;
  ctx.font         = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(step, px + 11, py);
}

/** Price badge at right edge of chart area (within clip) — REMOVED, replaced by drawAxisBadge in y-axis column. */

/** Draw price-badge labels in the y-axis column for completed drawings. */
function drawYAxisLabels(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  yScale: any,
  area: { left: number; right: number; top: number; bottom: number },
  canvasWidth: number,
): void {
  if (d.type === 'horizontal-line') {
    const py = yScale.getPixelForValue(d.points[0].y);
    if (py >= area.top && py <= area.bottom) {
      drawAxisBadge(ctx, d.points[0].y, py, area, canvasWidth, d.color);
    }
    return;
  }

  // Position tool: badge for entry, TP and SL
  if ((d.type === 'long-position' || d.type === 'short-position') && d.points.length >= 3) {
    const entryPy = yScale.getPixelForValue(d.points[0].y);
    const tpPy    = yScale.getPixelForValue(d.points[1].y);
    const slPy    = yScale.getPixelForValue(d.points[2].y);
    if (entryPy >= area.top && entryPy <= area.bottom)
      drawAxisBadge(ctx, d.points[0].y, entryPy, area, canvasWidth, '#2962FF', 'Entry');
    if (tpPy >= area.top && tpPy <= area.bottom)
      drawAxisBadge(ctx, d.points[1].y, tpPy, area, canvasWidth, '#089981', 'High');
    if (slPy >= area.top && slPy <= area.bottom)
      drawAxisBadge(ctx, d.points[2].y, slPy, area, canvasWidth, '#F7525F', 'Low');
    return;
  }

  // Box: show badges for top and bottom price levels
  if ((d.type === 'box-green' || d.type === 'box-red') && d.points.length >= 2) {
    const priceTop = Math.max(d.points[0].y, d.points[1].y);
    const priceBot = Math.min(d.points[0].y, d.points[1].y);
    const pyTop = yScale.getPixelForValue(priceTop);
    const pyBot = yScale.getPixelForValue(priceBot);
    if (pyTop >= area.top && pyTop <= area.bottom)
      drawAxisBadge(ctx, priceTop, pyTop, area, canvasWidth, d.color);
    if (pyBot >= area.top && pyBot <= area.bottom)
      drawAxisBadge(ctx, priceBot, pyBot, area, canvasWidth, d.color);
    return;
  }

  const isFibRet = d.type === 'fib-retracement';
  const isFibExt = d.type === 'fib-extension';
  if (!isFibRet && !isFibExt) return;

  const levels = d.fibLevels ||
    (isFibRet ? DEFAULT_FIB_RETRACEMENT_LEVELS : DEFAULT_FIB_EXTENSION_LEVELS);

  let prices: number[];
  if (isFibRet) {
    const range = d.points[1].y - d.points[0].y;
    prices = levels.map(l => d.points[1].y - l * range);
  } else {
    const range = d.points[1].y - d.points[0].y;
    prices = levels.map(l => d.points[2].y + l * range);
  }

  for (let i = 0; i < levels.length; i++) {
    const py = yScale.getPixelForValue(prices[i]);
    if (py < area.top || py > area.bottom) continue;
    const color = fibColor(levels[i]);
    const pct   = (levels[i] * 100).toFixed(1);
    drawAxisBadge(ctx, prices[i], py, area, canvasWidth, color, pct + '%');
  }
}

/** Draw preview price badges in y-axis column while a drawing is in progress. */
function drawPreviewYAxisLabels(
  ctx: CanvasRenderingContext2D,
  service: DrawingToolsService,
  yScale: any,
  area: { left: number; right: number; top: number; bottom: number },
  canvasWidth: number,
): void {
  const tool    = service.activeToolValue;
  const pending = service.pendingDrawingPoints;
  const cursor  = service.cursorPosition;
  if (!tool || !cursor) return;

  const fibRetColor = '#F7525F';
  const fibExtColor = '#089981';

  if (tool === 'long-position' || tool === 'short-position') {
    const posColor = '#2962FF';
    // Badge for each placed anchor
    for (let i = 0; i < pending.length; i++) {
      const py = yScale.getPixelForValue(pending[i].y);
      const col = i === 0 ? posColor : i === 1 ? '#089981' : '#F7525F';
      if (py >= area.top && py <= area.bottom)
        drawAxisBadge(ctx, pending[i].y, py, area, canvasWidth, col);
    }
    // Live cursor badge
    if (cursor.y >= area.top && cursor.y <= area.bottom) {
      const cursorPrice = yScale.getValueForPixel(cursor.y);
      const liveCol = pending.length === 0 ? posColor : pending.length === 1 ? '#089981' : '#F7525F';
      drawAxisBadge(ctx, cursorPrice, cursor.y, area, canvasWidth, liveCol);
    }
    return;
  }

  if (tool === 'fib-retracement') {
    const color = fibRetColor;
    if (pending.length >= 1) {
      const py = yScale.getPixelForValue(pending[0].y);
      if (py >= area.top && py <= area.bottom)
        drawAxisBadge(ctx, pending[0].y, py, area, canvasWidth, color);
    }
    // Cursor price badge
    const cursorPrice = yScale.getValueForPixel(cursor.y);
    if (cursor.y >= area.top && cursor.y <= area.bottom)
      drawAxisBadge(ctx, cursorPrice, cursor.y, area, canvasWidth, color);
  }

  if (tool === 'fib-extension') {
    const color = fibExtColor;
    for (const pt of pending) {
      const py = yScale.getPixelForValue(pt.y);
      if (py >= area.top && py <= area.bottom)
        drawAxisBadge(ctx, pt.y, py, area, canvasWidth, color);
    }
    const cursorPrice = yScale.getValueForPixel(cursor.y);
    if (cursor.y >= area.top && cursor.y <= area.bottom)
      drawAxisBadge(ctx, cursorPrice, cursor.y, area, canvasWidth, color);
  }

  if (tool === 'horizontal-line') {
    const cursorPrice = yScale.getValueForPixel(cursor.y);
    if (cursor.y >= area.top && cursor.y <= area.bottom)
      drawAxisBadge(ctx, cursorPrice, cursor.y, area, canvasWidth, '#2962FF');
  }
}

/**
 * Draw a price badge in the y-axis column to the right of area.right.
 * Optionally prefixed with a short string (like a fib percentage).
 */
function drawAxisBadge(
  ctx: CanvasRenderingContext2D,
  price: number,
  py: number,
  area: { left: number; right: number; top: number; bottom: number },
  canvasWidth: number,
  color: string,
  prefix?: string,
): void {
  const priceText = formatPrice(price);
  const text      = prefix ? `${prefix} ${priceText}` : priceText;
  ctx.font        = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
  const tw        = ctx.measureText(text).width;
  const boxW      = Math.min(tw + 10, canvasWidth - area.right - 2); // never overflows canvas
  if (boxW < 6) return;
  const boxH = 18;
  const x    = area.right + 2;
  const y    = py - boxH / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  if ((ctx as any).roundRect) { (ctx as any).roundRect(x, y, boxW, boxH, 3); }
  else { ctx.rect(x, y, boxW, boxH); }
  ctx.fill();

  ctx.fillStyle    = '#ffffff';
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 5, py);
}
