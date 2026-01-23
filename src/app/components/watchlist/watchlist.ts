import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Location } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { UserSymbolsService } from 'src/app/modules/shared/services/http/user-symbols.service';
import { UserSymbol } from 'src/app/modules/shared/models/userSymbols/user-symbol.dto';
import { FooterComponent } from '../footer/footer-compenent';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { BehaviorSubject, Subject, combineLatest, Observable } from 'rxjs';
import { debounceTime, map } from 'rxjs/operators';

@Component({
  selector: 'app-watchlist',
  imports: [CommonModule, FormsModule, FooterComponent, ScrollingModule],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistComponent implements OnInit {
  // Loading / error state
  loading = false;
  errorMsg = '';

  // Search state: keep AllSymbols separate from UserSymbols
  searchQuery = '';
  private searchTerm$ = new BehaviorSubject<string>('');
  private searchOpen$ = new BehaviorSubject<boolean>(false);
  private allSymbolsLoaded = false;
  private allSymbols$ = new BehaviorSubject<SymbolModel[]>([]);
  filteredSymbols$: Observable<SymbolModel[]> = combineLatest([
    this.allSymbols$.asObservable(),
    this.searchTerm$.pipe(debounceTime(300)),
    this.searchOpen$,
  ]).pipe(
    map(([all, term, open]) => {
      if (!open) return [];
      const q = (term || '').trim().toLowerCase();
      const base = all || [];
      const res = q
        ? base.filter((s) => (s.SymbolName || '').toLowerCase().includes(q))
        : base;
      return res.slice(0, 200);
    })
  );

  // User symbols list from backend
  userSymbols: UserSymbol[] = [];

  constructor(
    private _chartService: ChartService,
    private _userSymbolsService: UserSymbolsService,
    private router: Router,
    private _settingsService: SettingsService,
    private cdr: ChangeDetectorRef,
    private location: Location,
  ) {}

  ngOnInit(): void {
    // No AllSymbols load yet – lazy load on first search focus

    // Load current user symbols list
    this.refreshUserSymbols();

    // Matrix events removed since matrix UI was dropped from this view
  }

  goToChart(symbol: string, timeframe: string): void {
    if (!symbol) return;

    if (!WatchlistComponent.symbolsCache) {
      this._chartService.getSymbols().subscribe((symbols) => {
        WatchlistComponent.symbolsCache = symbols ?? [];
        this.navigateToChartWithSymbol(symbol, timeframe);
      });
    } else {
      this.navigateToChartWithSymbol(symbol, timeframe);
    }
  }

  private navigateToChartWithSymbol(symbol: string, timeframe: string): void {
    const symbols = WatchlistComponent.symbolsCache as SymbolModel[];
    const symModel = symbols?.find((s) => s.SymbolName == symbol) as SymbolModel;
    if (symModel) {
      this._settingsService.dispatchAppAction(
        SettingsActions.setSelectedSymbol({ symbol: symModel }),
      );
    }
    const cleanedTimeframe = (timeframe || '').trim() || '1d';
    // Persist timeframe selection to settings/localStorage
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedTimeframe({ timeframe: cleanedTimeframe })
    );
    const cleanedSymbol = symbol.trim();
    if (cleanedSymbol && cleanedTimeframe) {
      this.router.navigate(['/chart', cleanedSymbol, cleanedTimeframe]);
    } else if (cleanedSymbol) {
      this.router.navigate(['/chart', cleanedSymbol]);
    } else {
      this.router.navigate(['/chart']);
    }
  }

  private static symbolsCache: SymbolModel[] | null = null;

  refresh(): void {
    this.refreshUserSymbols();
  }

  back(): void { this.location.back(); }

  private refreshUserSymbols(): void {
    this.loading = true;
    this.errorMsg = '';
    this._userSymbolsService.getUserSymbols().subscribe({
      next: (data) => {
        this.userSymbols = data ?? [];
        this.computeUserSymbolNames();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = 'Kon gebruikerssymbolen niet laden.';
        console.error('[Watchlist] user symbols load error', err);
        this.cdr.markForCheck();
      },
    });
  }

  private computeUserSymbolNames(): void {
    const all = this.allSymbols$.getValue();
    if (!this.userSymbols?.length || !all?.length) return;
    const byId = new Map<number, SymbolModel>();
    for (const s of all) {
      byId.set(s.Id, s);
    }
    this.userSymbols = this.userSymbols.map((us) => {
      if (!us.SymbolName) {
        const found = byId.get(us.SymbolId);
        if (found?.SymbolName) {
          return { ...us, SymbolName: found.SymbolName };
        }
      }
      return us;
    });
  }

  onSearchInput(): void {
    this.searchTerm$.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchTerm$.next('');
    this.searchOpen$.next(false);
  }

  onSearchFocus(): void {
    this.searchOpen$.next(true);
    if (!this.allSymbolsLoaded) {
      // lazy-load all symbols once
      this._chartService.getSymbols().subscribe({
        next: (symbols) => {
          this.allSymbolsLoaded = true;
          this.allSymbols$.next(symbols ?? []);
          this.computeUserSymbolNames();
          this.cdr.markForCheck();
        },
        error: (err) => console.error('[Watchlist] symbols load error', err),
      });
    }
  }

  onSearchBlur(): void {
    // keep results while input is active; optional: close on blur
    // this.searchOpen = false;
    // this.applySearch();
  }

  addSymbolToProfile(symbol: SymbolModel): void {
    if (!symbol?.Id) return;
    // Prevent duplicates
    if (this.userSymbols.some((u) => u.SymbolId === symbol.Id)) {
      this.clearSearch();
      return;
    }
    this._userSymbolsService.addUserSymbol(symbol.Id).subscribe({
      next: (created) => {
        // Append locally to avoid a full reload
        const appended: UserSymbol = {
          Id: created?.Id ?? 0,
          SymbolId: symbol.Id,
          ExchangeId: created?.ExchangeId ?? 0,
          SymbolName: symbol.SymbolName,
        };
        this.userSymbols = [...this.userSymbols, appended];
        this.clearSearch();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('[Watchlist] add user symbol error', err);
      },
    });
  }

  addWatchlist(): void {
    // No-op in new flow; Watchlist is driven by user symbols from backend
    console.log('[Watchlist] addWatchlist (deprecated)');
  }

  // Favorites removed in new architecture

  // Direction helpers not needed for user symbols list

  trackByUserSymbol(index: number, item: UserSymbol): string {
    return `${item.ExchangeId}|${item.SymbolId}|${item.Id}`;
  }

  trackBySearchSymbol(index: number, item: SymbolModel): string {
    return `${item.Id}|${item.SymbolName}`;
  }

  onCoinInfoClick(ev: Event, symbol: string): void {
    ev.stopPropagation();
    const cleaned = (symbol || '').trim();
    if (cleaned) {
      this.router.navigate(['/coin', cleaned]);
    }
  }

  // Matrix cell click handler
  onMatrixCellClick(payload: { symbol: string; timeframe: string }): void {
    if (!payload?.symbol || !payload?.timeframe) return;
    this.goToChart(payload.symbol, payload.timeframe);
  }
}
