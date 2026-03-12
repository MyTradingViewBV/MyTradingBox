import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Location } from '@angular/common';
import { ChangeDetectorRef } from '@angular/core';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { UserSymbolsService } from 'src/app/modules/shared/services/http/user-symbols.service';
import { UserSymbol } from 'src/app/modules/shared/models/userSymbols/user-symbol.dto';
import { FooterComponent } from '../footer/footer-compenent';
import { WatchlistMatrixComponent } from './matrix/watchlist-matrix.component';
import { CoinInfoComponent } from '../coin-info/coin-info';

@Component({
  selector: 'app-watchlist',
  imports: [CommonModule, FooterComponent, WatchlistMatrixComponent, CoinInfoComponent],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistComponent implements OnInit {
  loading = false;
  errorMsg = '';

  userSymbols: (UserSymbol & { Icon?: string })[] = [];

  infoOpen = false;
  infoSymbol = '';

  private readonly _chartService = inject(ChartService);
  private readonly _userSymbolsService = inject(UserSymbolsService);
  private readonly router = inject(Router);
  private readonly _settingsService = inject(SettingsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly location = inject(Location);

  private static symbolsCache: SymbolModel[] | null = null;

  ngOnInit(): void {
    this.refreshUserSymbols();
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
    const symModel = symbols?.find((s) => s.SymbolName == symbol);
    if (symModel) {
      this._settingsService.dispatchAppAction(
        SettingsActions.setSelectedSymbol({ symbol: symModel }),
      );
    }
    const cleanedTimeframe = (timeframe || '').trim() || '1d';
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

  goToAddSymbol(): void {
    this.router.navigate(['/watchlist/add']);
  }

  refresh(): void {
    this.refreshUserSymbols();
  }

  back(): void {
    this.location.back();
  }

  private refreshUserSymbols(): void {
    this.loading = true;
    this.errorMsg = '';
    this._userSymbolsService.getUserSymbols().subscribe({
      next: (data) => {
        this.userSymbols = data ?? [];
        this.enrichWithIcons();
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

  private enrichWithIcons(): void {
    if (!this.userSymbols.length) return;
    this._chartService.getSymbols().subscribe({
      next: (symbols) => {
        WatchlistComponent.symbolsCache = symbols ?? [];
        const byId = new Map<number, SymbolModel>();
        for (const s of symbols ?? []) byId.set(s.Id, s);
        this.userSymbols = this.userSymbols.map((us) => {
          const found = byId.get(us.SymbolId);
          return {
            ...us,
            SymbolName: us.SymbolName || found?.SymbolName,
            Icon: found?.Icon ? `data:image/png;base64,${found.Icon}` : undefined,
          };
        });
        this.cdr.markForCheck();
      },
    });
  }

  deleteUserSymbol(userSymbolId: number): void {
    if (!userSymbolId) return;
    this._userSymbolsService.deleteUserSymbol(userSymbolId).subscribe({
      next: () => {
        this.userSymbols = this.userSymbols.filter(u => u.Id !== userSymbolId);
        this.cdr.markForCheck();
      },
      error: (err) => console.error('[Watchlist] delete user symbol error', err),
    });
  }

  onDeleteClick(ev: Event, userSymbolId: number): void {
    ev.stopPropagation();
    this.deleteUserSymbol(userSymbolId);
  }

  trackByUserSymbol(index: number, item: UserSymbol): string {
    return `${item.ExchangeId}|${item.SymbolId}|${item.Id}`;
  }

  onCoinInfoClick(ev: Event, symbol: string): void {
    ev.stopPropagation();
    const cleaned = (symbol || '').trim();
    if (!cleaned) return;
    this.infoSymbol = cleaned;
    this.infoOpen = true;
    this.cdr.markForCheck();
  }

  onMatrixCellClick(payload: { symbol: string; timeframe: string }): void {
    if (!payload?.symbol || !payload?.timeframe) return;
    this.goToChart(payload.symbol, payload.timeframe);
  }

  closeInfo(): void {
    this.infoOpen = false;
    this.infoSymbol = '';
    this.cdr.markForCheck();
  }
}
