import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { Location } from '@angular/common';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, forkJoin, of, catchError } from 'rxjs';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { UserSymbolsService } from 'src/app/modules/shared/services/http/user-symbols.service';
import { UserSymbol } from 'src/app/modules/shared/models/userSymbols/user-symbol.dto';
import { FooterComponent } from '../footer/footer-compenent';
import { WatchlistMatrixComponent } from './matrix/watchlist-matrix.component';
import { CoinInfoComponent } from '../coin-info/coin-info';
import { BinanceTickerService } from './services/binance-ticker.service';
import { ChartBoxesService } from '../chart/services/chart-boxes.service';
import { BoxModel } from 'src/app/modules/shared/models/chart/boxModel.dto';
import { WatchlistProgressbarComponent } from './progressbar/watchlist-progressbar.component';

interface WatchlistSymbol extends UserSymbol {
  Icon?: string;
  price?: number;
  changePct?: number;
  isFixed?: boolean;
  candle1h?: 'G' | 'R' | 'N';
  candle4h?: 'G' | 'R' | 'N';
  candle1d?: 'G' | 'R' | 'N';
  boxes?: BoxModel[];
}

const FIXED_SYMBOLS = ['BTCUSDT', 'DOMINANCE', 'ALTCOINDOMINANCE', 'USDTDOMINANCE'];
const MAX_SIGNAL_BARS_AGO = 5;

