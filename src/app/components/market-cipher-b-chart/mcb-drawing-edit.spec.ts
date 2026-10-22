import { Drawing, setMeasuredTextBox } from '../chart/services/drawing-tools.service';
import { McbPixelScale, draggedMcbPoints, hitTestMcbDrawing } from './mcb-drawing-edit';

/** 1 data unit = 1 px on x; y is flipped like a chart (value 0 at 200px, 100 at 0px). */
const xScale: McbPixelScale = { getPixelForValue: (v) => v, getValueForPixel: (p) => p };
const yScale: McbPixelScale = { getPixelForValue: (v) => 200 - 2 * v, getValueForPixel: (p) => (200 - p) / 2 };
const unlocked = () => false;

function drawing(type: Drawing['type'], points: Array<[number, number]>, extra: Partial<Drawing> = {}): Drawing {
  return {
    id: `${type}_${points.length}`,
    type,
    points: points.map(([x, y]) => ({ x, y })),
    color: '#fff',
    lineWidth: 1,
    pane: 'mcb',
    ...extra,
  };
}

describe('mcb-drawing-edit', () => {
  it('hits a trend line on its body and on its end points', () => {
    const trend = drawing('trend-line', [[100, 50], [300, 50]]); // y px = 100
    expect(hitTestMcbDrawing([trend], 200, 104, xScale, yScale, unlocked)?.handle).toBeNull();
    expect(hitTestMcbDrawing([trend], 302, 98, xScale, yScale, unlocked)?.handle).toEqual({ xIdx: 1, yIdx: 1 });
    expect(hitTestMcbDrawing([trend], 200, 130, xScale, yScale, unlocked)).toBeNull();
  });

  it('hits horizontal and vertical lines along their whole length', () => {
    const h = drawing('horizontal-line', [[100, 25]]); // y px = 150
    const v = drawing('vertical-line', [[400, 0]]);
    expect(hitTestMcbDrawing([h], 900, 153, xScale, yScale, unlocked)?.cursor).toBe('ns-resize');
    expect(hitTestMcbDrawing([v], 398, 10, xScale, yScale, unlocked)?.cursor).toBe('ew-resize');
  });

  it('resizes a rectangle from its corners and moves it from inside', () => {
    const rect = drawing('rectangle', [[100, 80], [200, 20]]); // px y 40 .. 160
    const corner = hitTestMcbDrawing([rect], 101, 159, xScale, yScale, unlocked)!;
    expect(corner.handle).toEqual({ xIdx: 0, yIdx: 1 });
    expect(draggedMcbPoints(rect, rect.points, corner, 101, 159, 50, 180, xScale, yScale)).toEqual([
      { x: 50, y: 80 },
      { x: 200, y: 10 },
    ]);

    const body = hitTestMcbDrawing([rect], 150, 100, xScale, yScale, unlocked)!;
    expect(body.handle).toBeNull();
    expect(draggedMcbPoints(rect, rect.points, body, 150, 100, 160, 80, xScale, yScale)).toEqual([
      { x: 110, y: 90 },
      { x: 210, y: 30 },
    ]);
  });

  it('moves a horizontal line only vertically', () => {
    const h = drawing('horizontal-line', [[100, 25]]);
    const hit = hitTestMcbDrawing([h], 300, 150, xScale, yScale, unlocked)!;
    expect(draggedMcbPoints(h, h.points, hit, 300, 150, 500, 100, xScale, yScale)).toEqual([{ x: 100, y: 50 }]);
  });

  it('only selects locked drawings (no handles, flagged locked)', () => {
    const trend = drawing('trend-line', [[100, 50], [300, 50]], { locked: true });
    const hit = hitTestMcbDrawing([trend], 300, 100, xScale, yScale, (d) => !!d.locked);
    expect(hit).toEqual({ id: trend.id, locked: true, handle: null, cursor: 'pointer' });
  });

  it('prefers the selected drawing, then the topmost one', () => {
    const a = drawing('rectangle', [[0, 100], [400, 0]], { id: 'a' });
    const b = drawing('rectangle', [[100, 80], [200, 20]], { id: 'b' });
    expect(hitTestMcbDrawing([a, b], 150, 100, xScale, yScale, unlocked)?.id).toBe('b');
    expect(hitTestMcbDrawing([a, b], 150, 100, xScale, yScale, unlocked, 'a')?.id).toBe('a');
  });

  it('reaches further with a touch scale', () => {
    const h = drawing('horizontal-line', [[100, 25]]);
    expect(hitTestMcbDrawing([h], 300, 162, xScale, yScale, unlocked)).toBeNull();
    expect(hitTestMcbDrawing([h], 300, 162, xScale, yScale, unlocked, null, 1.8)).not.toBeNull();
  });

  it('hits an icon on its square and moves it from there', () => {
    const icon = drawing('icon', [[100, 50]], { icon: '🚀', fontSize: 20 }); // px (100, 100), half 12
    const hit = hitTestMcbDrawing([icon], 110, 90, xScale, yScale, unlocked)!;
    expect(hit).toMatchObject({ handle: null, cursor: 'move' });
    expect(hitTestMcbDrawing([icon], 115, 100, xScale, yScale, unlocked)).toBeNull();
    expect(draggedMcbPoints(icon, icon.points, hit, 110, 90, 130, 70, xScale, yScale)).toEqual([{ x: 120, y: 60 }]);
  });

  it('hits an arrow on its line and reshapes it by the head', () => {
    const arrow = drawing('arrow', [[100, 50], [300, 50]]); // y px = 100
    expect(hitTestMcbDrawing([arrow], 200, 103, xScale, yScale, unlocked)).toMatchObject({ id: arrow.id, handle: null, cursor: 'move' });
    const head = hitTestMcbDrawing([arrow], 302, 98, xScale, yScale, unlocked)!;
    expect(head.handle).toEqual({ xIdx: 1, yIdx: 1 });
    expect(draggedMcbPoints(arrow, arrow.points, head, 302, 98, 352, 78, xScale, yScale)).toEqual([{ x: 100, y: 50 }, { x: 352, y: 61 }]);
  });

  it('hits a text label on its measured frame and moves it from there', () => {
    const text = drawing('text', [[100, 50]], { text: 'Hi', fontSize: 20 }); // anchor px (100, 100)
    setMeasuredTextBox(text.id, { w: 40, h: 30 });
    const hit = hitTestMcbDrawing([text], 130, 120, xScale, yScale, unlocked)!;
    expect(hit).toMatchObject({ id: text.id, handle: null, cursor: 'move' });
    expect(hitTestMcbDrawing([text], 150, 120, xScale, yScale, unlocked)).toBeNull();
    expect(hitTestMcbDrawing([text], 130, 90, xScale, yScale, unlocked)).toBeNull();
    expect(draggedMcbPoints(text, text.points, hit, 130, 120, 140, 110, xScale, yScale)).toEqual([{ x: 110, y: 55 }]);
  });
});
