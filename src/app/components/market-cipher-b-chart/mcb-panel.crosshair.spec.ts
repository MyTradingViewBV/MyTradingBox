/**
 * MCB pane shared crosshair: the horizontal line and the value label belong to the pane the pointer is in;
 * a main-chart pointer only contributes the shared time (vertical line).
 */
import { EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ChartLinkedScaleService } from '../chart/services/chart-linked-scale.service';
import { McbPanelComponent } from './mcb-panel.component';

describe('McbPanelComponent shared crosshair', () => {
  let panel: McbPanelComponent;
  const draw = vi.fn();

  beforeEach(() => {
    draw.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: TranslateService,
          useValue: {
            onLangChange: new EventEmitter(),
            onTranslationChange: new EventEmitter(),
            onDefaultLangChange: new EventEmitter(),
            get: (key: string) => of(key),
            instant: (key: string) => key,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(McbPanelComponent);
    fixture.componentRef.setInput('chartData', { datasets: [] });
    fixture.componentRef.setInput('chartOptions', {});
    panel = fixture.componentInstance;
    const internals = panel as unknown as { chart: unknown; canvasEl: unknown };
    internals.chart = {
      chart: {
        chartArea: { left: 0, right: 800, top: 0, bottom: 100 },
        scales: { y: { getValueForPixel: (px: number) => 100 - px } },
        draw,
      },
    };
    internals.canvasEl = { nativeElement: { getBoundingClientRect: () => ({ left: 0, top: 500 }) } };
  });

  it('shows the value label for a pointer in the pane', () => {
    panel.setCrosshair(1000, 540, 'pane');
    expect(panel.crosshairLabel()?.value).toBe(60);
  });

  it('shows no value label for a main-chart pointer, even when its clientY falls inside the pane plot', () => {
    panel.setCrosshair(1000, 540, 'main');
    expect(panel.crosshairLabel()).toBeNull();
    expect(draw).toHaveBeenCalled(); // the vertical line still draws
  });

  it('clears the label when the crosshair hides', () => {
    panel.setCrosshair(1000, 540, 'pane');
    panel.setCrosshair(null, null);
    expect(panel.crosshairLabel()).toBeNull();
  });

  describe('vertical line x (one shared client x for all panes)', () => {
    /** ctx stub recording moveTo calls; the first one is the vertical line's top point. */
    const ctxStub = () => {
      const moves: Array<[number, number]> = [];
      const noop = vi.fn();
      return {
        moves,
        ctx: {
          save: noop, beginPath: noop, lineTo: noop, arcTo: noop, closePath: noop, fill: noop,
          stroke: noop, setLineDash: noop, restore: noop, fillText: noop,
          moveTo: (x: number, y: number) => moves.push([x, y]),
          measureText: () => ({ width: 40 }),
        } as unknown as CanvasRenderingContext2D,
      };
    };
    /** The MCB pane's Chart.js stub: its OWN scale deliberately maps everything to x=500. */
    const paneChart = (ctx: CanvasRenderingContext2D) => ({
      ctx,
      height: 130,
      canvas: { getBoundingClientRect: () => ({ left: 12, width: 898 }) },
      chartArea: { left: 0, right: 860, top: 0, bottom: 100 },
      scales: { x: { getPixelForValue: () => 500 } },
    });
    const afterDraw = (chart: unknown) =>
      (panel.plugins[0] as unknown as { afterDraw: (chart: unknown) => void }).afterDraw(chart);

    afterEach(() => TestBed.inject(ChartLinkedScaleService).clearMcbChart());

    it('draws at the main chart client x translated into this canvas, not at this pane own-scale x', () => {
      TestBed.inject(ChartLinkedScaleService).syncMcbFromRenderedMain({
        canvas: { getBoundingClientRect: () => ({ left: 10, width: 900 }) },
        chartArea: { left: 0, right: 800, top: 0, bottom: 600 },
        scales: { x: { getPixelForValue: (t: number) => t / 10 } },
      } as never);
      panel.setCrosshair(1930, null, 'main');
      const { moves, ctx } = ctxStub();
      afterDraw(paneChart(ctx));
      // main: client x = 10 + 1930 / 10 = 203; this canvas starts at 12 -> 191.
      expect(moves[0]).toEqual([191, 0]);
    });

    it('falls back to this pane own scale when no main chart is linked', () => {
      TestBed.inject(ChartLinkedScaleService).clearMcbChart();
      panel.setCrosshair(1930, null, 'main');
      const { moves, ctx } = ctxStub();
      afterDraw(paneChart(ctx));
      expect(moves[0]).toEqual([500, 0]);
    });
  });
});
