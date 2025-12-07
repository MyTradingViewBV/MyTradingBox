import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WatchlistComponent } from './watchlist';
import { of } from 'rxjs';

class MockChartService {
  getWatchlist() {
    return of([
      { Symbol: 'BTCUSDT', Timeframe: '1h', Direction: 'Bull', Status: 'ACTIVE', MonitoringStatus: 'ACTIVEMONITORING' },
      { Symbol: 'ETHUSDT', Timeframe: '4h', Direction: 'Bear', Status: 'BTC-DIV', MonitoringStatus: 'ACTIVEMONITORING' },
    ] as any);
  }
  getSymbols() { return of([{ SymbolName: 'BTCUSDT' }] as any); }
}

describe('WatchlistComponent', () => {
  let component: WatchlistComponent;
  let fixture: ComponentFixture<WatchlistComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatchlistComponent],
      providers: [{ provide: (component as any)?._chartService?.constructor || 'ChartService', useClass: MockChartService }],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should fetch and split items', () => {
    expect(component.watchlist.length).toBeGreaterThan(0);
    expect(component.btcDivItems.length).toBeGreaterThan(0);
    expect(component.otherItems.length).toBeGreaterThan(0);
  });

  it('should toggle favorite state', () => {
    const item = component.watchlist[0] as any;
    const ev = new Event('click');
    spyOn(ev, 'stopPropagation');
    component.toggleFavorite(item, ev);
    expect(ev.stopPropagation).toHaveBeenCalled();
    expect(component.isFavorite(item)).toBeTrue();
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
