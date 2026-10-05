/**
 * MCB pane time axis: a drag below the plot is forwarded to the page host as an
 * anchored time-axis scale (no zoom factor math in the panel), keeps following
 * the mouse outside the panel and ends on release / destroy.
 */
import { EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { McbPanelComponent, McbPlotHost } from './mcb-panel.component';

function makeHost() {
  return {
    wheel: vi.fn(),
    crosshair: vi.fn(),
    dismissCrosshair: vi.fn(),
    isCrosshairPinned: vi.fn(() => false),
    pinCrosshair: vi.fn(),
    panStart: vi.fn(),
    panBy: vi.fn(),
    panEnd: vi.fn(),
    pinchStart: vi.fn(() => true),
    pinchTo: vi.fn(),
    pinchEnd: vi.fn(),
    zoomToLatest: vi.fn(),
    timeAxisScaleStart: vi.fn(() => true),
    timeAxisScaleTo: vi.fn(),
    timeAxisScaleEnd: vi.fn(),
  } satisfies McbPlotHost;
}

describe('McbPanelComponent time axis drag', () => {
  let panel: McbPanelComponent;
  let host: ReturnType<typeof makeHost>;
  let internals: { chart: unknown; canvasEl: unknown };

  const mouseDown = (x: number, y: number) =>
    ({ button: 0, clientX: x, clientY: y, preventDefault: vi.fn() }) as unknown as MouseEvent;
  const docMove = (x: number, y = 190) =>
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }));
  const docUp = () => document.dispatchEvent(new MouseEvent('mouseup'));

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
    host = makeHost();
    const fixture = TestBed.createComponent(McbPanelComponent);
    fixture.componentRef.setInput('host', host);
    fixture.componentRef.setInput('chartData', { datasets: [] });
    fixture.componentRef.setInput('chartOptions', {});
    panel = fixture.componentInstance;
    internals = panel as unknown as { chart: unknown; canvasEl: unknown };
    // Plot area 100..900 (canvas starts at 50), time axis below y = 150; no real Chart.js needed.
    internals.chart = { chart: { chartArea: { left: 100, right: 900, top: 0, bottom: 150 } } };
    internals.canvasEl = {
      nativeElement: { getBoundingClientRect: () => ({ left: 50, top: 0, height: 180 }) },
    };
  });

  afterEach(() => docUp());

  it('starts the host scale with the press x across the plot, not on the plot itself', () => {
    panel.onPlotMouseDown(mouseDown(350, 100)); // inside the plot: pan, not time-axis scale
    expect(host.timeAxisScaleStart).not.toHaveBeenCalled();
    expect(host.panStart).toHaveBeenCalled();
    docUp();
    host.panEnd.mockClear();

    panel.onPlotMouseDown(mouseDown(350, 170)); // below the plot area
    // client 350 - canvas left 50 - plot left 100 = 200px across the plot
    expect(host.timeAxisScaleStart).toHaveBeenCalledWith(350, 200);
    expect(host.panStart).toHaveBeenCalledTimes(1);
    expect(panel.zoomingTime()).toBe(true);
  });

  it('forwards the pointer to the host, also outside the panel, and ends on release', () => {
    panel.onPlotMouseDown(mouseDown(350, 170));
    docMove(420);
    docMove(5000, -400); // far outside the panel
    expect(host.timeAxisScaleTo).toHaveBeenNthCalledWith(1, 420);
    expect(host.timeAxisScaleTo).toHaveBeenNthCalledWith(2, 5000);
    expect(host.pinchTo).not.toHaveBeenCalled();

    docUp();
    expect(host.timeAxisScaleEnd).toHaveBeenCalledTimes(1);
    expect(panel.zoomingTime()).toBe(false);
    docMove(600);
    expect(host.timeAxisScaleTo).toHaveBeenCalledTimes(2);
  });

  it('does not start a drag when the host cannot scale yet', () => {
    host.timeAxisScaleStart.mockReturnValue(false);
    panel.onPlotMouseDown(mouseDown(350, 170));
    expect(panel.zoomingTime()).toBe(false);
    docMove(420);
    expect(host.timeAxisScaleTo).not.toHaveBeenCalled();
  });

  it('ends the host scale and drops the listeners when destroyed mid-drag', () => {
    panel.onPlotMouseDown(mouseDown(350, 170));
    panel.ngOnDestroy();
    expect(host.timeAxisScaleEnd).toHaveBeenCalledTimes(1);
    docMove(420);
    expect(host.timeAxisScaleTo).not.toHaveBeenCalled();
  });

  it('destroy mid-drag removes the listeners even when the host end throws', () => {
    host.timeAxisScaleEnd.mockImplementation(() => {
      throw new Error('chart destroyed');
    });
    panel.onPlotMouseDown(mouseDown(350, 170));
    expect(() => panel.ngOnDestroy()).toThrow();
    expect(panel.zoomingTime()).toBe(false);
    docMove(420);
    expect(host.timeAxisScaleTo).not.toHaveBeenCalled();
  });

  it('window blur ends the drag', () => {
    panel.onPlotMouseDown(mouseDown(350, 170));
    window.dispatchEvent(new Event('blur'));
    expect(host.timeAxisScaleEnd).toHaveBeenCalledTimes(1);
    expect(panel.zoomingTime()).toBe(false);
    docMove(420);
    expect(host.timeAxisScaleTo).not.toHaveBeenCalled();
  });

  it('a touch swipe on the time axis uses the same host scale', () => {
    const touch = (x: number, y: number) =>
      ({ touches: [{ clientX: x, clientY: y }], preventDefault: vi.fn() }) as unknown as TouchEvent;
    panel.onPlotTouchStart(touch(350, 170));
    expect(host.timeAxisScaleStart).toHaveBeenCalledWith(350, 200);
    panel.onPlotTouchMove(touch(380, 170));
    expect(host.timeAxisScaleTo).toHaveBeenCalledWith(380);
    panel.onPlotTouchEnd({ touches: [] } as unknown as TouchEvent);
    expect(host.timeAxisScaleEnd).toHaveBeenCalledTimes(1);
    expect(host.panStart).not.toHaveBeenCalled();
  });

  describe('two-finger pinch', () => {
    const touches = (...pts: Array<[number, number]>) =>
      ({ touches: pts.map(([clientX, clientY]) => ({ clientX, clientY })), preventDefault: vi.fn() }) as unknown as TouchEvent;

    it('forwards the distance and the pane-relative centroid to the host, and ends with the last finger', () => {
      panel.onPlotTouchStart(touches([300, 80]));
      // centroid 400 -> 400 - canvas left 50 - plot left 100 = 250 across the plot
      panel.onPlotTouchStart(touches([350, 80], [450, 80]));
      expect(host.pinchStart).toHaveBeenCalledWith(100, 250);
      panel.onPlotTouchMove(touches([330, 80], [530, 80]));
      expect(host.pinchTo).toHaveBeenLastCalledWith(200, 280);
      host.pinchTo.mockClear();
      panel.onPlotTouchMove(touches([400, 80], [400, 80])); // zero distance: ignored
      expect(host.pinchTo).not.toHaveBeenCalled();
      panel.onPlotTouchEnd({ touches: [] } as unknown as TouchEvent);
      expect(host.pinchEnd).toHaveBeenCalledTimes(1);
      expect(host.panStart).not.toHaveBeenCalled();
    });

    it('ends a running pan before the pinch starts (no double gesture)', () => {
      panel.onPlotTouchStart(touches([300, 80]));
      panel.onPlotTouchMove(touches([340, 80]));
      expect(host.panStart).toHaveBeenCalledTimes(1);
      panel.onPlotTouchStart(touches([340, 80], [440, 80]));
      expect(host.panEnd).toHaveBeenCalledTimes(1);
      expect(host.pinchStart).toHaveBeenCalledTimes(1);
      host.panBy.mockClear();
      panel.onPlotTouchMove(touches([340, 80], [480, 80]));
      expect(host.panBy).not.toHaveBeenCalled();
    });

    it('lifting one finger rebases the other as a fresh pan (no jump, never a tap)', () => {
      panel.onPlotTouchStart(touches([300, 80]));
      panel.onPlotTouchStart(touches([350, 80], [450, 80]));
      panel.onPlotTouchEnd(touches([450, 80]));
      expect(host.pinchEnd).toHaveBeenCalledTimes(1);
      expect(host.panStart).not.toHaveBeenCalled();
      panel.onPlotTouchMove(touches([455, 80])); // under the threshold
      expect(host.panBy).not.toHaveBeenCalled();
      panel.onPlotTouchMove(touches([480, 80]));
      expect(host.panStart).toHaveBeenCalledTimes(1);
      expect(host.panBy).toHaveBeenLastCalledWith(30);
      host.dismissCrosshair.mockClear();
      panel.onPlotTouchEnd({ touches: [] } as unknown as TouchEvent);
      expect(host.panEnd).toHaveBeenCalledTimes(1);
      expect(host.pinchEnd).toHaveBeenCalledTimes(1);
    });
  });
});
