import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { Location } from '@angular/common';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, forkJoin, of, catchError, take } from 'rxjs';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import {
  UserSymbolProfile,
  UserSymbolProfileBox,
  UserSymbolsService,
} from 'src/app/modules/shared/services/http/user-symbols.service';
import { UserSymbol } from 'src/app/modules/shared/models/userSymbols/user-symbol.dto';
import { FooterComponent } from '../footer/footer-compenent';
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
  capitalFlow1hSignal?: string;
  capitalFlow4hSignal?: string;
  capitalFlow1dSignal?: string;
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
  imports: [CommonModule, FooterComponent, CoinInfoComponent, WatchlistProgressbarComponent],
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
  private profileRefreshInterval?: ReturnType<typeof setInterval>;

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
    this.startProfileLiveRefresh();
  }

  ngOnDestroy(): void {
    this.tickerSub?.unsubscribe();
    if (this.tickerInterval) clearInterval(this.tickerInterval);
    if (this.profileRefreshInterval) clearInterval(this.profileRefreshInterval);
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
    this.loadUserSymbolsProfile(false);
  }

  private loadUserSymbolsProfile(silent: boolean): void {
    if (!silent) {
      this.loading = true;
      this.errorMsg = '';
    }

    const existingBySymbol = new Map(
      this.userSymbols.map((u) => [(u.SymbolName || '').toUpperCase(), u] as const),
    );

    this._userSymbolsService.getUserSymbolsProfile().subscribe({
      next: (data) => {
        const mapped = this.mapProfileToSymbols(data ?? []);
        this.userSymbols = mapped.map((m) => {
          const existing = existingBySymbol.get((m.SymbolName || '').toUpperCase());
          return {
            ...m,
            price: m.price ?? existing?.price,
            changePct: m.changePct ?? existing?.changePct,
          };
        });
        this.applyFixedSymbolRules();
        this.loadDetailedBoxesIfNeeded();
        this.startTickerStream();
        this.loadFallbackPricesForNonTickerSymbols();
        this.applyTickerData();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        if (!silent) {
          this.errorMsg = 'Kon gebruikerssymbolen niet laden.';
        }
        console.error('[Watchlist] user symbols load error', err);
        this.cdr.markForCheck();
      },
    });
  }

  private startProfileLiveRefresh(): void {
    if (this.profileRefreshInterval) return;

    // Keep non-price watchlist data fresh while the user keeps this view open.
    this.profileRefreshInterval = setInterval(() => {
      this.zone.run(() => {
        this.loadUserSymbolsProfile(true);
      });
    }, 30000);
  }

  private mapProfileToSymbols(data: UserSymbolProfile[]): WatchlistSymbol[] {
    return data.map((item, idx) => {
      const symbolName = (item?.Symbol || item?.Name || '').toUpperCase();
      const mappedId = item?.UserSymbolId ?? item?.Id ?? (idx + 1);
      const mappedSymbolId = item?.SymbolId ?? this.buildStableSymbolId(symbolName);
      const mappedExchangeId = item?.ExchangeId ?? 0;
      return {
        Id: mappedId,
        SymbolId: mappedSymbolId,
        ExchangeId: mappedExchangeId,
        SymbolName: symbolName,
        Icon: resolveIconUrl(symbolName, item?.Icon || undefined),
        isFixed: FIXED_SYMBOLS.includes(symbolName),
        candle1h: this.toCandleState(item?.CapitalFlow, '1h'),
        candle4h: this.toCandleState(item?.CapitalFlow, '4h'),
        candle1d: this.toCandleState(item?.CapitalFlow, '1d'),
        boxes: (item?.Boxes || []).map((box) => this.mapProfileBoxToBoxModel(symbolName, box)),
        capitalFlow1hSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '1h'),
        capitalFlow4hSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '4h'),
        capitalFlow1dSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '1d'),
      };
    });
  }

  private applyFixedSymbolRules(): void {
    const existingNames = new Set(this.userSymbols.map(u => (u.SymbolName || '').toUpperCase()));
    for (const name of FIXED_SYMBOLS) {
      const upper = name.toUpperCase();
      if (!existingNames.has(upper)) {
        this.userSymbols.unshift({
          Id: 0,
          SymbolId: this.buildStableSymbolId(upper),
          ExchangeId: 0,
          SymbolName: upper,
          Icon: resolveIconUrl(upper),
          isFixed: true,
          candle1h: 'N',
          candle4h: 'N',
          candle1d: 'N',
          boxes: [],
        });
      }
    }

    for (const us of this.userSymbols) {
      if (FIXED_SYMBOLS.includes((us.SymbolName || '').toUpperCase())) {
        us.isFixed = true;
      }
    }

    this.userSymbols.sort((a, b) => {
      const ai = FIXED_SYMBOLS.indexOf((a.SymbolName || '').toUpperCase());
      const bi = FIXED_SYMBOLS.indexOf((b.SymbolName || '').toUpperCase());
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return 0;
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

  private toCandleState(
    capitalFlow: UserSymbolProfile['CapitalFlow'] | undefined,
    timeframe: string,
  ): 'G' | 'R' | 'N' {
    const item = (capitalFlow || []).find(
      (cf) => (cf?.Timeframe || '').toLowerCase() === timeframe.toLowerCase(),
    );
    if (!item) return 'N';

    const barsAgo = typeof item.BarsAgo === 'number' ? item.BarsAgo : null;
    if (barsAgo != null && barsAgo > MAX_SIGNAL_BARS_AGO) {
      return 'N';
    }

    if (item.IsBullish) return 'G';
    if (item.IsBearish) return 'R';
    return 'N';
  }

  private mapProfileBoxToBoxModel(symbolName: string, box: UserSymbolProfileBox): BoxModel {
    const zoneMin = Number(
      box?.ZoneMin ?? (box as any)?.zone_min ?? box?.zoneMin ?? box?.MinZone ?? (box as any)?.min_zone ?? NaN,
    );
    const zoneMax = Number(
      box?.ZoneMax ?? (box as any)?.zone_max ?? box?.zoneMax ?? box?.MaxZone ?? (box as any)?.max_zone ?? NaN,
    );

    return {
      Id: box?.BoxId ?? 0,
      Symbol: symbolName,
      Timeframe: box?.Timeframe || '1d',
      ZoneMin: zoneMin,
      ZoneMax: zoneMax,
      Reason: 0,
      Strength: 0,
      PositionType: box?.PositionType || (box as any)?.positionType || box?.Direction || '',
      Type: box?.Type || box?.type || box?.Direction || '',
      Color: box?.Color || box?.color,
    };
  }

  private hasRenderableBoxes(boxes: BoxModel[] | undefined): boolean {
    if (!boxes || boxes.length === 0) return false;
    return boxes.some((b) => Number.isFinite(b.ZoneMin) && Number.isFinite(b.ZoneMax) && b.ZoneMax > b.ZoneMin);
  }

  private loadDetailedBoxesIfNeeded(): void {
    const targets = this.userSymbols.filter(
      (us) => !!us.SymbolName && !this.hasRenderableBoxes(us.boxes),
    );

    if (targets.length === 0) return;

    forkJoin(
      targets.map((us) =>
        this.boxesService.getBoxes(us.SymbolName!, 'boxes').pipe(
          take(1),
          catchError((err) => {
            console.error(`[Watchlist] Error loading fallback boxes for ${us.SymbolName}:`, err);
            return of([] as BoxModel[]);
          }),
        ),
      ),
    ).subscribe((results) => {
      for (let i = 0; i < targets.length; i++) {
        const resolved = (results[i] ?? []).map((b: any) => ({
          ...b,
          ZoneMin: Number(b?.ZoneMin ?? b?.zone_min ?? b?.zoneMin ?? b?.MinZone ?? b?.min_zone ?? NaN),
          ZoneMax: Number(b?.ZoneMax ?? b?.zone_max ?? b?.zoneMax ?? b?.MaxZone ?? b?.max_zone ?? NaN),
          PositionType: b?.PositionType ?? b?.positionType ?? b?.Type ?? b?.type ?? '',
          Type: b?.Type ?? b?.type ?? b?.PositionType ?? b?.positionType ?? '',
        })) as BoxModel[];
        if (resolved.length > 0) {
          targets[i].boxes = resolved;
        }
      }
      this.cdr.markForCheck();
    });
  }



  private buildStableSymbolId(symbol: string): number {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = (hash * 31 + symbol.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) || 1;
  }

  private startTickerStream(): void {
    if (this.tickerSub) return; // already running
    this.tickerSub = this.tickerService.connect().subscribe(() => {
      this.zone.run(() => {
        this.applyTickerData();
        this.cdr.markForCheck();
      });
    });
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
    return `${item.ExchangeId}|${item.SymbolId}|${item.Id}|${item.SymbolName || index}`;
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

  private signalTypeForTimeframe(
    capitalFlow: UserSymbolProfile['CapitalFlow'] | undefined,
    timeframe: string,
  ): string | undefined {
    const item = (capitalFlow || []).find(
      (cf) =>
        (cf?.Timeframe || '').toLowerCase() === timeframe.toLowerCase() &&
        (cf.IsBullish || cf.IsBearish) &&
        !!cf.SignalType,
    );
    if (!item) return undefined;
    const barsAgo = typeof item.BarsAgo === 'number' ? item.BarsAgo : null;
    if (barsAgo != null && barsAgo > MAX_SIGNAL_BARS_AGO) return undefined;
    return item.SignalType || undefined;
  }

  closeInfo(): void {
    this.infoOpen = false;
    this.infoSymbol = '';
    this.cdr.markForCheck();
  }
}
