/**
 * Select / move / resize of the drawings on the Market Cipher B panel, the
 * same gestures as on the price chart: a press on a drawing selects it, a drag
 * on its body moves it, a drag on a handle (line ends, fib points, rectangle
 * corners) reshapes it. Locked drawings are only selected.
 */
import { Drawing, DrawingPoint, isBoxType } from '../chart/services/drawing-tools.service';

export interface McbPixelScale {
  getPixelForValue(value: number): number;
  getValueForPixel(pixel: number): number | undefined;
}

/** What a press hit: a handle moves points[xIdx].x and points[yIdx].y, the body moves the whole drawing. */
export interface McbDrawingHit {
  id: string;
  locked: boolean;
  handle: { xIdx: number; yIdx: number } | null;
  cursor: string;
}

/** Hit radii (px) on the plot; touch presses use a larger radius (`scale`). */
const HANDLE_PX = 10;
const LINE_PX = 7;
const BOX_PX = 5;

function distToSegment(cx: number, cy: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq <= 0.0001 ? 0 : Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lenSq));
  return Math.hypot(cx - (x1 + t * dx), cy - (y1 + t * dy));
}

/** Handles of a drawing as point-index pairs (x from points[xIdx], y from points[yIdx]). */
function handlesOf(d: Drawing): Array<[number, number]> {
  if (d.points.length < 2) return [];
  if (isBoxType(d.type)) return [[0, 0], [1, 1], [0, 1], [1, 0]];
  if (d.type === 'trend-line' || d.type === 'ruler' || d.type === 'fib-retracement' || d.type === 'fib-extension') {
    return d.points.map((_, i) => [i, i] as [number, number]);
  }
  return [];
}

function bodyHit(d: Drawing, cx: number, cy: number, xs: number[], ys: number[], scale: number): boolean {
  switch (d.type) {
    case 'horizontal-line':
      return Math.abs(cy - ys[0]) <= LINE_PX * scale;
    case 'vertical-line':
      return Math.abs(cx - xs[0]) <= LINE_PX * scale;
    case 'trend-line':
    case 'ruler':
    case 'pen':
      for (let i = 1; i < xs.length; i++) {
        if (distToSegment(cx, cy, xs[i - 1], ys[i - 1], xs[i], ys[i]) <= LINE_PX * scale) return true;
      }
      return false;
    default: {
      // Boxes and fibs: their bounding box.
      if (xs.length < 2) return false;
      const pad = BOX_PX * scale;
      return (
        cx >= Math.min(...xs) - pad && cx <= Math.max(...xs) + pad &&
        cy >= Math.min(...ys) - pad && cy <= Math.max(...ys) + pad
      );
    }
  }
}

function bodyCursor(d: Drawing): string {
  if (d.type === 'horizontal-line') return 'ns-resize';
  if (d.type === 'vertical-line') return 'ew-resize';
  return 'move';
}

/**
 * Topmost drawing under (cx, cy) in canvas pixels. Handles of the selected
 * drawing win, then handles and bodies from the last drawn down.
 */
export function hitTestMcbDrawing(
  drawings: Drawing[],
  cx: number,
  cy: number,
  xScale: McbPixelScale,
  yScale: McbPixelScale,
  isLocked: (d: Drawing) => boolean,
  selectedId: string | null = null,
  scale = 1,
): McbDrawingHit | null {
  const topFirst = [...drawings].reverse();
  const ordered = [
    ...topFirst.filter((d) => d.id === selectedId),
    ...topFirst.filter((d) => d.id !== selectedId),
  ];

  for (const d of ordered) {
    if (!d.points.length) continue;
    const locked = isLocked(d);
    const xs = d.points.map((p) => xScale.getPixelForValue(p.x));
    const ys = d.points.map((p) => yScale.getPixelForValue(p.y));
    if (!locked) {
      for (const [xIdx, yIdx] of handlesOf(d)) {
        const hx = xs[xIdx];
        const hy = ys[yIdx];
        if (Math.hypot(cx - hx, cy - hy) > HANDLE_PX * scale) continue;
        let cursor = 'move';
        if (isBoxType(d.type)) {
          // Diagonal cursor pointing at the opposite corner.
          cursor = (hx - xs[1 - xIdx]) * (hy - ys[1 - yIdx]) >= 0 ? 'nwse-resize' : 'nesw-resize';
        }
        return { id: d.id, locked, handle: { xIdx, yIdx }, cursor };
      }
    }
    if (bodyHit(d, cx, cy, xs, ys, scale)) {
      return { id: d.id, locked, handle: null, cursor: locked ? 'pointer' : bodyCursor(d) };
    }
  }
  return null;
}

/**
 * Points of a drawing being dragged from (startPx, startPy) to (px, py),
 * computed from the points at drag start (no drift). Null when a scale gives no value.
 */
export function draggedMcbPoints(
  d: Drawing,
  startPoints: DrawingPoint[],
  hit: McbDrawingHit,
  startPx: number,
  startPy: number,
  px: number,
  py: number,
  xScale: McbPixelScale,
  yScale: McbPixelScale,
): DrawingPoint[] | null {
  const x = xScale.getValueForPixel(px);
  const y = yScale.getValueForPixel(py);
  if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const next = startPoints.map((p) => ({ ...p }));

  if (hit.handle) {
    next[hit.handle.xIdx].x = x;
    next[hit.handle.yIdx].y = y;
    return next;
  }

  const x0 = xScale.getValueForPixel(startPx);
  const y0 = yScale.getValueForPixel(startPy);
  if (x0 == null || y0 == null || !Number.isFinite(x0) || !Number.isFinite(y0)) return null;
  const dx = d.type === 'horizontal-line' ? 0 : x - x0;
  const dy = d.type === 'vertical-line' ? 0 : y - y0;
  return next.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}
