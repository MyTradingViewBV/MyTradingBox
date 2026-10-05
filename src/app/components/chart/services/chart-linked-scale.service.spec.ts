import { ChartLinkedScaleService, LinkedChartRefLike } from './chart-linked-scale.service';

const HOUR = 3_600_000;

const candles = (count: number) => Array.from({ length: count }, (_, i) => ({ x: i * HOUR }));

function rect(left: number, width: number): DOMRect {
  return { left, right: left + width, width, top: 0, bottom: 100, height: 100, x: left, y: 0 } as DOMRect;
}

function canvasAt(left: number, width: number, body?: DOMRect): HTMLCanvasElement {
  return {
    getBoundingClientRect: () => rect(left, width),
    closest: () => (body ? { getBoundingClientRect: () => body } : null),
  } as unknown as HTMLCanvasElement;
}

describe('ChartLinkedScaleService', () => {
  let service: ChartLinkedScaleService;

  beforeEach(() => {
    service = new ChartLinkedScaleService();
  });

  it('gives the MCB the TimeScale range of the main chart (no candlestick edge padding)', () => {
    const main: LinkedChartRefLike = {
      chartArea: { left: 0, right: 800, top: 0, bottom: 100 },
      data: { datasets: [{ type: 'candlestick', data: candles(10) }] },
      scales: { x: { options: { min: 2 * HOUR, max: 6 * HOUR } } },
    };
    expect(service.pushXRangeFromMain(main)).toEqual({ xMin: 2 * HOUR, xMax: 6 * HOUR });
    expect(service.timeScale.visibleLogicalRange()).toEqual({ from: 2, to: 6 });
  });

  it('keeps the range unchanged when the main scale has no offset', () => {
    const main: LinkedChartRefLike = { scales: { x: { options: { min: 0, max: 10 } } } };
    expect(service.pushXRangeFromMain(main)).toEqual({ xMin: 0, xMax: 10 });
  });

  it('aligns the MCB plot edges to the main plot using page coordinates', () => {
    // Main canvas at x=0..1000, plot area 10..940 (60px right axis incl. padding).
    // Panel has a 1px border: body 1..999, MCB canvas starts at 1.
    const main: LinkedChartRefLike = {
      width: 1000,
      canvas: canvasAt(0, 1000),
      chartArea: { left: 10, right: 940, top: 0, bottom: 100 },
      scales: { x: { options: { min: 0, max: 10 } } },
    };
    const mcb: LinkedChartRefLike = {
      width: 926,
      canvas: canvasAt(1, 926, rect(1, 998)),
      scales: { x: { options: {} } },
      options: { layout: { padding: { left: 10, right: 0, top: 4, bottom: 24 } } },
      update: vi.fn(),
      resize: vi.fn(),
    };

    const result = service.syncLinkedCharts(main, mcb)!;

    // Gutter runs from the main plot's right edge (940) to the panel body's right edge (999).
    expect(result.rightAxisWidthPx).toBe(59);
    expect(mcb.options!.layout!.padding).toEqual({ left: 9, right: 0, top: 4, bottom: 24 });
  });

  it('aligns the MCB from the TimeScale: every timestamp at the same x, padding rounding included', () => {
    // Main canvas at x=0.3, plot 100..900 (client 100.3..900.3) shows 2h..6h.
    const main = {
      width: 1000,
      canvas: canvasAt(0.3, 1000),
      chartArea: { left: 100, right: 900, top: 0, bottom: 100 },
      data: { datasets: [{ type: 'candlestick', data: candles(10) }] },
      scales: { x: { min: 2 * HOUR, max: 6 * HOUR, options: { min: 2 * HOUR, max: 6 * HOUR } } },
    } as LinkedChartRefLike;
    const mcbCanvas = { ...canvasAt(0, 920, rect(0, 1000)), isConnected: true } as unknown as HTMLCanvasElement;
    const mcb: LinkedChartRefLike = {
      canvas: mcbCanvas,
      scales: { x: { options: {} } },
      options: { layout: { padding: { left: 0, right: 0 } } },
      update: vi.fn(),
    };
    service.registerMcbChart(mcb);

    expect(service.syncMcbFromRenderedMain(main)).toBe(true);
    // Padding rounds to whole px: MCB plot 100..900 (client), 0.3px left of the main plot.
    expect(mcb.options!.layout!.padding).toEqual({ top: 0, bottom: 0, left: 100, right: 20 });
    expect(mcb.update).toHaveBeenCalledWith('none');
    const range = { min: mcb.scales!.x!.options!.min!, max: mcb.scales!.x!.options!.max! };
    for (const t of [2 * HOUR, 2.5 * HOUR, 4.25 * HOUR, 6 * HOUR]) {
      const mainX = 0.3 + 100 + ((t - 2 * HOUR) / (4 * HOUR)) * 800;
      const mcbX = 0 + 100 + ((t - range.min) / (range.max - range.min)) * 800;
      expect(Math.abs(mainX - mcbX)).toBeLessThan(1e-6);
    }
    // Mid-gesture estimates for the same main range give the same MCB range.
    const pushed = service.pushXRangeFromMain(main)!;
    expect(pushed.xMin).toBeCloseTo(range.min);
    expect(pushed.xMax).toBeCloseTo(range.max);
  });

  it('on a main container resize keeps bar spacing and the logical center away from the live edge', () => {
    const main = {
      width: 900,
      canvas: canvasAt(0, 900),
      chartArea: { left: 0, right: 800, top: 0, bottom: 100 },
      data: { datasets: [{ type: 'candlestick', data: candles(10) }] },
      scales: { x: { min: 2 * HOUR, max: 6 * HOUR, options: { min: 2 * HOUR, max: 6 * HOUR } } },
    } as LinkedChartRefLike;
    service.syncMcbFromRenderedMain(main); // last layout: 200px per candle
    service.onMainResize(main, 1300); // plot grows by 400px -> 6 candles around 4h
    expect(main.scales!.x!.options!.min).toBeCloseTo(1 * HOUR);
    expect(main.scales!.x!.options!.max).toBeCloseTo(7 * HOUR);
    expect(service.timeScale.barSpacingPx).toBe(200);
  });

  it('on a main container resize keeps the right offset at the live edge', () => {
    const main = {
      width: 900,
      canvas: canvasAt(0, 900),
      chartArea: { left: 0, right: 800, top: 0, bottom: 100 },
      data: { datasets: [{ type: 'candlestick', data: candles(10) }] },
      scales: { x: { min: 5.5 * HOUR, max: 9.5 * HOUR, options: { min: 5.5 * HOUR, max: 9.5 * HOUR } } },
    } as LinkedChartRefLike;
    service.syncMcbFromRenderedMain(main);
    service.onMainResize(main, 500); // plot shrinks by 400px -> 2 candles, right edge stays
    expect(main.scales!.x!.options!.min).toBeCloseTo(7.5 * HOUR);
    expect(main.scales!.x!.options!.max).toBeCloseTo(9.5 * HOUR);
  });
});
