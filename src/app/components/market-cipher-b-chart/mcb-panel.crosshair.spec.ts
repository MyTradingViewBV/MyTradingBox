/**
 * MCB pane shared crosshair: the horizontal line and the value label belong to the pane the pointer is in;
 * a main-chart pointer only contributes the shared time (vertical line).
 */
import { EventEmitter } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
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
});