function resolveIconUrl(symbolName: string, apiBase64?: string): string | undefined {
  if (apiBase64) {
    const s = apiBase64.trim();
    return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
  }
  const name = (symbolName || '').toUpperCase();
  if (name.includes('DOMINANCE')) return undefined;
  const quotes = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB', 'EUR'];
  let base = name;
  for (const q of quotes) {
    if (name.length > q.length && name.endsWith(q)) {
      base = name.slice(0, -q.length);
      break;
    }
  }
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base.toLowerCase()}.png`;
}

@Component({
  selector: 'app-watchlist',
  imports: [CommonModule, FooterComponent, WatchlistMatrixComponent, CoinInfoComponent, WatchlistProgressbarComponent],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistComponent implements OnInit, OnDestroy {
  loading = false;
  errorMsg = '';

  userSymbols: WatchlistSymbol[] = [];
  sortByChangePct: 'none' | 'desc' | 'asc' = 'none';

  get sortedUserSymbols(): WatchlistSymbol[] {
    if (this.sortByChangePct === 'none') return this.userSymbols;
    const fixed = this.userSymbols.filter(u => u.isFixed);
    const rest = this.userSymbols.filter(u => !u.isFixed).slice().sort((a, b) => {
      const av = a.changePct ?? -Infinity;
      const bv = b.changePct ?? -Infinity;
      return this.sortByChangePct === 'desc' ? bv - av : av - bv;
    });
    return [...fixed, ...rest];
  }

  toggleSortByChangePct(): void {
    if (this.sortByChangePct === 'none') this.sortByChangePct = 'desc';
    else if (this.sortByChangePct === 'desc') this.sortByChangePct = 'asc';
    else this.sortByChangePct = 'none';
    this.cdr.markForCheck();
  }

  infoOpen = false;
  infoSymbol = '';

  private tickerSub?: Subscription;
  private tickerInterval?: ReturnType<typeof setInterval>;

  private readonly _chartService = inject(ChartService);
  private readonly _userSymbolsService = inject(UserSymbolsService);
  private readonly tickerService = inject(BinanceTickerService);
  private readonly boxesService = inject(ChartBoxesService);
  private readonly router = inject(Router);
  private readonly _settingsService = inject(SettingsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly location = inject(Location);
  private readonly zone = inject(NgZone);

  private static symbolsCache: SymbolModel[] | null = null;

  ngOnInit(): void {
    this.refreshUserSymbols();
  }

  ngOnDestroy(): void {
    this.tickerSub?.unsubscribe();
    if (this.tickerInterval) clearInterval(this.tickerInterval);
    this.tickerService.disconnect();
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
    this._chartService.getAllSymbols().subscribe({
      next: (symbols) => {
        WatchlistComponent.symbolsCache = symbols ?? [];
        const byId = new Map<number, SymbolModel>();
        const byName = new Map<string, SymbolModel>();
        for (const s of symbols ?? []) {
          byId.set(s.Id, s);
          byName.set((s.SymbolName || '').toUpperCase(), s);
        }

        // Enrich user symbols with icon & name
        this.userSymbols = this.userSymbols.map((us) => {
          const found = byId.get(us.SymbolId)
            || byName.get((us.SymbolName || '').toUpperCase());
          return {
            ...us,
            SymbolName: us.SymbolName || found?.SymbolName,
            Icon: resolveIconUrl(us.SymbolName || found?.SymbolName || '', found?.Icon),
          };
        });

        // Add fixed symbols that are not yet in the user list
        const existingNames = new Set(this.userSymbols.map(u => (u.SymbolName || '').toUpperCase()));
        for (const name of FIXED_SYMBOLS) {
          if (!existingNames.has(name.toUpperCase())) {
            const sym = byName.get(name.toUpperCase());
            this.userSymbols.unshift({
              Id: 0,
              SymbolId: sym?.Id ?? 0,
              ExchangeId: 0,
              SymbolName: name,
              Icon: resolveIconUrl(name, sym?.Icon),
              isFixed: true,
            });
          }
        }
        // Mark existing fixed symbols as non-deletable
        for (const us of this.userSymbols) {
          if (FIXED_SYMBOLS.includes(us.SymbolName || '')) {
            us.isFixed = true;
          }
        }

        // Always keep fixed symbols at the top in defined order
        this.userSymbols.sort((a, b) => {
          const ai = FIXED_SYMBOLS.indexOf(a.SymbolName || '');
          const bi = FIXED_SYMBOLS.indexOf(b.SymbolName || '');
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1;
          if (bi !== -1) return 1;
          return 0;
        });

        this.cdr.markForCheck();
        this.startTickerStream();
        this.loadFallbackPricesForNonTickerSymbols();
        this.loadCandleDirections();
      },
    });
  }

  private loadFallbackPricesForNonTickerSymbols(): void {
    const targets = this.userSymbols.filter(
      (us) => us.SymbolName && this.requiresFallbackPrice(us.SymbolName) && us.price == null,
    );

    if (targets.length === 0) return;

    forkJoin(
      targets.map((us) =>
        this._chartService.getCandles(us.SymbolName!, '1d', 1).pipe(
          catchError((err) => {
            console.error(`[Watchlist] fallback price load error for ${us.SymbolName}:`, err);
            return of([]);
          }),
        ),
      ),
    ).subscribe((results) => {
      for (let i = 0; i < targets.length; i++) {
        const lastCandle = results[i]?.[results[i].length - 1];
        if (lastCandle?.Close != null) {
          targets[i].price = lastCandle.Close;
        }
      }
      this.cdr.markForCheck();
    });
  }

  private requiresFallbackPrice(symbol: string): boolean {
    return (symbol || '').toUpperCase().includes('DOMINANCE');
  }

  private loadCandleDirections(): void {
    this._chartService.getWatchlist().subscribe({
      next: (items) => {
        const tfKeyMap: Record<string, 'candle1h' | 'candle4h' | 'candle1d'> = {
          '1h': 'candle1h', '4h': 'candle4h', '1d': 'candle1d',
        };
        // Build lookup: SYMBOL+TF -> direction
        const dirMap = new Map<string, 'G' | 'R'>();
        for (const it of items ?? []) {
          const sym = (it.Symbol || '').toUpperCase();
          const tf = (it.Timeframe || '').toLowerCase();
          const dir = (it.Direction || '').toUpperCase();
          const barsAgoRaw = it?.BarsAgo ?? (it as any)?.barsAgo;
          const barsAgo = typeof barsAgoRaw === 'number' ? barsAgoRaw : null;
          const key = `${sym}|${tf}`;
          if (barsAgo != null && barsAgo > MAX_SIGNAL_BARS_AGO) {
            continue;
          }
          if (dir === 'BULL' || dir === 'BULLISH' || dir === 'LONG') {
            dirMap.set(key, 'G');
          } else if (dir === 'BEAR' || dir === 'BEARISH' || dir === 'SHORT') {
            dirMap.set(key, 'R');
          }
        }
        for (const us of this.userSymbols) {
          const sym = (us.SymbolName || '').toUpperCase();
          for (const [tf, prop] of Object.entries(tfKeyMap) as Array<[string, 'candle1h' | 'candle4h' | 'candle1d']>) {
            us[prop] = dirMap.get(`${sym}|${tf}`) ?? 'N';
          }
        }
        this.cdr.markForCheck();
        this.loadBoxesForSymbols();
      },
      error: () => {},
    });
  }

  private loadBoxesForSymbols(): void {
    // Load boxes for all symbols in parallel
    const boxRequests = this.userSymbols
      .filter(us => us.SymbolName) // Only load for symbols with a name
      .map((us) => ({
        symbol: us.SymbolName!,
        request: this.boxesService.getBoxes(us.SymbolName!, 'boxes').pipe(
          catchError((err) => {
            console.error(`[Watchlist] Error loading boxes for ${us.SymbolName}:`, err);
            return of([]);
          })
        ),
      }));

    if (boxRequests.length === 0) return;

    // Subscribe to all box requests and update when each completes
    let completed = 0;
    for (const req of boxRequests) {
      req.request.subscribe({
        next: (boxes) => {
          const us = this.userSymbols.find(u => u.SymbolName === req.symbol);
          if (us) {
            us.boxes = boxes;
          }
          completed++;
          if (completed === boxRequests.length) {
            this.cdr.markForCheck();
          }
        },
        error: () => {
          completed++;
          if (completed === boxRequests.length) {
            this.cdr.markForCheck();
          }
        },
      });
    }
  }

  private startTickerStream(): void {
    if (this.tickerSub) return; // already running
    this.tickerSub = this.tickerService.connect().subscribe();
    this.tickerInterval = setInterval(() => {
      this.zone.run(() => {
        this.applyTickerData();
        this.cdr.markForCheck();
      });
    }, 2000);
  }

  private applyTickerData(): void {
    const map = this.tickerService.getLatest();
    if (!map.size) return;
    for (const us of this.userSymbols) {
      const t = map.get(us.SymbolName || '');
      if (t) {
        us.price = t.close;
        us.changePct = t.changePct;
      }
    }
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

  clearIcon(us: WatchlistSymbol): void {
    us.Icon = undefined;
    this.cdr.markForCheck();
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
