/**
 * MCB pane drags that capture the pointer (splitter, value axis): a window blur
 * (alt-tab, focus loss) delivers no pointerup, so it must end the drag itself.
 */
import { EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { McbPanelComponent } from './mcb-panel.component';

describe('McbPanelComponent pointer-captured drags end on window blur', () => {
  let panel: McbPanelComponent;
  let handle: { setPointerCapture: ReturnType<typeof vi.fn>; releasePointerCapture: ReturnType<typeof vi.fn> };

  const pointer = (clientY: number, extra: Record<string, unknown> = {}) =>
    ({
      button: 0,
      pointerId: 7,
      clientY,
      currentTarget: handle,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      ...extra,
    }) as unknown as PointerEvent;

  beforeEach(() => {
    try {
      localStorage.removeItem('mtb.mcbPanelHeight');
    } catch {}
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
    handle = { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() };
    (panel as unknown as { panelEl: unknown }).panelEl = {
      nativeElement: {
        getBoundingClientRect: () => ({ height: 200 }),
        parentElement: { getBoundingClientRect: () => ({ height: 1000 }) },
      },
    };
  });

  afterEach(() => {
    try {
      localStorage.removeItem('mtb.mcbPanelHeight');
    } catch {}
  });

  it('splitter: blur ends the drag, keeps and persists the height, and later moves do nothing', () => {
    panel.onResizePointerDown(pointer(500));
    expect(panel.resizing()).toBe(true);
    panel.onResizePointerMove(pointer(450)); // 50px up -> 250px
    expect(panel.panelHeight()).toBe(250);

    window.dispatchEvent(new Event('blur'));

    expect(panel.resizing()).toBe(false);
    expect(panel.panelHeight()).toBe(250);
    expect(localStorage.getItem('mtb.mcbPanelHeight')).toBe('250');
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
    panel.onResizePointerMove(pointer(300));
    expect(panel.panelHeight()).toBe(250);
  });

  it('splitter: the blur listener is removed after a normal pointerup', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    panel.onResizePointerDown(pointer(500));
    panel.onResizePointerUp(pointer(480));
    expect(remove).toHaveBeenCalledWith('blur', expect.any(Function));
    expect(panel.resizing()).toBe(false);
    remove.mockRestore();
  });

  it('value axis: blur ends the drag (the y-range reached stays) and later moves do nothing', () => {
    (panel as unknown as { chart: unknown }).chart = { chart: { scales: { y: { min: -100, max: 100 } } } };
    panel.onAxisPointerDown(pointer(100));
    expect(panel.dragging()).toBe(true);
    panel.onAxisPointerMove(pointer(150));
    const reached = panel.yRange();
    expect(reached).not.toBeNull();

    window.dispatchEvent(new Event('blur'));

    expect(panel.dragging()).toBe(false);
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(panel.yRange()).toEqual(reached);
    panel.onAxisPointerMove(pointer(300));
    expect(panel.yRange()).toEqual(reached);
  });

  it('destroy mid-drag ends both drags', () => {
    panel.onResizePointerDown(pointer(500));
    panel.ngOnDestroy();
    expect(panel.resizing()).toBe(false);
  });
});
