import { Component, OnInit } from '@angular/core';
import { WatchlistDTO } from '../../modules/shared/models/watchlist/watchlist.dto';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { FooterComponent } from '../footer/footer-compenent';

@Component({
  selector: 'app-watchlist',
  imports: [CommonModule, FormsModule, FooterComponent],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class WatchlistComponent implements OnInit {
  watchlist: WatchlistDTO[] = [];
  // Monitoring filter state
  selectedMonitoringFilter = 'ACTIVEMONITORING';
  btcDivItemsFiltered: WatchlistDTO[] = [];
  otherItemsFiltered: WatchlistDTO[] = [];
  // Enhanced UI state
  searchQuery = '';
  favoriteMap: Record<string, boolean> = {}; // key: Symbol|Timeframe
  favoriteItems: WatchlistDTO[] = [];
  btcDivDisplay: WatchlistDTO[] = [];
  otherDisplay: WatchlistDTO[] = [];

  constructor(
    private _chartService: ChartService,
    private router: Router,
    private _settingsService: SettingsService,
  ) {}

  get btcDivItems(): WatchlistDTO[] {
    return this.watchlist?.filter((i) => i.Status === 'BTC-DIV') ?? [];
  }

  get otherItems(): WatchlistDTO[] {
    return this.watchlist?.filter((i) => i.Status !== 'BTC-DIV') ?? [];
  }

  applyMonitoringFilter(): void {
    this.computeFiltered();
  }

  ngOnInit(): void {
    this._chartService.getWatchlist().subscribe((data) => {
      this.watchlist = data;
      console.log('watchlist fetched:', this.watchlist);
      this.computeFiltered();
    });
  }

  goToChart(symbol: string, timeframe: string): void {
    if (!symbol) return;

    this._chartService.getSymbols().subscribe((symbols) => {
      if (symbols) {
        const symModel = symbols.find((s) => s.SymbolName == symbol) as SymbolModel;
        this._settingsService.dispatchAppAction(
          SettingsActions.setSelectedSymbol({ symbol: symModel }),
        );
        // Determine navigation target based on available params.
        // Routes defined: /chart, /chart/:symbol, /chart/:symbol/:timeframe
        const cleanedTimeframe = (timeframe || '').trim();
        const cleanedSymbol = symbol.trim();
        if (cleanedSymbol && cleanedTimeframe) {
          this.router.navigate(['/chart', cleanedSymbol, cleanedTimeframe]);
        } else if (cleanedSymbol) {
          this.router.navigate(['/chart', cleanedSymbol]);
        } else {
          this.router.navigate(['/chart']);
        }
      }
    });
  }

  refresh(): void {
    this._chartService.getWatchlist().subscribe((data) => {
      this.watchlist = data;
      console.log('watchlist refreshed:', this.watchlist);
      // Replaced snackbar with console log after removing Angular Material
      console.log('watchlist refreshed');
      this.computeFiltered();
    });
  }

  back(): void {
    window.history.back();
  }

  private computeFiltered(): void {
    const filter = this.selectedMonitoringFilter;
    // BTC-DIV should always be visible (unfiltered)
    const sourceBtc = this.btcDivItems;
    let sourceOther = this.otherItems;

    if (filter === 'ACTIVEMONITORING') {
      sourceOther = sourceOther.filter(
        (i) => (i.MonitoringStatus || '').toUpperCase() === 'ACTIVEMONITORING',
      );
    } else if (filter === 'NO MONITORING') {
      // Treat blank or explicit "NO MONITORING" as no monitoring
      sourceOther = sourceOther.filter(
        (i) =>
          !i.MonitoringStatus ||
          i.MonitoringStatus.toUpperCase() === 'NO MONITORING',
      );
    }
    this.btcDivItemsFiltered = sourceBtc;
    this.otherItemsFiltered = sourceOther;
    this.applySearchAndFavorites();
  }

  applySearch(): void {
    this.applySearchAndFavorites();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.applySearchAndFavorites();
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
    const other = this.otherItemsFiltered.filter(filterFn);

    const favKey = (i: WatchlistDTO) => `${i.Symbol}|${i.Timeframe}`;
    this.favoriteItems = [...btc, ...other].filter((i) => this.favoriteMap[favKey(i)]);
    this.btcDivDisplay = btc.filter((i) => !this.favoriteMap[favKey(i)]);
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
}
