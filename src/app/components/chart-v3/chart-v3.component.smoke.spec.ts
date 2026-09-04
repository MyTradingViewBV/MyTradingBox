import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { EventEmitter } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { ChartV3Component } from './chart-v3.component';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';

describe('ChartV3Component', () => {
  let component: ChartV3Component;
  let fixture: ComponentFixture<ChartV3Component>;

  class MockSettingsService {
    dispatchAppAction = vi.fn();
    getExchangeId$() { return of(1); }
    getSelectedExchange() { return of(null); }
    getSelectedSymbol() { return of(null); }
    getSelectedTimeframe() { return of('1h'); }
    getUiModeOverride() { return of('web'); }
  }

  class MockChartService {
    getExchanges() { return of([]); }
    getSymbols() { return of([]); }
    loadChartState() { return of(null); }
    saveChartState() { return of(null); }
  }

  class MockAppService {
    isAdmin() { return of(true); }
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

    await TestBed.configureTestingModule({
      imports: [ChartV3Component, HttpClientTestingModule],
      providers: [
        { provide: AppService, useClass: MockAppService },
        { provide: ChartService, useClass: MockChartService },
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: KeyZoneSettingsService, useValue: mockKeyZones },
        { provide: TranslateService, useClass: MockTranslateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartV3Component);
    component = fixture.componentInstance;
  });

  it('should create with simple chart defaults', () => {
    expect(component).toBeTruthy();
    expect(component.showBoxes).toBe(true);
    expect(component.boxMode).toBe('boxes');
    expect(component.showOrders).toBe(false);
    expect(component.showKeyZones).toBe(false);
    expect(component.showIndicators).toBe(false);
    expect(component.showMarketCipher).toBe(false);
    expect(component.showDivergences).toBe(false);
  });
});