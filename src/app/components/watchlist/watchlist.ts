import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Location } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { WatchlistDTO } from '../../modules/shared/models/watchlist/watchlist.dto';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { FooterComponent } from '../footer/footer-compenent';
import { WatchlistMatrixComponent } from './matrix/watchlist-matrix.component';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

@Component({
  selector: 'app-watchlist',
  imports: [CommonModule, FormsModule, FooterComponent, ScrollingModule, WatchlistMatrixComponent],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistComponent implements OnInit {
  watchlist: WatchlistDTO[] = [];
  loading = false;
  errorMsg = '';
  // Monitoring filter state
  selectedMonitoringFilter = 'ACTIVEMONITORING';
  private monitoringFilterChanges = new Subject<string>();
  btcDivItemsFiltered: WatchlistDTO[] = [];
  dominanceItemsFiltered: WatchlistDTO[] = [];
  otherItemsFiltered: WatchlistDTO[] = [];
  // Enhanced UI state
  searchQuery = '';
  private searchChanges = new Subject<string>();
  favoriteMap: Record<string, boolean> = {}; // key: Symbol|Timeframe
  favoriteItems: WatchlistDTO[] = [];
  btcDivDisplay: WatchlistDTO[] = [];
  dominanceDisplay: WatchlistDTO[] = [];
  otherDisplay: WatchlistDTO[] = [];

  constructor(
    private _chartService: ChartService,
    private router: Router,
    private _settingsService: SettingsService,
    private cdr: ChangeDetectorRef,
    private location: Location,
  ) {}

  get btcDivItems(): WatchlistDTO[] {
    return this.watchlist?.filter((i) => i.Status === 'BTC-DIV') ?? [];
  }

  get dominanceItems(): WatchlistDTO[] {
    return this.watchlist?.filter((i) => i.Status === 'DOMINANCE-DIV') ?? [];
  }

  get otherItems(): WatchlistDTO[] {
    return this.watchlist?.filter((i) => i.Status !== 'BTC-DIV' && i.Status !== 'DOMINANCE-DIV') ?? [];
  }

  applyMonitoringFilter(): void {
    this.monitoringFilterChanges.next(this.selectedMonitoringFilter);
  }

  ngOnInit(): void {
    // Debounce monitoring filter & search to reduce recalculations
    this.monitoringFilterChanges.pipe(debounceTime(150)).subscribe(() => {
      this.computeFiltered();
      this.cdr.markForCheck();
    });
    this.searchChanges.pipe(debounceTime(150)).subscribe((q) => {
      this.searchQuery = q;
      this.applySearchAndFavorites();
      this.cdr.markForCheck();
    });

    this.loading = true;
    this.errorMsg = '';
    this._chartService.getWatchlist().subscribe({
      next: (data) => {
        this.watchlist = data ?? [];
        this.computeFiltered();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = 'Kon watchlist niet laden. Probeer het later opnieuw.';
        console.error('[Watchlist] load error', err);
        this.cdr.markForCheck();
      },
    });

    // Listen to matrix tap events to open charts
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ indicator: 'BTC' | 'BTC.D' | 'ALT.D' | 'USDT.D'; timeframe: string }>;
      if (!ce?.detail) return;
      const { indicator, timeframe } = ce.detail;
      // Map indicator to chart symbol naming used in app
      const symbolMap: Record<string, string> = {
        'BTC': 'BTCUSDT',
        'BTC.D': 'BTC.D',
        'ALT.D': 'ALT.D',
        'USDT.D': 'USDT.D',
      };
      const tf = timeframe.toLowerCase();
      const sym = symbolMap[indicator] || indicator;
      this.goToChart(sym, tf);
    };
    window.addEventListener('watchlist-matrix-tap', handler as EventListener);
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
    this.loading = true;
    this.errorMsg = '';
    this._chartService.getWatchlist().subscribe({
      next: (data) => {
        this.watchlist = data ?? [];
        this.computeFiltered();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = 'Kon watchlist niet verversen. Probeer opnieuw.';
        console.error('[Watchlist] refresh error', err);
        this.cdr.markForCheck();
      },
    });
  }

  back(): void { this.location.back(); }

  private computeFiltered(): void {
    const filter = (this.selectedMonitoringFilter || '').trim();
    const sourceBtc = this.btcDivItems; // BTC-DIV is not filtered by monitoring
    const sourceDom = this.dominanceItems; // DOMINANCE-DIV is not filtered by monitoring
    let sourceOther = this.otherItems;

    // Normalize filter and item status by stripping spaces and uppercasing
    const norm = (s: string) => (s || '').replace(/\s+/g, '').toUpperCase();
    if (norm(filter) === 'ALL') {
      // No filtering
    } else if (norm(filter) === 'ACTIVEMONITORING') {
      sourceOther = sourceOther.filter(
        (i) => norm(i.MonitoringStatus || '') === 'ACTIVEMONITORING',
      );
    } else if (norm(filter) === 'NOMONITORING') {
      // Treat blank or explicit "NO MONITORING" as no monitoring
      sourceOther = sourceOther.filter(
        (i) =>
          !i.MonitoringStatus ||
          norm(i.MonitoringStatus || '') === 'NOMONITORING',
      );
    }
    this.btcDivItemsFiltered = sourceBtc;
    this.dominanceItemsFiltered = sourceDom;
    this.otherItemsFiltered = sourceOther;
    this.applySearchAndFavorites();
  }

  applySearch(): void {
    this.searchChanges.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchChanges.next(this.searchQuery);
  }

  private applySearchAndFavorites(): void {
    const q = this.searchQuery.trim().toLowerCase();

    const filterFn = (item: WatchlistDTO) => {
      if (!q) return true;
      return (
        item.Symbol.toLowerCase().includes(q) ||
        item.Timeframe.toLowerCase().includes(q) ||
        item.Direction.toLowerCase().includes(q) ||
        item.Status.toLowerCase().includes(q) ||
        (item.MonitoringStatus || '').toLowerCase().includes(q)
      );
    };

    const btc = this.btcDivItemsFiltered.filter(filterFn);
    const dom = this.dominanceItemsFiltered.filter(filterFn);
    const other = this.otherItemsFiltered.filter(filterFn);

    const favKey = (i: WatchlistDTO) => `${i.Symbol}|${i.Timeframe}`;
    this.favoriteItems = [...btc, ...dom, ...other].filter((i) => this.favoriteMap[favKey(i)]);
    this.btcDivDisplay = btc.filter((i) => !this.favoriteMap[favKey(i)]);
    this.dominanceDisplay = dom.filter((i) => !this.favoriteMap[favKey(i)]);
    this.otherDisplay = other.filter((i) => !this.favoriteMap[favKey(i)]);
  }

  addWatchlist(): void {
    // Placeholder: open creation flow or navigate; currently just log.
    console.log('[Watchlist] addWatchlist triggered');
  }

  toggleFavorite(item: WatchlistDTO, ev: Event): void {
    ev.stopPropagation();
    const key = `${item.Symbol}|${item.Timeframe}`;
    this.favoriteMap[key] = !this.favoriteMap[key];
    this.applySearchAndFavorites();
    this.cdr.markForCheck();
  }

  isFavorite(item: WatchlistDTO): boolean {
    const key = `${item.Symbol}|${item.Timeframe}`;
    return !!this.favoriteMap[key];
  }

  directionClass(dir: string): string {
    const d = (dir || '').toLowerCase();
    if (['bull', 'long'].includes(d)) return 'dir-bull';
    if (['bear', 'short'].includes(d)) return 'dir-bear';
    return 'dir-neutral';
  }

  arrowFor(dir: string): string {
    const d = (dir || '').toLowerCase();
    if (['bull', 'long'].includes(d)) return '▲';
    if (['bear', 'short'].includes(d)) return '▼';
    return '◆';
  }

  trackByItem(index: number, item: WatchlistDTO): string {
    return `${item.Symbol}|${item.Timeframe}|${item.Status}|${item.Direction}|${item.CreatedAt}`;
  }

  onCoinInfoClick(ev: Event, symbol: string): void {
    ev.stopPropagation();
    const cleaned = (symbol || '').trim();
    if (cleaned) {
      this.router.navigate(['/coin', cleaned]);
    }
  }
}
