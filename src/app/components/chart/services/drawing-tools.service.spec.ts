import {
  DEFAULT_FIB_EXTENSION_LEVELS,
  DEFAULT_FIB_RETRACEMENT_LEVELS,
  Drawing,
  DrawingToolType,
  DrawingToolsService,
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
      ['long-position', 3, '#2962FF'],
      ['short-position', 3, '#787B86'],
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
});
