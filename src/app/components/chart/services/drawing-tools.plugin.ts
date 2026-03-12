/**
 * Chart.js plugin that renders user-drawn objects:
 * - Horizontal lines
 * - Vertical lines
 * - Fibonacci retracement
 * - Fibonacci extension
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

      ctx.save();
      // Clip to chart area
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();

      // Draw completed drawings
      for (const d of service.drawingsValue) {
        drawDrawing(ctx, d, xScale, yScale, area);
      }

      // Draw in-progress preview
      drawPreview(ctx, service, xScale, yScale, area);

      ctx.restore();
    },
  };
}

function drawDrawing(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: { left: number; right: number; top: number; bottom: number },
): void {
  switch (d.type) {
    case 'horizontal-line':
      drawHorizontalLine(ctx, d, yScale, area);
      break;
    case 'vertical-line':
      drawVerticalLine(ctx, d, xScale, area);
      break;
    case 'fib-retracement':
      drawFibRetracement(ctx, d, xScale, yScale, area);
      break;
    case 'fib-extension':
      drawFibExtension(ctx, d, xScale, yScale, area);
      break;
  }
}

// ─── Horizontal line ─────────────────────────
function drawHorizontalLine(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  yScale: any,
  area: any,
): void {
  const py = yScale.getPixelForValue(d.points[0].y);
  ctx.beginPath();
  ctx.moveTo(area.left, py);
  ctx.lineTo(area.right, py);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = d.lineWidth;
  ctx.setLineDash([]);
  ctx.stroke();

  // Price label on right
  drawPriceLabel(ctx, d.points[0].y, py, area.right, d.color);
}

// ─── Vertical line ───────────────────────────
function drawVerticalLine(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  area: any,
): void {
  const px = xScale.getPixelForValue(d.points[0].x);
  ctx.beginPath();
  ctx.moveTo(px, area.top);
  ctx.lineTo(px, area.bottom);
  ctx.strokeStyle = d.color;
  ctx.lineWidth = d.lineWidth;
  ctx.setLineDash([]);
  ctx.stroke();
}

// ─── Fib Retracement ─────────────────────────
function drawFibRetracement(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: any,
): void {
  const p0 = d.points[0]; // start (e.g. swing low)
  const p1 = d.points[1]; // end (e.g. swing high)
  const levels = d.fibLevels || DEFAULT_FIB_RETRACEMENT_LEVELS;
  const range = p1.y - p0.y;

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
}

// ─── Fib Extension ───────────────────────────
function drawFibExtension(
  ctx: CanvasRenderingContext2D,
  d: Drawing,
  xScale: any,
  yScale: any,
  area: any,
): void {
  // 3 points: A (swing start), B (swing end), C (pullback)
  const pA = d.points[0];
  const pB = d.points[1];
  const pC = d.points[2];
  const range = pB.y - pA.y; // direction of the initial move
  const levels = d.fibLevels || DEFAULT_FIB_EXTENSION_LEVELS;

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
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw small circles at anchor points
  for (const [px, py] of [[pxA, pyA], [pxB, pyB], [pxC, pyC]]) {
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ─── Preview (in-progress drawing) ───────────
function drawPreview(
  ctx: CanvasRenderingContext2D,
  service: DrawingToolsService,
  xScale: any,
  yScale: any,
  area: any,
): void {
  const tool = service.activeToolValue;
  const pending = service.pendingDrawingPoints;
  const cursor = service.cursorPosition;
  if (!tool || !cursor) return;

  ctx.globalAlpha = 0.6;

  // Anchor dot for all fib tools before any point is placed
  if ((tool === 'fib-retracement' || tool === 'fib-extension') && pending.length === 0) {
    ctx.beginPath();
    ctx.arc(cursor.x, cursor.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'fib-retracement' ? '#F7525F' : '#089981';
    ctx.fill();
    // Crosshair guidelines
    ctx.strokeStyle = tool === 'fib-retracement' ? '#F7525F' : '#089981';
    ctx.lineWidth = 1;
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
  }

  if (tool === 'horizontal-line' && pending.length === 0) {
    // Preview horizontal line at cursor y
    const py = cursor.y;
    ctx.beginPath();
    ctx.moveTo(area.left, py);
    ctx.lineTo(area.right, py);
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (tool === 'vertical-line' && pending.length === 0) {
    const px = cursor.x;
    ctx.beginPath();
    ctx.moveTo(px, area.top);
    ctx.lineTo(px, area.bottom);
    ctx.strokeStyle = '#2962FF';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (tool === 'fib-retracement' && pending.length === 1) {
    // Preview: first point placed, show fib levels to cursor position
    const p0x = xScale.getPixelForValue(pending[0].x);
    const p0y = yScale.getPixelForValue(pending[0].y);
    const p1y = cursor.y;
    const price0 = pending[0].y;
    const price1 = yScale.getValueForPixel(p1y);
    const range = price1 - price0;
    const levels = DEFAULT_FIB_RETRACEMENT_LEVELS;

    for (const level of levels) {
      const price = price1 - level * range;
      const py = yScale.getPixelForValue(price);
      ctx.beginPath();
      ctx.moveTo(area.left, py);
      ctx.lineTo(area.right, py);
      ctx.strokeStyle = fibColor(level);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Line from p0 to cursor and anchor dot at p0
    ctx.beginPath();
    ctx.moveTo(p0x, p0y);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.strokeStyle = '#F7525F';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(p0x, p0y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#F7525F';
    ctx.fill();
  }

  if (tool === 'fib-extension') {
    if (pending.length === 1) {
      // Line from A to cursor + anchor dot at A
      const pxA = xScale.getPixelForValue(pending[0].x);
      const pyA = yScale.getPixelForValue(pending[0].y);
      ctx.beginPath();
      ctx.moveTo(pxA, pyA);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.strokeStyle = '#089981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(pxA, pyA, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#089981';
      ctx.fill();
    } else if (pending.length === 2) {
      // Line A→B→cursor, plus preview levels
      const pxA = xScale.getPixelForValue(pending[0].x);
      const pyA = yScale.getPixelForValue(pending[0].y);
      const pxB = xScale.getPixelForValue(pending[1].x);
      const pyB = yScale.getPixelForValue(pending[1].y);

      ctx.beginPath();
      ctx.moveTo(pxA, pyA);
      ctx.lineTo(pxB, pyB);
      ctx.lineTo(cursor.x, cursor.y);
      ctx.strokeStyle = '#089981';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Preview extension levels
      const rangeAB = pending[1].y - pending[0].y;
      const priceC = yScale.getValueForPixel(cursor.y);
      const levels = DEFAULT_FIB_EXTENSION_LEVELS;
      for (const level of levels) {
        const price = priceC + level * rangeAB;
        const py = yScale.getPixelForValue(price);
        ctx.beginPath();
        ctx.moveTo(area.left, py);
        ctx.lineTo(area.right, py);
        ctx.strokeStyle = fibColor(level);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  }

  ctx.globalAlpha = 1;

  // Draw snap indicator when magnet is locking onto an OHLC point
  const snap = service.snapIndicator;
  if (snap) {
    ctx.save();
    const isStrong = service.magnetMode === 'strong';
    const snapFill = isStrong ? 'rgba(249,115,22,0.2)' : 'rgba(251,191,36,0.2)';
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
}

// ─── Price label helper ──────────────────────
function drawPriceLabel(
  ctx: CanvasRenderingContext2D,
  price: number,
  py: number,
  rightEdge: number,
  color: string,
): void {
  const text = formatPrice(price);
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
  const tw = ctx.measureText(text).width;
  const boxW = tw + 10;
  const boxH = 20;
  const x = rightEdge - boxW - 2;
  const y = py - boxH / 2;

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect?.(x, y, boxW, boxH, 3) ?? ctx.rect(x, y, boxW, boxH);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + boxW / 2, py);
}
