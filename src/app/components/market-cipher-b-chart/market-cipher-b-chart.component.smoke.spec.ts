import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { MarketCipherBChartComponent } from './market-cipher-b-chart.component';
import { McbPanelComponent } from './mcb-panel.component';
import { buildMcbPanelData } from './mcb-indicator';
import { ChartBoxesService } from '../chart/services/chart-boxes.service';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';

function makeCandles(count: number): Array<{ x: number; o: number; h: number; l: number; c: number }> {
  return Array.from({ length: count }, (_, i) => {
    const c = 100 + Math.sin(i / 5) * 10;
    return { x: 1_700_000_000_000 + i * 3_600_000, o: c - 1, h: c + 2, l: c - 2, c };
  });
}

describe('buildMcbPanelData', () => {
  it('returns null without usable candles', () => {
    expect(buildMcbPanelData([])).toBeNull();
    expect(buildMcbPanelData([{ x: 'bad' }])).toBeNull();
  });

  it('builds the oscillator datasets and side values', () => {
    const panel = buildMcbPanelData(makeCandles(120));
    expect(panel).not.toBeNull();
    const labels = panel!.chartData.datasets.map((d: any) => d.label);
    expect(labels).toEqual(expect.arrayContaining(['fast', 'slow', 'vwap', 'mf+', 'mf-', 'rsi', 'stoch', 'buy', 'sell']));
    expect(panel!.sideValues.map((v) => v.key)).toContain('mf');
  });
});

describe('MarketCipherBChartComponent', () => {
  let component: MarketCipherBChartComponent;
  let fixture: ComponentFixture<MarketCipherBChartComponent>;
  let boxesService: { getBoxes: ReturnType<typeof vi.fn> };

  class MockSettingsService {
    dispatchAppAction = vi.fn();
    setSelectedExchange = vi.fn();
    getExchangeId$() { return of(1); }
    getSelectedExchange() { return of(null); }
    getSelectedSymbol() { return of(null); }
    getSelectedTimeframe() { return of('1h'); }
    getUiModeOverride() { return of('web'); }
  }

  class MockChartService {
    getExchanges() { return of([]); }
    getSymbols() { return of([]); }
    getCandles = vi.fn(() => of([]));
    loadChartState() { return of(null); }
    saveChartState() { return of(null); }
  }

  class MockTranslateService {
    onLangChange = new EventEmitter();
    onTranslationChange = new EventEmitter();
    onDefaultLangChange = new EventEmitter();
    get(key: string | string[]) { return of(key); }
    instant(key: string | string[]) { return key; }
  }

  beforeEach(async () => {
    const mockKeyZones = {
      settings$: of({ enabled: true, timeframes: {} }),
      getSettings: () => ({ enabled: true, timeframes: {} }),
      getAvailableTimeframes: () => [],
      isAllTimeframesEnabled: () => true,
      setEnabled: vi.fn(),
      setTimeframeEnabled: vi.fn(),
    } as unknown as KeyZoneSettingsService;
    boxesService = { getBoxes: vi.fn(() => of([])) };

    await TestBed.configureTestingModule({
      imports: [MarketCipherBChartComponent, HttpClientTestingModule],
      providers: [
        { provide: AppService, useValue: { isAdmin: () => of(true) } },
        { provide: ChartService, useClass: MockChartService },
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: KeyZoneSettingsService, useValue: mockKeyZones },
        { provide: ChartBoxesService, useValue: boxesService },
        { provide: TranslateService, useClass: MockTranslateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MarketCipherBChartComponent);
    component = fixture.componentInstance;
  });

  it('hides the main chart x-axis (the MCB panel carries the time axis)', () => {
    expect(component.chartOptions.scales.x.display).toBe(false);
    expect(component.chartOptions.layout.padding.bottom).toBe(4);
  });

  it('exposes the MCB panel only once it has datasets', () => {
    expect(component.auxPanel).toBeNull();

    const panel = buildMcbPanelData(makeCandles(120))!;
    component.mcbChartData = panel.chartData;
    component.mcbSideValues = panel.sideValues;

    const aux = component.auxPanel;
    expect(aux?.component).toBe(McbPanelComponent);
    expect(aux?.inputs['chartData']).toBe(panel.chartData);
    expect(aux?.inputs['axisWidthPx']).toBe(72);
  });

  it('requests the default (1d) boxes, not the selected timeframe', () => {
    component.boxMode = 'all';
    component.fetchBoxes('BTCUSDT').subscribe();
    expect(boxesService.getBoxes).toHaveBeenCalledWith('BTCUSDT', 'all');
  });
});
