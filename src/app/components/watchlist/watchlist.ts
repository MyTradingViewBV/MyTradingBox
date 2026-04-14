import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { ChangeDetectorRef, NgZone } from '@angular/core';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription, forkJoin, of, catchError, take, switchMap, map } from 'rxjs';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { UserNotificationSettings, UserNotificationSettingsService } from 'src/app/modules/shared/services/http/user-notification-settings.service';
import {
  UserSymbolProfile,
  UserSymbolProfileBox,
  UserSymbolsService,
} from 'src/app/modules/shared/services/http/user-symbols.service';
import { UserSymbol } from 'src/app/modules/shared/models/userSymbols/user-symbol.dto';
import { FooterComponent } from '../footer/footer-compenent';
import { CoinInfoComponent } from '../coin-info/coin-info';
import { ExchangeTickerFactoryService } from './services/exchange-ticker-factory.service';
import { ChartBoxesService } from '../chart/services/chart-boxes.service';
import { BoxModel } from 'src/app/modules/shared/models/chart/boxModel.dto';
import { WatchlistProgressbarComponent } from './progressbar/watchlist-progressbar.component';
import { TranslateModule } from '@ngx-translate/core';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { RefreshButtonComponent } from '../shared/refresh-button/refresh-button.component';
import { CloseButtonComponent } from '../shared/close-button/close-button.component';

