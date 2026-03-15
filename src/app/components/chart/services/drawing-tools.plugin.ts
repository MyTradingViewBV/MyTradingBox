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

      // ── Pass 1: chart-area drawings (clipped) ─────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();

      for (const d of service.drawingsValue) {
        drawDrawing(ctx, d, xScale, yScale, area, service);
      }

      drawPreview(ctx, service, xScale, yScale, area);

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
): void {
  switch (d.type) {
    case 'horizontal-line':
      drawHorizontalLine(ctx, d, yScale, area, service);
      break;
    case 'vertical-line':
      drawVerticalLine(ctx, d, xScale, area, service);
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
