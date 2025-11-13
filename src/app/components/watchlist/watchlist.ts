import { Component, OnInit } from '@angular/core';
import { WatchlistDTO } from '../../modules/shared/models/watchlist/watchlist.dto';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';

@Component({
  selector: 'app-watchlist',
  imports: [CommonModule, FormsModule],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class WatchlistComponent implements OnInit {
  watchlist: WatchlistDTO[] = [];
  // Monitoring filter state
  selectedMonitoringFilter = 'ACTIVEMONITORING';
  btcDivItemsFiltered: WatchlistDTO[] = [];
  otherItemsFiltered: WatchlistDTO[] = [];

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
  }
}
