import {
  DEFAULT_FIB_EXTENSION_LEVELS,
  DEFAULT_FIB_RETRACEMENT_LEVELS,
  Drawing,
  DrawingToolType,
  DrawingToolsService,
  isBoxType,
} from './drawing-tools.service';

describe('DrawingToolsService', () => {
  let service: DrawingToolsService;

  beforeEach(() => {
    service = new DrawingToolsService();
  });

  /** Select a tool and place `count` points; returns whether the last point completed it. */
  function place(tool: DrawingToolType, count: number): boolean {
    service.selectTool(tool);
    let done = false;
    for (let i = 0; i < count; i++) done = service.addPoint(1000 + i, 10 + i, null);
    return done;
  }

  describe('creating drawings', () => {
    const cases: Array<[DrawingToolType, number, string]> = [
      ['horizontal-line', 1, '#2962FF'],
      ['vertical-line', 1, '#2962FF'],
      ['trend-line', 2, '#2962FF'],
      ['fib-retracement', 2, '#F7525F'],
      ['fib-extension', 3, '#089981'],
      ['box-green', 2, '#089981'],
      ['box-red', 2, '#F7525F'],
      ['ruler', 2, '#1E90FF'],
    ];

    it.each(cases)('%s completes after %i point(s) with its default color', (tool, required, color) => {
      service.selectTool(tool);
      for (let i = 0; i < required - 1; i++) {
        expect(service.addPoint(1000 + i, 10 + i, null)).toBe(false);
        expect(service.drawingsValue).toHaveLength(0);
      }
      expect(service.addPoint(2000, 99, null)).toBe(true);

      const [d] = service.drawingsValue;
      expect(d.type).toBe(tool);
      expect(d.points).toHaveLength(required);
      expect(d.points[required - 1]).toEqual({ x: 2000, y: 99 });
      expect(d.color).toBe(color);
      expect(d.lineWidth).toBe(1);
      expect(d.id).toMatch(/^drw_/);
      // Tool is released and the in-progress state cleared.
      expect(service.activeToolValue).toBeNull();
      expect(service.pendingDrawingPoints).toEqual([]);
      expect(service.cursorPosition).toBeNull();
    });

    describe('long/short position (one-click placement)', () => {
      const chartRef = { scales: { x: { min: 0, max: 1000 }, y: { min: 0, max: 100 } } };

      it('places a complete long position on the first click', () => {
        service.selectTool('long-position');
        expect(service.addPoint(500, 50, chartRef)).toBe(true);

        const [d] = service.drawingsValue;
        expect(d.type).toBe('long-position');
        expect(d.color).toBe('#2962FF');
        expect(d.points).toHaveLength(3);
        // Entry at the click; right edge 25% of the visible time range further.
        expect(d.points[0]).toEqual({ x: 500, y: 50 });
        expect(d.points[1].x).toBeCloseTo(750);
        expect(d.points[2].x).toBeCloseTo(750);
        // Long: TP above entry (20% of visible price range), SL below (10%).
        expect(d.points[1].y).toBeCloseTo(70);
        expect(d.points[2].y).toBeCloseTo(40);
        expect(service.activeToolValue).toBeNull();
        expect(service.pendingDrawingPoints).toEqual([]);
      });

      it('places a short position mirrored: TP below entry, SL above', () => {
        service.selectTool('short-position');
        expect(service.addPoint(500, 50, chartRef)).toBe(true);

        const [d] = service.drawingsValue;
        expect(d.type).toBe('short-position');
        expect(d.color).toBe('#2962FF');
        expect(d.points[1].y).toBeCloseTo(30);
        expect(d.points[2].y).toBeCloseTo(60);
      });

      it('falls back to percent-of-price defaults without chart scales', () => {
        service.selectTool('long-position');
        expect(service.addPoint(1000, 200, null)).toBe(true);

        const [d] = service.drawingsValue;
        expect(d.points[0]).toEqual({ x: 1000, y: 200 });
        expect(d.points[1].y).toBeCloseTo(204); // +2%
        expect(d.points[2].y).toBeCloseTo(198); // -1%
        expect(d.points[1].x).toBe(1000 + 3_600_000);
      });
    });

    it('attaches default fib levels (as copies) to fib drawings only', () => {
      place('fib-retracement', 2);
      place('fib-extension', 3);
      place('trend-line', 2);
      const [ret, ext, trend] = service.drawingsValue;
      expect(ret.fibLevels).toEqual(DEFAULT_FIB_RETRACEMENT_LEVELS);
      expect(ret.fibLevels).not.toBe(DEFAULT_FIB_RETRACEMENT_LEVELS);
      expect(ext.fibLevels).toEqual(DEFAULT_FIB_EXTENSION_LEVELS);
      expect(trend.fibLevels).toBeUndefined();
    });

    it('ignores points while no tool is active', () => {
      expect(service.addPoint(1, 2, null)).toBe(false);
      expect(service.pendingDrawingPoints).toEqual([]);
      expect(service.drawingsValue).toEqual([]);
    });

    it('gives each drawing a unique id and emits the new list', () => {
      const emissions: Drawing[][] = [];
      const sub = service.drawings.subscribe((list) => emissions.push(list));
      place('horizontal-line', 1);
      place('horizontal-line', 1);
      sub.unsubscribe();
      expect(emissions.map((l) => l.length)).toEqual([0, 1, 2]);
      const [a, b] = service.drawingsValue;
      expect(a.id).not.toBe(b.id);
    });

    it('selecting another tool discards pending points and the cursor', () => {
      service.selectTool('trend-line');
      service.addPoint(1, 1, null);
      service.updateCursor(10, 20);
      expect(service.cursorPosition).toEqual({ x: 10, y: 20 });
      service.selectTool('box-green');
      expect(service.pendingDrawingPoints).toEqual([]);
      expect(service.cursorPosition).toBeNull();
      expect(service.activeToolValue).toBe('box-green');
    });

    it.each<[DrawingToolType, number]>([
      ['horizontal-line', 1],
      ['trend-line', 2],
      ['fib-retracement', 2],
      ['long-position', 1],
    ])('%s returns to cursor mode (null tool) after placing %i point(s)', (tool, count) => {
      expect(place(tool, count)).toBe(true);
      expect(service.activeToolValue).toBeNull();
    });

    it('cancelDrawing mid-drawing (1 of 2 points) clears pending points and returns to cursor mode', () => {
      service.selectTool('fib-retracement');
      expect(service.addPoint(1, 1, null)).toBe(false);
      expect(service.pendingDrawingPoints).toHaveLength(1);
      service.cancelDrawing();
      expect(service.pendingDrawingPoints).toEqual([]);
      expect(service.activeToolValue).toBeNull();
    });

    it('cancelDrawing clears the tool, points and cursor', () => {
      service.selectTool('trend-line');
      service.addPoint(1, 1, null);
      service.updateCursor(3, 4);
      service.cancelDrawing();
      expect(service.activeToolValue).toBeNull();
      expect(service.pendingDrawingPoints).toEqual([]);
      expect(service.cursorPosition).toBeNull();
      expect(service.drawingsValue).toEqual([]);
    });
  });

  describe('magnet', () => {
    it('cycles off -> weak -> strong -> off', () => {
      expect(service.magnetMode).toBe('off');
      service.toggleMagnet();
      expect(service.magnetMode).toBe('weak');
      service.toggleMagnet();
      expect(service.magnetMode).toBe('strong');
      service.toggleMagnet();
      expect(service.magnetMode).toBe('off');
    });

    it('auto-enables a weak magnet for fib tools and restores it on completion', () => {
      service.selectTool('fib-retracement');
      expect(service.magnetMode).toBe('weak');
      service.addPoint(1, 1, null);
      service.addPoint(2, 2, null);
      expect(service.magnetMode).toBe('off');
    });

    it('restores the magnet when a fib tool is cancelled or swapped for another tool', () => {
      service.selectTool('fib-extension');
      service.cancelDrawing();
      expect(service.magnetMode).toBe('off');

      service.selectTool('fib-extension');
      service.selectTool('ruler');
      expect(service.magnetMode).toBe('off');
    });

    it('keeps a user-chosen magnet mode for fib tools', () => {
      service.magnetMode = 'strong';
      service.selectTool('fib-retracement');
      expect(service.magnetMode).toBe('strong');
      service.cancelDrawing();
      expect(service.magnetMode).toBe('strong');
    });

    it('stores and clears the snap indicator', () => {
      service.setSnapIndicator(5, 6, 'H');
      expect(service.snapIndicator).toEqual({ px: 5, py: 6, label: 'H' });
      service.clearSnapIndicator();
      expect(service.snapIndicator).toBeNull();
    });
  });

  describe('editing drawings', () => {
    let hLine: Drawing;
    let vLine: Drawing;
    let box: Drawing;

    beforeEach(() => {
      service.setDrawings([
        { id: 'h', type: 'horizontal-line', points: [{ x: 1, y: 100 }], color: '#fff', lineWidth: 1 },
        { id: 'v', type: 'vertical-line', points: [{ x: 50, y: 0 }], color: '#fff', lineWidth: 1 },
        { id: 'b', type: 'box-red', points: [{ x: 10, y: 20 }, { x: 30, y: 40 }], color: '#fff', lineWidth: 1 },
      ]);
      [hLine, vLine, box] = service.drawingsValue;
    });

    it('moves a horizontal line in price only', () => {
      service.moveDrawingY('h', 123);
      expect(service.drawingsValue[0].points).toEqual([{ x: 1, y: 123 }]);
      // Immutable update: other drawings keep their identity.
      expect(service.drawingsValue[0]).not.toBe(hLine);
      expect(service.drawingsValue[1]).toBe(vLine);
    });

    it('moves a vertical line in time only', () => {
      service.moveDrawingX('v', 77);
      expect(service.drawingsValue[1].points).toEqual([{ x: 77, y: 0 }]);
    });

    it('shifts every point by a delta from the drag-start snapshot (no drift)', () => {
      const origin = box.points.map((p) => ({ ...p }));
      service.moveDrawingDelta('b', 5, -5, origin);
      service.moveDrawingDelta('b', 6, -6, origin);
      expect(service.drawingsValue[2].points).toEqual([
        { x: 16, y: 14 },
        { x: 36, y: 34 },
      ]);
    });

    it('replaces the points of one drawing', () => {
      service.updateDrawingPoints('b', [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
      expect(service.drawingsValue[2].points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
      expect(service.drawingsValue[0]).toBe(hLine);
    });

    it('ignores edits for an unknown id', () => {
      const before = service.drawingsValue;
      service.moveDrawingY('nope', 1);
      expect(service.drawingsValue).toEqual(before);
    });

    it('removes one drawing or all drawings', () => {
      service.removeDrawing('v');
      expect(service.drawingsValue.map((d) => d.id)).toEqual(['h', 'b']);
      service.clearAllDrawings();
      expect(service.drawingsValue).toEqual([]);
    });

    it('round-trips drawings through setDrawings (persistence restore) and tolerates null', () => {
      const serialized = JSON.parse(JSON.stringify(service.drawingsValue)) as Drawing[];
      service.clearAllDrawings();
      service.setDrawings(serialized);
      expect(service.drawingsValue).toEqual(serialized);
      service.setDrawings(null as unknown as Drawing[]);
      expect(service.drawingsValue).toEqual([]);
    });
  });

  describe('pen', () => {
    it('commits a freehand stroke and keeps the pen active', () => {
      service.selectTool('pen');
      service.startPenStroke(1000, 10);
      service.extendPenStroke(1001, 11);
      service.extendPenStroke(1002, 12);
      expect(service.isPenStroking).toBe(true);

      service.finishPenStroke();

      expect(service.isPenStroking).toBe(false);
      expect(service.activeToolValue).toBe('pen');
      expect(service.drawingsValue).toHaveLength(1);
      expect(service.drawingsValue[0]).toMatchObject({ type: 'pen', color: '#FF9800', lineWidth: 2 });
      expect(service.drawingsValue[0].points).toHaveLength(3);
    });

    it('drops a stroke with a single point (a click without dragging)', () => {
      service.selectTool('pen');
      service.startPenStroke(1000, 10);
      service.finishPenStroke();
      expect(service.drawingsValue).toHaveLength(0);
    });

    it('cancelPenStroke drops the stroke in progress and keeps the pen active', () => {
      service.selectTool('pen');
      service.startPenStroke(1000, 10);
      service.extendPenStroke(1001, 11);
      service.cancelPenStroke();
      service.finishPenStroke();
      expect(service.isPenStroking).toBe(false);
      expect(service.activeToolValue).toBe('pen');
      expect(service.drawingsValue).toHaveLength(0);
    });

    it('cancelPenStroke keeps the pending points of another tool', () => {
      service.selectTool('trend-line');
      service.addPoint(1000, 10, null);
      service.cancelPenStroke();
      expect(service.pendingDrawingPoints).toHaveLength(1);
    });

    it('ignores stroke calls when the pen is not the active tool', () => {
      service.selectTool('trend-line');
      service.startPenStroke(1000, 10);
      service.extendPenStroke(1001, 11);
      service.finishPenStroke();
      expect(service.drawingsValue).toHaveLength(0);
    });
  });
  describe('fib levels', () => {
    it('includes the 0.886 level in retracement and extension defaults', () => {
      expect(DEFAULT_FIB_RETRACEMENT_LEVELS).toContain(0.886);
      expect(DEFAULT_FIB_EXTENSION_LEVELS).toContain(0.886);
    });
  });

  describe('locking', () => {
    it('toggles the lock of one drawing only', () => {
      place('horizontal-line', 1);
      place('trend-line', 2);
      const [a, b] = service.drawingsValue;

      service.toggleLocked(a.id);
      expect(service.isLocked(service.drawingsValue[0])).toBe(true);
      expect(service.isLocked(service.drawingsValue[1])).toBe(false);

      service.toggleLocked(a.id);
      expect(service.isLocked(service.drawingsValue[0])).toBe(false);
      expect(b.locked).toBeUndefined();
    });

    it('lock all locks every drawing without changing their own flag', () => {
      place('rectangle', 2);
      service.toggleAllLocked();
      expect(service.isLocked(service.drawingsValue[0])).toBe(true);
      expect(service.drawingsValue[0].locked).toBeUndefined();
      service.toggleAllLocked();
      expect(service.isLocked(service.drawingsValue[0])).toBe(false);
    });
  });

  describe('panes (price chart / MCB panel)', () => {
    it('tags drawings placed on the MCB panel and leaves price drawings untagged', () => {
      service.selectTool('trend-line');
      service.addPoint(1, 10, null, 'mcb');
      service.addPoint(2, 20, null, 'mcb');
      place('horizontal-line', 1);
      expect(service.drawingsValue[0].pane).toBe('mcb');
      expect('pane' in service.drawingsValue[1]).toBe(false);
      expect(service.paneDrawings('mcb').map((d) => d.type)).toEqual(['trend-line']);
      expect(service.paneDrawings('price').map((d) => d.type)).toEqual(['horizontal-line']);
    });

    it('starts over when the next point is placed on the other pane', () => {
      service.selectTool('trend-line');
      service.addPoint(1, 50000, null, 'price');
      expect(service.addPoint(2, 40, null, 'mcb')).toBe(false);
      expect(service.pendingPane).toBe('mcb');
      expect(service.addPoint(3, 60, null, 'mcb')).toBe(true);
      expect(service.drawingsValue[0].points).toEqual([{ x: 2, y: 40 }, { x: 3, y: 60 }]);
      expect(service.drawingsValue[0].pane).toBe('mcb');
    });

    it('tags MCB pen strokes and tracks the cursor pane', () => {
      service.selectTool('pen');
      service.startPenStroke(1, 10, 'mcb');
      service.extendPenStroke(2, 12);
      service.finishPenStroke();
      expect(service.drawingsValue[0].pane).toBe('mcb');
      service.updateCursor(5, 5, 'mcb');
      expect(service.cursorPane).toBe('mcb');
      service.updateCursor(5, 5);
      expect(service.cursorPane).toBe('price');
    });
  });

  describe('fixed volume profile', () => {
    it('reports the picked time range instead of saving a drawing', () => {
      const ranges: Array<{ startTime: number; endTime: number }> = [];
      const sub = service.fixedRangeSelected.subscribe((r) => ranges.push(r));
      service.selectTool('fixed-volume-profile');
      expect(service.addPoint(5000, 10, null)).toBe(false);
      expect(service.addPoint(2000, 20, null)).toBe(true);
      sub.unsubscribe();

      expect(ranges).toEqual([{ startTime: 2000, endTime: 5000 }]);
      expect(service.drawingsValue).toEqual([]);
      expect(service.pendingDrawingPoints).toEqual([]);
      expect(service.activeToolValue).toBeNull();
    });

    it('cancelDrawing drops the first point without reporting a range', () => {
      const ranges: unknown[] = [];
      const sub = service.fixedRangeSelected.subscribe((r) => ranges.push(r));
      service.selectTool('fixed-volume-profile');
      service.addPoint(1000, 10, null);
      service.cancelDrawing();
      sub.unsubscribe();

      expect(ranges).toEqual([]);
      expect(service.pendingDrawingPoints).toEqual([]);
      expect(service.activeToolValue).toBeNull();
    });

    it('other two-point tools still save into drawings', () => {
      const ranges: unknown[] = [];
      const sub = service.fixedRangeSelected.subscribe((r) => ranges.push(r));
      expect(place('trend-line', 2)).toBe(true);
      expect(place('rectangle', 2)).toBe(true);
      sub.unsubscribe();

      expect(ranges).toEqual([]);
      expect(service.drawingsValue.map((d) => d.type)).toEqual(['trend-line', 'rectangle']);
    });
  });

  it('isBoxType covers rectangle and the green/red zones', () => {
    expect(isBoxType('rectangle')).toBe(true);
    expect(isBoxType('box-green')).toBe(true);
    expect(isBoxType('box-red')).toBe(true);
    expect(isBoxType('trend-line')).toBe(false);
    expect(isBoxType(null)).toBe(false);
  });
});
