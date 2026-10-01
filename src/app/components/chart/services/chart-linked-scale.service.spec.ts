import { ChartLinkedScaleService, LinkedChartRefLike } from './chart-linked-scale.service';

const HOUR = 3_600_000;

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

  it('widens the linked range by the candlestick offset padding (half a candle each side)', () => {
    const timestamps = Array.from({ length: 10 }, (_, i) => i * HOUR);
    const main: LinkedChartRefLike = {
      scales: { x: { options: { min: 2 * HOUR, max: 6 * HOUR, offset: true }, getDataTimestamps: () => timestamps } },
    };
    expect(service.pushXRangeFromMain(main)).toEqual({ xMin: 1.5 * HOUR, xMax: 6.5 * HOUR });
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
});
