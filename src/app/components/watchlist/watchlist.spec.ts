import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WatchlistComponent } from './watchlist';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { of, throwError } from 'rxjs';
import { UserSymbolsService } from 'src/app/modules/shared/services/http/user-symbols.service';
import { Router } from '@angular/router';
import { Location } from '@angular/common';

class MockChartService {
  getWatchlist() {
    return of([
      { Symbol: 'BTCUSDT', Timeframe: '1h', Direction: 'Bull', Status: 'ACTIVE', MonitoringStatus: 'ACTIVEMONITORING' },
      { Symbol: 'ETHUSDT', Timeframe: '4h', Direction: 'Bear', Status: 'BTC-DIV', MonitoringStatus: 'ACTIVEMONITORING' },
    ] as any);
  }
  getSymbols() {
    return of([
      { Id: 1, SymbolName: 'BTCUSDT' },
      { Id: 2, SymbolName: 'ETHUSDT' },
      { Id: 3, SymbolName: 'BNBUSDT' },
    ] as any);
  }
}

class MockSettingsService {
  dispatchAppAction() {}
}

class MockUserSymbolsService {
  getUserSymbols() { return of([] as any); }
  addUserSymbol(id: number) { return of({ Id: 1, SymbolId: id, ExchangeId: 1 } as any); }
  deleteUserSymbol(id: number) { return of(null as any); }
}

class MockRouter {
  navigate(path: string[]) { return Promise.resolve(true); }
}

class MockLocation {
  back() {}
}

