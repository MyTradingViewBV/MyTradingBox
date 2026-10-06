/**
 * T11: the MCB pane in the page's one-gesture rule. The value-axis drag registers a claim with the service
 * (MCB_VALUE_SCALE) and releases it on every end path; plot presses clear stale drags and are refused while a
 * gesture that outranks them runs; the plot's document drags end on window blur; dblclick after a drag is ignored.
 */
import { EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ChartInteractionService } from '../chart/services/chart-interaction.service';
import { McbPanelComponent, McbPlotHost } from './mcb-panel.component';

/** 800x600 main plot over 40000..60000, enough for the service to pan. */
function mainChart() {
  return {
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect },
    chartArea: { left: 0, right: 800, top: 0, bottom: 600 },
    scales: {
      x: { min: 40_000, max: 60_000, options: {} as { min?: number; max?: number } },
      y: { min: 100, max: 200, options: {} as { min?: number; max?: number } },
    },
    data: { datasets: [{ type: 'candlestick', data: Array.from({ length: 100 }, (_, i) => ({ x: i * 1000, h: 110 + i, l: 90 + i })) }] },
    config: { options: { scales: {} } },
    width: 800,
    height: 600,
    update: vi.fn(),
    draw: vi.fn(),
  };
}

describe('McbPanelComponent in the one-gesture rule (T11)', () => {
  let panel: McbPanelComponent;
  let service: ChartInteractionService;
  let main: ReturnType<typeof mainChart>;
  let host: McbPlotHost;
  let handle: { setPointerCapture: ReturnType<typeof vi.fn>; releasePointerCapture: ReturnType<typeof vi.fn> };

  const asMain = () => main as unknown as Parameters<ChartInteractionService['zoomTimeAtCursor']>[0];
  const pointer = (clientY: number, extra: Record<string, unknown> = {}) =>
    ({ button: 0, pointerId: 7, clientY, currentTarget: handle, preventDefault: vi.fn(), stopPropagation: vi.fn(), ...extra }) as unknown as PointerEvent;
  const mouseDown = (x: number, y: number) =>
    ({ button: 0, clientX: x, clientY: y, preventDefault: vi.fn() }) as unknown as MouseEvent;
  const mouse = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y }) as MouseEvent;
  const touchEvent = (...pts: Array<[number, number]>) =>
    ({ touches: pts.map(([clientX, clientY]) => ({ clientX, clientY })), preventDefault: vi.fn() }) as unknown as TouchEvent;
  const docMove = (x: number, y = 100) => document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
  const docUp = () => document.dispatchEvent(new MouseEvent('mouseup'));
  const axisWheel = (deltaY: number) => ({ deltaY, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as unknown as WheelEvent;

  beforeEach(() => {
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
    service = TestBed.inject(ChartInteractionService);
    service.isInteracting = false;
    service.setRanges({ min: 0, max: 99_000 }, { min: -10_000, max: 109_000 }, { min: 90, max: 209 });
    main = mainChart();
    // Wired like MarketCipherBChartComponent's host: gestures and the rule go through the real service.
    host = {
      wheel: vi.fn(),
      crosshair: vi.fn(),
      dismissCrosshair: vi.fn(),
      isCrosshairPinned: vi.fn(() => service.isCrosshairPinned),
      pinCrosshair: vi.fn(),
      panStart: vi.fn((clientX: number) => service.beginLinkedPan(asMain(), clientX)),
      panTo: vi.fn((clientX: number) => service.linkedPanTo(clientX, asMain())),
      panEnd: vi.fn(() => service.endLinkedPan(asMain())),
      pinchStart: vi.fn(() => true),
      pinchTo: vi.fn(),
      pinchEnd: vi.fn(),
      resetTimeScale: vi.fn(),
      timeAxisScaleStart: vi.fn((clientX: number) => service.beginTimeAxisScale(asMain(), clientX)),
      timeAxisScaleTo: vi.fn((clientX: number) => service.updateTimeAxisScale(clientX, asMain())),
      timeAxisScaleEnd: vi.fn(() => service.endTimeAxisScale(asMain())),
      beginPress: vi.fn((p: 'mouse' | 'touch') => service.beginPress(p)),
      claimValueScale: vi.fn(() => service.claimGesture('mcb-value-scale')),
      releaseValueScale: vi.fn(() => service.releaseGesture('mcb-value-scale')),
      isGestureActive: vi.fn(() => service.activeGesture !== null),
      doubleClickFollowsDrag: vi.fn(() => service.doubleClickFollowsDrag),
    };
    const fixture = TestBed.createComponent(McbPanelComponent);
    fixture.componentRef.setInput('host', host);
    fixture.componentRef.setInput('chartData', { datasets: [] });
    fixture.componentRef.setInput('chartOptions', {});
    panel = fixture.componentInstance;
    handle = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    const internals = panel as unknown as { chart: unknown; canvasEl: unknown };
    // Pane plot 100..900 (canvas at 50), time axis below y = 150; value scale -100..100.
    internals.chart = { chart: { chartArea: { left: 100, right: 900, top: 0, bottom: 150 }, scales: { y: { min: -100, max: 100 } } } };
    internals.canvasEl = { nativeElement: { getBoundingClientRect: () => ({ left: 50, top: 0, height: 180 }) } };
  });

  afterEach(() => {
    docUp();
    service.cancelAllGestures();
  });

  describe('value-axis drag claim (loose end 4)', () => {
    it('claims on press and releases on pointerup, pointercancel, lost capture, blur and destroy', () => {
      const ends: Array<[string, () => void]> = [
        ['pointerup', () => panel.onAxisPointerUp(pointer(120))],
        ['pointercancel', () => panel.onAxisPointerUp(pointer(120))],
        ['lostpointercapture', () => panel.onAxisPointerUp(pointer(120))],
        ['blur', () => window.dispatchEvent(new Event('blur'))],
        ['destroy', () => panel.ngOnDestroy()],
      ];
      for (const [name, end] of ends) {
        panel.onAxisPointerDown(pointer(100));
        expect(panel.dragging(), name).toBe(true);
        expect(service.activeGesture, name).toBe('mcb-value-scale');
        end();
        expect(panel.dragging(), name).toBe(false);
        expect(service.activeGesture, name).toBeNull();
      }
    });

    it('while it runs, a main-chart mousedown is refused; after release it pans', () => {
      panel.onAxisPointerDown(pointer(100));
      service.onMouseDown(mouse(400, 300), asMain());
      expect(service.gestureType).toBeNull();
      docMove(480, 300);
      expect(main.scales.x.options).toEqual({});
      service.onMouseUp(mouse(480, 300), asMain());
      panel.onAxisPointerMove(pointer(160)); // the value drag still runs
      expect(panel.yRange()).not.toBeNull();
      panel.onAxisPointerUp(pointer(160));

      service.onMouseDown(mouse(400, 300), asMain());
      service.isInteracting = false;
      docMove(480, 300);
      expect(main.scales.x.options).toEqual({ min: 38_000, max: 58_000 });
    });

    it('while it runs, the pane plot starts nothing (mouse, touch, wheel)', () => {
      panel.onAxisPointerDown(pointer(100));
      panel.onPlotMouseDown(mouseDown(350, 100));
      expect(host.panStart).not.toHaveBeenCalled();
      expect(panel.panning()).toBe(false);
      panel.onPlotMouseDown(mouseDown(350, 170)); // time axis
      expect(host.timeAxisScaleStart).not.toHaveBeenCalled();
      panel.onPlotTouchStart(touchEvent([350, 100]));
      panel.onPlotTouchMove(touchEvent([420, 100]));
      expect(host.panStart).not.toHaveBeenCalled();
      expect(service.activeGesture).toBe('mcb-value-scale');
    });

    it('is refused while a main-chart (or pane) gesture runs: no drag, no capture', () => {
      service.onMouseDown(mouse(400, 300), asMain()); // main pan running
      panel.onAxisPointerDown(pointer(100));
      expect(panel.dragging()).toBe(false);
      expect(handle.setPointerCapture).not.toHaveBeenCalled();
      panel.onAxisPointerMove(pointer(200));
      expect(panel.yRange()).toBeNull();
      expect(service.activeGesture).toBe('pan');
      docUp();

      panel.onPlotMouseDown(mouseDown(350, 170)); // pane time-axis drag running
      panel.onAxisPointerDown(pointer(100));
      expect(panel.dragging()).toBe(false);
    });

    it('the axis wheel is ignored during its own drag and during any page gesture', () => {
      panel.onAxisPointerDown(pointer(100));
      panel.onAxisPointerMove(pointer(130));
      const reached = panel.yRange();
      panel.onAxisWheel(axisWheel(100));
      expect(panel.yRange()).toEqual(reached);
      panel.onAxisPointerUp(pointer(130));

      service.onMouseDown(mouse(400, 300), asMain());
      panel.onAxisWheel(axisWheel(100));
      expect(panel.yRange()).toEqual(reached);
      docUp();
      panel.onAxisWheel(axisWheel(100));
      expect(panel.yRange()).not.toEqual(reached);
    });

    it('without a host (or an older host) the value axis works pane-locally as before', () => {
      const fixture = TestBed.createComponent(McbPanelComponent);
      fixture.componentRef.setInput('chartData', { datasets: [] });
      fixture.componentRef.setInput('chartOptions', {});
      const bare = fixture.componentInstance;
      (bare as unknown as { chart: unknown }).chart = { chart: { scales: { y: { min: -100, max: 100 } } } };
      bare.onAxisPointerDown(pointer(100));
      expect(bare.dragging()).toBe(true);
      bare.onAxisPointerUp(pointer(100));
      expect(bare.dragging()).toBe(false);
    });
  });

  describe('plot presses', () => {
    it('a mouse press clears a stale main-chart drag before it pans', () => {
      service.onMouseDown(mouse(850, 300), asMain()); // price-axis drag, release lost
      panel.onPlotMouseDown(mouseDown(350, 100));
      expect(service.activeGesture).toBe('pan');
      expect(host.panStart).toHaveBeenCalledTimes(1);
      expect(panel.panning()).toBe(true);
    });

    it('a stale pane time-axis drag does not hijack the next plot pan', () => {
      panel.onPlotMouseDown(mouseDown(350, 170)); // time-axis drag, release lost
      panel.onPlotMouseDown(mouseDown(350, 100)); // new press on the plot
      expect(panel.zoomingTime()).toBe(false);
      expect(panel.panning()).toBe(true);
      vi.mocked(host.timeAxisScaleTo).mockClear();
      docMove(420);
      expect(host.timeAxisScaleTo).not.toHaveBeenCalled();
      expect(host.panTo).toHaveBeenCalledWith(420);
    });

    it('a refused pan (another gesture outranks it) leaves the pane idle', () => {
      service.onTouchStart(touchEvent([400, 300]), asMain());
      service.onTouchStart(touchEvent([350, 300], [450, 300]), asMain()); // main pinch
      panel.onPlotMouseDown(mouseDown(350, 100));
      expect(panel.panning()).toBe(false);
      expect(service.activeGesture).toBe('pinch');
      docMove(420);
      expect(host.panTo).not.toHaveBeenCalled();
    });

    it('a touch pan refused at its threshold drops the touch', () => {
      panel.onPlotTouchStart(touchEvent([350, 100]));
      service.claimGesture('mcb-value-scale'); // e.g. another finger on the value axis
      panel.onPlotTouchMove(touchEvent([420, 100]));
      expect(host.panStart).toHaveBeenCalledTimes(1);
      expect(service.activeGesture).toBe('mcb-value-scale');
      panel.onPlotTouchMove(touchEvent([450, 100]));
      expect(host.panTo).not.toHaveBeenCalled();
      panel.onPlotTouchEnd(touchEvent());
      expect(host.panEnd).not.toHaveBeenCalled();
    });
  });

  describe('plot document drags end on window blur (loose end 3)', () => {
    it('pan: blur ends it (service back to idle) and later moves do nothing', () => {
      panel.onPlotMouseDown(mouseDown(350, 100));
      expect(service.activeGesture).toBe('pan');
      window.dispatchEvent(new Event('blur'));
      expect(host.panEnd).toHaveBeenCalledTimes(1);
      expect(panel.panning()).toBe(false);
      expect(service.activeGesture).toBeNull();
      docMove(500);
      expect(host.panTo).not.toHaveBeenCalled();
    });

    it('time axis: blur ends it (service back to idle)', () => {
      panel.onPlotMouseDown(mouseDown(350, 170));
      expect(service.activeGesture).toBe('zoom-x');
      window.dispatchEvent(new Event('blur'));
      expect(service.activeGesture).toBeNull();
      expect(panel.zoomingTime()).toBe(false);
    });
  });

  describe('double click after a drag', () => {
    it('the time-axis reset ignores a dblclick whose first click was a drag', () => {
      service.isInteracting = false;
      panel.onPlotMouseDown(mouseDown(350, 170));
      docMove(420, 170);
      docUp();
      panel.onPlotMouseDown(mouseDown(350, 170)); // a click
      docUp();
      panel.onPlotDblClick(mouse(350, 170));
      expect(host.resetTimeScale).not.toHaveBeenCalled();
      panel.onPlotMouseDown(mouseDown(350, 170)); // two clicks
      docUp();
      panel.onPlotDblClick(mouse(350, 170));
      expect(host.resetTimeScale).toHaveBeenCalledTimes(1);
    });
  });
});
