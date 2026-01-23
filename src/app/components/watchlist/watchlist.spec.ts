import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WatchlistComponent } from './watchlist';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { of } from 'rxjs';
import { UserSymbolsService } from 'src/app/modules/shared/services/http/user-symbols.service';

class MockChartService {
  getWatchlist() {
    return of([
      { Symbol: 'BTCUSDT', Timeframe: '1h', Direction: 'Bull', Status: 'ACTIVE', MonitoringStatus: 'ACTIVEMONITORING' },
      { Symbol: 'ETHUSDT', Timeframe: '4h', Direction: 'Bear', Status: 'BTC-DIV', MonitoringStatus: 'ACTIVEMONITORING' },
    ] as any);
  }
  getSymbols() { return of([{ SymbolName: 'BTCUSDT' }] as any); }
}

class MockSettingsService {
  dispatchAppAction() {}
}

class MockUserSymbolsService {
  getUserSymbols() { return of([] as any); }
  addUserSymbol(id: number) { return of({ Id: 1, SymbolId: id, ExchangeId: 1 } as any); }
}

describe('WatchlistComponent', () => {
  let component: WatchlistComponent;
  let fixture: ComponentFixture<WatchlistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatchlistComponent, ScrollingModule],
      providers: [
        { provide: ChartService, useClass: MockChartService },
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: UserSymbolsService, useClass: MockUserSymbolsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('adds a symbol to user list on click', () => {
    const symbol: any = { Id: 42, SymbolName: 'BTCUSDT' };
    expect(component.userSymbols.length).toBe(0);
    component.addSymbolToProfile(symbol);
    expect(component.userSymbols.some(u => u.SymbolId === 42)).toBeTrue();
  });
});
// import { ComponentFixture, TestBed } from '@angular/core/testing';

// import { Watchlist } from './watchlist';

// describe('Watchlist', () => {
//   let component: Watchlist;
//   let fixture: ComponentFixture<Watchlist>;

//   beforeEach(async () => {
//     await TestBed.configureTestingModule({
//       imports: [Watchlist]
//     })
//     .compileComponents();

//     fixture = TestBed.createComponent(Watchlist);
//     component = fixture.componentInstance;
//     fixture.detectChanges();
//   });

//   it('should create', () => {
//     expect(component).toBeTruthy();
//   });
// });