interface WatchlistSymbol extends UserSymbol {
  Icon?: string;
  price?: number;
  changePct?: number;
  exchangeName?: string;
  candle1h?: 'G' | 'R' | 'N';
  candle4h?: 'G' | 'R' | 'N';
  candle1d?: 'G' | 'R' | 'N';
  boxes?: BoxModel[];
  capitalFlow12mTier?: string;
  capitalFlow1hSignal?: string;
  capitalFlow4hSignal?: string;
  capitalFlow1dSignal?: string;
  capitalFlow1wSignal?: string;
  capitalFlow1mSignal?: string;
  capitalFlow12mSignal?: string;
  capitalFlow24mSignal?: string;
  notificationsEnabled?: boolean;
}

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
  imports: [CommonModule, FooterComponent, CoinInfoComponent, WatchlistProgressbarComponent, TranslateModule, BackButtonComponent, RefreshButtonComponent, CloseButtonComponent],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistComponent implements OnInit, OnDestroy {
  loading = false;
  errorMsg = '';

  userSymbols: WatchlistSymbol[] = [];
  sortByChangePct: 'none' | 'desc' | 'asc' = 'none';

  // Swipe-to-delete state
  swipingId: number | null = null;
  swipeOffset = 0;
  private swipeStartX = 0;
  private swipeStartY = 0;
  swiping = false;
  private swipeThreshold = 70;
  private swipeDeleteThreshold = 140;

  get sortedUserSymbols(): WatchlistSymbol[] {
    if (this.sortByChangePct === 'none') return this.userSymbols;
    return this.userSymbols.slice().sort((a, b) => {
      const av = a.changePct ?? -Infinity;
      const bv = b.changePct ?? -Infinity;
      return this.sortByChangePct === 'desc' ? bv - av : av - bv;
    });
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
  private profileSub?: Subscription;
  private profileRefreshInterval?: ReturnType<typeof setInterval>;
  private notificationSettingsByKey = new Map<string, UserNotificationSettings>();

  private readonly _chartService = inject(ChartService);
  private readonly _userSymbolsService = inject(UserSymbolsService);
  private readonly _userNotificationSettingsService = inject(UserNotificationSettingsService);
  private readonly _appService = inject(AppService);
  private readonly tickerService = inject(ExchangeTickerFactoryService);
  private readonly boxesService = inject(ChartBoxesService);
  private readonly router = inject(Router);
  private readonly _settingsService = inject(SettingsService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);

  private static symbolsCache: SymbolModel[] | null = null;

  ngOnInit(): void {
    this.refreshUserSymbols();
    this.startProfileLiveRefresh();
  }

  ngOnDestroy(): void {
    this.profileSub?.unsubscribe();
    this.tickerSub?.unsubscribe();
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

  private refreshUserSymbols(): void {
    this.loadUserSymbolsProfile(false);
  }

  private loadUserSymbolsProfile(silent: boolean): void {
    if (!silent) {
      this.loading = true;
      this.errorMsg = '';
    }

    const existingBySymbol = new Map<string, WatchlistSymbol>(
      this.userSymbols.map((u) => [`${u.ExchangeId}:${(u.SymbolName || '').toUpperCase()}`, u]),
    );

    this.profileSub?.unsubscribe();
    this.profileSub = forkJoin({
      exchanges: this._chartService.getExchanges(),
      userId: this._appService.getUserId$(),
    }).pipe(
      switchMap(({ exchanges, userId }) => {
        const uniqueExchanges = (exchanges || []).filter(
          (ex, idx, arr) => arr.findIndex((x) => x.Id === ex.Id) === idx,
        );
        if (!uniqueExchanges.length) {
          return of({
            profiles: [] as UserSymbolProfile[],
            notificationByKey: new Map<string, boolean>(),
            notificationSettingsByKey: new Map<string, UserNotificationSettings>(),
          });
        }

        return forkJoin({
          profileResults: forkJoin(
            uniqueExchanges.map((ex) =>
              this._userSymbolsService.getUserSymbolsProfileForExchange(ex.Id, userId).pipe(
                catchError(() => of([] as UserSymbolProfile[])),
              ),
            ),
          ),
          notificationResults: forkJoin(
            uniqueExchanges.map((ex) =>
              this._userNotificationSettingsService.getAll(ex.Id, userId).pipe(
                catchError(() => of([] as UserNotificationSettings[])),
              ),
            ),
          ),
        }).pipe(
          map(({ profileResults, notificationResults }) => {
            // Flatten all exchange results into one list, deduplicate by exchangeId:symbolName (but allow same symbol on different exchanges)
            const seen = new Set<string>();
            const merged: UserSymbolProfile[] = [];
            const allProfiles = (profileResults || []).flat();
            for (const item of allProfiles) {
                const name = ((item?.Symbol || item?.Name || item?.SymbolName) || '').trim().toUpperCase();
                const exchangeId = item?.ExchangeId ?? 0;
                const key = `${exchangeId}:${name}`;
                if (name && !seen.has(key)) {
                  seen.add(key);
                  merged.push({
                    ...item,
                    ExchangeName: item?.ExchangeName,
                    ExchangeId: exchangeId,
                  });
                } else if (name) {
                }
            }


            const notificationByKey = new Map<string, boolean>();
            const notificationSettingsByKey = new Map<string, UserNotificationSettings>();
            for (let i = 0; i < notificationResults.length; i++) {
              const exchangeId = uniqueExchanges[i].Id;
              for (const ns of notificationResults[i]) {
                const symbol = (ns.Symbol || '').trim().toUpperCase();
                if (!symbol) continue;
                const key = `${exchangeId}:${symbol}`;
                notificationByKey.set(key, this.hasAnyNotificationsEnabled(ns));
                notificationSettingsByKey.set(key, ns);
              }
            }

            return { profiles: merged, notificationByKey, notificationSettingsByKey };
          }),
        );
      }),
    ).subscribe({
      next: ({ profiles, notificationByKey, notificationSettingsByKey }) => {
        this.notificationSettingsByKey = notificationSettingsByKey;
        const mapped = this.mapProfileToSymbols(profiles ?? []);
        this.userSymbols = mapped.map((m) => {
          const symbolKey = `${m.ExchangeId}:${(m.SymbolName || '').toUpperCase()}`;
          const existing = existingBySymbol.get(symbolKey);
          return {
            ...m,
            price: m.price ?? existing?.price,
            changePct: m.changePct ?? existing?.changePct,
            notificationsEnabled: notificationByKey.get(symbolKey) ?? false,
          };
        });
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
    // Dominance symbols carry the same data across every exchange — keep only the first occurrence.
    const seenDominance = new Set<string>();
    const deduped = data.filter((item) => {
      const name = (item?.Symbol || item?.Name || item?.SymbolName || '').toUpperCase();
      if (name.includes('DOMINANCE')) {
        if (seenDominance.has(name)) return false;
        seenDominance.add(name);
      }
      return true;
    });

    const result = deduped.map((item, idx) => {
      const symbolName = (item?.Symbol || item?.Name || item?.SymbolName || '').toUpperCase();
      const mappedId = item?.UserSymbolId ?? item?.Id ?? (idx + 1);
      const mappedSymbolId = item?.SymbolId ?? this.buildStableSymbolId(symbolName);
      const mappedExchangeId = item?.ExchangeId ?? 0;
      return {
        Id: mappedId,
        SymbolId: mappedSymbolId,
        ExchangeId: mappedExchangeId,
        SymbolName: symbolName,
        Icon: resolveIconUrl(symbolName, item?.Icon || undefined),
        exchangeName: item?.ExchangeName || undefined,
        candle1h: this.toCandleState(item?.CapitalFlow, '1h'),
        candle4h: this.toCandleState(item?.CapitalFlow, '4h'),
        candle1d: this.toCandleState(item?.CapitalFlow, '1d'),
        boxes: (item?.Boxes || []).map((box) => this.mapProfileBoxToBoxModel(symbolName, box)),
        capitalFlow12mTier: this.tierForTimeframe(item?.CapitalFlow, '12m'),
        capitalFlow1hSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '1h'),
        capitalFlow4hSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '4h'),
        capitalFlow1dSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '1d'),
        capitalFlow1wSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '1w'),
        capitalFlow1mSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '1m'),
        capitalFlow12mSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '12m'),
        capitalFlow24mSignal: this.signalTypeForTimeframe(item?.CapitalFlow, '24m'),
      };
    });
    console.log('[Watchlist] mapProfileToSymbols result count:', result.length, result);
    return result;
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
    ).subscribe((results: Array<Array<{ Close?: number }>>) => {
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
      Type: box?.Type || box?.type || '',
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
    ).subscribe((results: BoxModel[][]) => {
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
    const targets = this.userSymbols
      .map((us) => ({
        exchangeId: us.ExchangeId,
        symbol: (us.SymbolName || '').toUpperCase().trim(),
      }))
      .filter((x) => x.exchangeId > 0 && !!x.symbol);

    if (!this.tickerSub) {
      this.tickerSub = this.tickerService.connect(targets).subscribe({
        next: () => {
          this.zone.run(() => {
            this.applyTickerData();
            this.cdr.markForCheck();
          });
        },
        error: (err) => console.error('[Watchlist] ticker stream error', err),
      });
      return;
    }

    this.tickerService.connect(targets);
  }

  private applyTickerData(): void {
    const map = this.tickerService.getLatest();
    if (!map.size) return;
    for (const us of this.userSymbols) {
      const t = map.get(this.tickerService.key(us.ExchangeId, us.SymbolName || ''));
      if (t) {
        us.price = t.close;
        us.changePct = t.changePct;
      }
    }
  }

  private disableAllNotifications(settings: UserNotificationSettings): UserNotificationSettings {
    return {
      ...settings,
      NotifyTradeOrderNew: false,
      NotifyTradeOrderTarget1: false,
      NotifyTradeOrderTarget2: false,
      NotifyTradeOrderStopped: false,
      NotifyBoxCandleIn: false,
      NotifyBoxCandleThrough: false,
      NotifyWatchlistActive: false,
      NotifyCapitalFlowBronze: false,
      NotifyCapitalFlowSilver: false,
      NotifyCapitalFlowGold: false,
      NotifyCapitalFlowPlatinum: false,
      NotifyCapitalFlowInBox: false,
      NotifyCapitalFlowOutOfBox: false,
      NotifyCfTf12m: false,
      NotifyCfTf24m: false,
      NotifyCfTf1h: false,
      NotifyCfTf4h: false,
      NotifyCfTf1d: false,
      NotifyCfTf1w: false,
      NotifyCfTf1M: false,
    };
  }

  private deleteUserSymbol(userSymbolId: number, exchangeId?: number): void {
    if (!userSymbolId) return;
    this._userSymbolsService.deleteUserSymbol(userSymbolId, exchangeId).subscribe({
      next: () => {
        this.userSymbols = this.userSymbols.filter(
          (u) => !(u.Id === userSymbolId && (exchangeId == null || u.ExchangeId === exchangeId)),
        );
        if (this.swipingId === userSymbolId) {
          this.swipingId = null;
          this.swipeOffset = 0;
          this.swiping = false;
        }
        this.cdr.markForCheck();
      },
      error: (err) => console.error('[Watchlist] delete user symbol error', err),
    });
  }

  private requestDeleteUserSymbol(us: WatchlistSymbol): void {
    const symbolKey = `${us.ExchangeId}:${(us.SymbolName || '').toUpperCase()}`;
    const hasEnabledNotifications = !!us.notificationsEnabled;

    if (!hasEnabledNotifications) {
      this.deleteUserSymbol(us.Id, us.ExchangeId);
      return;
    }

    const disableNotifications = window.confirm(
      `Disable notifications for ${us.SymbolName || 'this symbol'} before removing it from your watchlist?`,
    );

    if (!disableNotifications) {
      this.deleteUserSymbol(us.Id, us.ExchangeId);
      return;
    }

    const existingSettings = this.notificationSettingsByKey.get(symbolKey);
    if (!existingSettings) {
      this.deleteUserSymbol(us.Id, us.ExchangeId);
      return;
    }

    this._userNotificationSettingsService
      .update(this.disableAllNotifications(existingSettings))
      .pipe(
        catchError((err) => {
          console.error('[Watchlist] disable notifications before delete failed', err);
          return of(null);
        }),
      )
      .subscribe(() => {
        this.deleteUserSymbol(us.Id, us.ExchangeId);
      });
  }

  onDeleteClick(ev: Event, us: WatchlistSymbol): void {
    ev.stopPropagation();
    this.requestDeleteUserSymbol(us);
  }

  // --- Swipe-to-delete ---

  onSwipeStart(ev: TouchEvent, us: WatchlistSymbol): void {
    const touch = ev.touches[0];
    this.swipeStartX = touch.clientX;
    this.swipeStartY = touch.clientY;
    this.swiping = false;
    this.swipingId = us.Id;
    this.swipeOffset = 0;
  }

  onSwipeMove(ev: TouchEvent, us: WatchlistSymbol): void {
    if (this.swipingId !== us.Id) return;
    const touch = ev.touches[0];
    const dx = this.swipeStartX - touch.clientX;
    const dy = Math.abs(touch.clientY - this.swipeStartY);

    // If vertical scroll is dominant, cancel swipe
    if (!this.swiping && dy > 10 && dy > Math.abs(dx)) {
      this.swipingId = null;
      this.swipeOffset = 0;
      return;
    }

    if (Math.abs(dx) > 10) {
      this.swiping = true;
    }

    if (this.swiping) {
      ev.preventDefault();
      // Only allow left swipe (dx > 0), clamp to max
      this.swipeOffset = Math.max(0, Math.min(dx, this.swipeDeleteThreshold + 20));
      this.cdr.markForCheck();
    }
  }

  onSwipeEnd(us: WatchlistSymbol): void {
    if (this.swipingId !== us.Id) return;

    if (this.swipeOffset >= this.swipeDeleteThreshold) {
      // Full swipe — delete
      this.requestDeleteUserSymbol(us);
    } else if (this.swipeOffset >= this.swipeThreshold) {
      // Partial swipe — snap open to reveal button
      this.swipeOffset = this.swipeThreshold;
    } else {
      // Cancel
      this.swipeOffset = 0;
      this.swipingId = null;
    }
    this.swiping = false;
    this.cdr.markForCheck();
  }

  resetSwipe(): void {
    this.swipingId = null;
    this.swipeOffset = 0;
    this.swiping = false;
    this.cdr.markForCheck();
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

  onNotificationsClick(ev: Event, symbol: string): void {
    ev.stopPropagation();
    const cleaned = (symbol || '').trim();
    if (!cleaned) return;
    this.router.navigate(['/settings/alerts', cleaned]);
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

  private tierForTimeframe(
    capitalFlow: UserSymbolProfile['CapitalFlow'] | undefined,
    timeframe: string,
  ): string | undefined {
    const item = (capitalFlow || []).find(
      (cf) => (cf?.Timeframe || '').toLowerCase() === timeframe.toLowerCase(),
    );
    return item?.Tier || undefined;
  }

  private hasAnyNotificationsEnabled(ns: UserNotificationSettings): boolean {
    return (
      !!ns.NotifyTradeOrderNew ||
      !!ns.NotifyTradeOrderTarget1 ||
      !!ns.NotifyTradeOrderTarget2 ||
      !!ns.NotifyTradeOrderStopped ||
      !!ns.NotifyBoxCandleIn ||
      !!ns.NotifyBoxCandleThrough ||
      !!ns.NotifyWatchlistActive ||
      !!ns.NotifyCapitalFlowBronze ||
      !!ns.NotifyCapitalFlowSilver ||
      !!ns.NotifyCapitalFlowGold ||
      !!ns.NotifyCapitalFlowPlatinum ||
      !!ns.NotifyCapitalFlowInBox ||
      !!ns.NotifyCapitalFlowOutOfBox ||
      !!ns.NotifyCfTf12m ||
      !!ns.NotifyCfTf24m ||
      !!ns.NotifyCfTf1h ||
      !!ns.NotifyCfTf4h ||
      !!ns.NotifyCfTf1d ||
      !!ns.NotifyCfTf1w ||
      !!ns.NotifyCfTf1M
    );
  }

  signalTier(signalType: string | undefined): 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'unknown' {
    const s = (signalType || '').toLowerCase();
    if (s.includes('bronze')) return 'bronze';
    if (s.includes('silver')) return 'silver';
    if (s.includes('gold')) return 'gold';
    if (s.includes('platinum')) return 'platinum';
    if (s.includes('diamond')) return 'diamond';
    return 'unknown';
  }

  signalTierIcon(signalType: string | undefined): string {
    switch (this.signalTier(signalType)) {
      case 'bronze':
        return '◉';
      case 'silver':
        return '◆';
      case 'gold':
        return '★';
      case 'platinum':
        return '✦';
      case 'diamond':
        return '◈';
      default:
        return '•';
    }
  }

  signalIsBullish(signalType: string | undefined): boolean {
    return (signalType || '').toLowerCase().includes('bull');
  }

  signalIsBearish(signalType: string | undefined): boolean {
    return (signalType || '').toLowerCase().includes('bear');
  }

  shortName(name: string): string {
    return name.replace(/DOMINANCE/gi, '-D');
  }

  closeInfo(): void {
    this.infoOpen = false;
    this.infoSymbol = '';
    this.cdr.markForCheck();
  }
}