describe('WatchlistComponent', () => {
  let component: WatchlistComponent;
  let fixture: ComponentFixture<WatchlistComponent>;
  let chartService: MockChartService;
  let settingsService: MockSettingsService;
  let userSymbolsService: MockUserSymbolsService;
  let router: MockRouter;
  let location: MockLocation;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatchlistComponent, ScrollingModule],
      providers: [
        { provide: ChartService, useClass: MockChartService },
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: UserSymbolsService, useClass: MockUserSymbolsService },
        { provide: Router, useClass: MockRouter },
        { provide: Location, useClass: MockLocation },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistComponent);
    component = fixture.componentInstance;
    chartService = TestBed.inject(ChartService) as any;
    settingsService = TestBed.inject(SettingsService) as any;
    userSymbolsService = TestBed.inject(UserSymbolsService) as any;
    router = TestBed.inject(Router) as any;
    location = TestBed.inject(Location) as any;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with default values', () => {
      expect(component.loading).toBe(false);
      expect(component.errorMsg).toBe('');
      expect(component.searchQuery).toBe('');
      expect(component.userSymbols).toEqual([]);
      expect(component.infoOpen).toBe(false);
      expect(component.infoSymbol).toBe('');
    });

    it('should load user symbols on init', (done) => {
      const mockUserSymbols = [
        { Id: 1, SymbolId: 1, ExchangeId: 1, SymbolName: 'BTCUSDT' },
        { Id: 2, SymbolId: 2, ExchangeId: 1, SymbolName: 'ETHUSDT' },
      ];
      spyOn(userSymbolsService, 'getUserSymbols').and.returnValue(of(mockUserSymbols as any));
      
      component.ngOnInit();
      
      setTimeout(() => {
        expect(component.userSymbols).toEqual(mockUserSymbols);
        expect(component.loading).toBe(false);
        done();
      }, 50);
    });
  });

  describe('User Symbols Management', () => {
    it('should add a symbol to user list', (done) => {
      const symbol: any = { Id: 42, SymbolName: 'BTCUSDT' };
      expect(component.userSymbols.length).toBe(0);
      
      component.addSymbolToProfile(symbol);
      
      setTimeout(() => {
        expect(component.userSymbols.some(u => u.SymbolId === 42)).toBeTrue();
        expect(component.userSymbols[0].SymbolId).toBe(42);
        done();
      }, 50);
    });

    it('should not add duplicate symbol', (done) => {
      const symbol: any = { Id: 42, SymbolName: 'BTCUSDT' };
      component.userSymbols = [{ Id: 1, SymbolId: 42, ExchangeId: 1, SymbolName: 'BTCUSDT' }];
      
      component.addSymbolToProfile(symbol);
      
      setTimeout(() => {
        expect(component.userSymbols.length).toBe(1);
        done();
      }, 50);
    });

    it('should not add symbol without valid ID', () => {
      const symbol: any = { Id: null, SymbolName: 'BTCUSDT' };
      const initialLength = component.userSymbols.length;
      
      component.addSymbolToProfile(symbol);
      
      expect(component.userSymbols.length).toBe(initialLength);
    });

    it('should delete user symbol by ID', (done) => {
      component.userSymbols = [
        { Id: 1, SymbolId: 1, ExchangeId: 1, SymbolName: 'BTCUSDT' },
        { Id: 2, SymbolId: 2, ExchangeId: 1, SymbolName: 'ETHUSDT' },
      ];
      
      component.deleteUserSymbol(1);
      
      setTimeout(() => {
        expect(component.userSymbols.length).toBe(1);
        expect(component.userSymbols[0].Id).toBe(2);
        done();
      }, 50);
    });

    it('should not delete symbol without valid ID', () => {
      component.userSymbols = [
        { Id: 1, SymbolId: 1, ExchangeId: 1, SymbolName: 'BTCUSDT' },
      ];
      
      component.deleteUserSymbol(null as any);
      
      expect(component.userSymbols.length).toBe(1);
    });

    it('should handle add symbol service error gracefully', (done) => {
      const symbol: any = { Id: 42, SymbolName: 'BTCUSDT' };
      spyOn(userSymbolsService, 'addUserSymbol').and.returnValue(throwError(() => new Error('Service error')));
      spyOn(console, 'error');
      
      component.addSymbolToProfile(symbol);
      
      setTimeout(() => {
        expect(console.error).toHaveBeenCalled();
        done();
      }, 50);
    });

    it('should handle delete symbol service error gracefully', (done) => {
      spyOn(userSymbolsService, 'deleteUserSymbol').and.returnValue(throwError(() => new Error('Service error')));
      spyOn(console, 'error');
      
      component.deleteUserSymbol(1);
      
      setTimeout(() => {
        expect(console.error).toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  describe('Search Functionality', () => {
    it('should update search query on input', () => {
      component.searchQuery = 'BTC';
      component.onSearchInput();
      expect(component.searchQuery).toBe('BTC');
    });

    it('should clear search', () => {
      component.searchQuery = 'BTC';
      component.clearSearch();
      expect(component.searchQuery).toBe('');
    });

    it('should load all symbols on search focus', (done) => {
      spyOn(chartService, 'getSymbols').and.returnValue(of([
        { Id: 1, SymbolName: 'BTCUSDT' },
        { Id: 2, SymbolName: 'ETHUSDT' },
      ] as any));
      
      component.onSearchFocus();
      
      setTimeout(() => {
        expect(chartService.getSymbols).toHaveBeenCalled();
        done();
      }, 50);
    });

    it('should not reload symbols on subsequent search focus', (done) => {
      spyOn(chartService, 'getSymbols').and.returnValue(of([] as any));
      
      component.onSearchFocus();
      component.onSearchFocus();
      
      setTimeout(() => {
        expect(chartService.getSymbols).toHaveBeenCalledTimes(1);
        done();
      }, 50);
    });

    it('should add symbol from search results', (done) => {
      const vm: any = { id: 42, name: 'BTCUSDT', isUserSymbol: false };
      component['allSymbols$'].next([{ Id: 42, SymbolName: 'BTCUSDT' } as any]);
      
      component.addSymbolByVm(vm);
      
      setTimeout(() => {
        expect(component.userSymbols.some(u => u.SymbolId === 42)).toBeTrue();
        done();
      }, 50);
    });

    it('should not add user symbol from search results', () => {
      const vm: any = { id: 42, name: 'BTCUSDT', isUserSymbol: true };
      
      component.addSymbolByVm(vm);
      
      expect(component.userSymbols.length).toBe(0);
    });

    it('should delete symbol from search results', (done) => {
      component.userSymbols = [
        { Id: 1, SymbolId: 1, ExchangeId: 1, SymbolName: 'BTCUSDT' },
      ];
      const vm: any = { id: 1, name: 'BTCUSDT', isUserSymbol: true, userSymbolId: 1 };
      
      component.deleteByVm(vm);
      
      setTimeout(() => {
        expect(component.userSymbols.length).toBe(0);
        done();
      }, 50);
    });

    it('should not delete symbol without userSymbolId', () => {
      component.userSymbols = [
        { Id: 1, SymbolId: 1, ExchangeId: 1, SymbolName: 'BTCUSDT' },
      ];
      const vm: any = { id: 1, name: 'BTCUSDT', isUserSymbol: true };
      
      component.deleteByVm(vm);
      
      expect(component.userSymbols.length).toBe(1);
    });
  });

  describe('Navigation', () => {
    it('should navigate to chart with symbol and timeframe', (done) => {
      const mockSymbols = [{ Id: 1, SymbolName: 'BTCUSDT' }];
      spyOn(chartService, 'getSymbols').and.returnValue(of(mockSymbols as any));
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      spyOn(settingsService, 'dispatchAppAction');
      
      component.goToChart('BTCUSDT', '1h');
      
      setTimeout(() => {
        expect(router.navigate).toHaveBeenCalledWith(['/chart', 'BTCUSDT', '1h']);
        done();
      }, 50);
    });

    it('should navigate with default timeframe', (done) => {
      const mockSymbols = [{ Id: 1, SymbolName: 'BTCUSDT' }];
      spyOn(chartService, 'getSymbols').and.returnValue(of(mockSymbols as any));
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      spyOn(settingsService, 'dispatchAppAction');
      
      component.goToChart('BTCUSDT', '');
      
      setTimeout(() => {
        expect(router.navigate).toHaveBeenCalledWith(['/chart', 'BTCUSDT', '1d']);
        done();
      }, 50);
    });

    it('should not navigate with empty symbol', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      
      component.goToChart('', '1h');
      
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should go back to previous page', () => {
      spyOn(location, 'back');
      
      component.back();
      
      expect(location.back).toHaveBeenCalled();
    });
  });

  describe('Info Panel', () => {
    it('should open coin info panel', () => {
      const event = new Event('click');
      spyOn(event, 'stopPropagation');
      
      component.onCoinInfoClick(event, 'BTCUSDT');
      
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.infoOpen).toBe(true);
      expect(component.infoSymbol).toBe('BTCUSDT');
    });

    it('should not open info panel with empty symbol', () => {
      const event = new Event('click');
      
      component.onCoinInfoClick(event, '');
      
      expect(component.infoOpen).toBe(false);
      expect(component.infoSymbol).toBe('');
    });

    it('should close coin info panel', () => {
      component.infoOpen = true;
      component.infoSymbol = 'BTCUSDT';
      
      component.closeInfo();
      
      expect(component.infoOpen).toBe(false);
      expect(component.infoSymbol).toBe('');
    });
  });

  describe('Matrix Cell Click', () => {
    it('should navigate on matrix cell click', (done) => {
      const mockSymbols = [{ Id: 1, SymbolName: 'BTCUSDT' }];
      spyOn(chartService, 'getSymbols').and.returnValue(of(mockSymbols as any));
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      spyOn(settingsService, 'dispatchAppAction');
      
      component.onMatrixCellClick({ symbol: 'BTCUSDT', timeframe: '4h' });
      
      setTimeout(() => {
        expect(router.navigate).toHaveBeenCalled();
        done();
      }, 50);
    });

    it('should not navigate with missing symbol', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      
      component.onMatrixCellClick({ symbol: '', timeframe: '1h' });
      
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should not navigate with missing timeframe', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      
      component.onMatrixCellClick({ symbol: 'BTCUSDT', timeframe: '' });
      
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });

  describe('Utility Methods', () => {
    it('should refresh user symbols', (done) => {
      const mockUserSymbols = [
        { Id: 1, SymbolId: 1, ExchangeId: 1, SymbolName: 'BTCUSDT' },
      ];
      spyOn(userSymbolsService, 'getUserSymbols').and.returnValue(of(mockUserSymbols as any));
      
      component.refresh();
      
      setTimeout(() => {
        expect(component.userSymbols).toEqual(mockUserSymbols);
        done();
      }, 50);
    });

    it('should handle user symbols load error', (done) => {
      spyOn(userSymbolsService, 'getUserSymbols').and.returnValue(throwError(() => new Error('Load error')));
      
      component['refreshUserSymbols']();
      
      setTimeout(() => {
        expect(component.loading).toBe(false);
        expect(component.errorMsg).toContain('Kon gebruikerssymbolen niet laden');
        done();
      }, 50);
    });

    it('should track by user symbol', () => {
      const userSymbol: any = { ExchangeId: 1, SymbolId: 2, Id: 3 };
      const trackId = component.trackByUserSymbol(0, userSymbol);
      expect(trackId).toBe('1|2|3');
    });

    it('should addWatchlist (deprecated)', () => {
      spyOn(console, 'log');
      component.addWatchlist();
      expect(console.log).toHaveBeenCalled();
    });
  });

  describe('Search Results Observable', () => {
    it('should merge search results correctly', (done) => {
      component['allSymbols$'].next([
        { Id: 1, SymbolName: 'BTCUSDT' } as any,
        { Id: 2, SymbolName: 'ETHUSDT' } as any,
      ]);
      component['userSymbols$'].next([
        { Id: 1, SymbolId: 1, ExchangeId: 1, SymbolName: 'BTCUSDT' } as any,
      ]);
      component['searchOpen$'].next(true);
      component.searchQuery = 'BTC';
      component.onSearchInput();
      
      component.mergedSearchResults$.subscribe(results => {
        if (results.length > 0) {
          expect(results[0].name).toBe('BTCUSDT');
          expect(results[0].isUserSymbol).toBe(true);
          done();
        }
      });
    });
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
