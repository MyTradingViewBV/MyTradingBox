import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ChartComponent } from './chart-component';
import { ChartBaseComponent } from './chart-base.component';
import { ChartBoxesService } from './services/chart-boxes.service';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';

describe('ChartComponent (shared ChartBaseComponent)', () => {
  let component: ChartComponent;
  let fixture: ComponentFixture<ChartComponent>;
  let boxesService: { getBoxes: ReturnType<typeof vi.fn> };

  class MockSettingsService {
    dispatchAppAction = vi.fn();
    setSelectedExchange = vi.fn();
    getExchangeId$() {
      return of(1);
    }
    getSelectedExchange() {
      return of(null);
    }
    getSelectedSymbol() {
      return of(null);
    }
    getSelectedTimeframe() {
      return of('4h');
    }
    getUiModeOverride() {
      return of('mobile');
    }
  }

  class MockChartService {
    getExchanges() {
      return of([]);
    }
    getSymbols() {
      return of([]);
    }
    getCandles = vi.fn(() => of([]));
    loadChartState() {
      return of(null);
    }
    saveChartState() {
      return of(null);
    }
  }

  class MockAppService {
    isAdmin() {
      return of(false);
    }
  }

  class MockTranslateService {
    onLangChange = new EventEmitter();
    onTranslationChange = new EventEmitter();
    onDefaultLangChange = new EventEmitter();
    get(key: string | string[]) {
      return of(key);
    }
    instant(key: string | string[]) {
      return key;
    }
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
      imports: [ChartComponent, HttpClientTestingModule],
      providers: [
        { provide: AppService, useClass: MockAppService },
        { provide: ChartService, useClass: MockChartService },
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: KeyZoneSettingsService, useValue: mockKeyZones },
        { provide: ChartBoxesService, useValue: boxesService },
        { provide: TranslateService, useClass: MockTranslateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartComponent);
    component = fixture.componentInstance;
  });

  it('should create as a ChartBaseComponent subclass', () => {
    expect(component).toBeTruthy();
    expect(component instanceof ChartBaseComponent).toBe(true);
  });

  it('should not expose the 1-minute timeframe', () => {
    expect(
      component.timeframes.some((timeframe) => timeframe.value === '1m'),
    ).toBe(false);
  });

  it('should not render an aux (MCB) panel', () => {
    expect(component.auxPanel).toBeNull();
  });

  it('should not request candles for a blank symbol', () => {
    const chartService = TestBed.inject(
      ChartService,
    ) as unknown as MockChartService;

    component.loadCandles('   ').subscribe((candles) => {
      expect(candles).toEqual([]);
    });

    expect(chartService.getCandles).not.toHaveBeenCalled();
  });

  it('should request boxes for the selected timeframe', () => {
    component.selectedTimeframe = '4h';
    component.boxMode = 'boxes';

    component.fetchBoxes('BTCUSDT').subscribe();

    expect(boxesService.getBoxes).toHaveBeenCalledWith(
      'BTCUSDT',
      'boxes',
      '4h',
    );
  });
});
