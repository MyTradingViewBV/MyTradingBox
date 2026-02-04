// Adjusted spec to test existing ChartComponent instead of missing ChartTestComponent
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartComponent } from './chart-component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { of } from 'rxjs';

describe('ChartComponent', () => {
  let component: ChartComponent;
  let fixture: ComponentFixture<ChartComponent>;

  class MockSettingsService {
    dispatchAppAction = jasmine.createSpy('dispatch');
    getSelectedExchange() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
    getExchangeId$() { return of(1); }
  }

  beforeEach(async () => {
    const mockKeyZones = {
      settings$: of({ enabled: true, timeframes: {} }),
      getSettings: () => ({ enabled: true, timeframes: {} }),
      getAvailableTimeframes: () => [],
      isAllTimeframesEnabled: () => true,
      setEnabled: jasmine.createSpy('setEnabled'),
      setTimeframeEnabled: jasmine.createSpy('setTimeframeEnabled'),
    } as unknown as KeyZoneSettingsService;

    await TestBed.configureTestingModule({
      imports: [ChartComponent, HttpClientTestingModule],
      providers: [
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: KeyZoneSettingsService, useValue: mockKeyZones },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
