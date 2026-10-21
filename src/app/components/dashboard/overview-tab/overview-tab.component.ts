import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { distinctUntilChanged, switchMap, take, timer } from 'rxjs';
import { appFeature } from 'src/app/store/app/app.reducer';
import { HeartbeatService } from '../../admin/services/heartbeat.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { DashboardDataService, MarketMood } from '../dashboard-data.service';
import {
  BoxSummary,
  CalendarEvent,
  DASHBOARD_DEFAULT_SYMBOL,
  RangeSummary,
  formatNumber,
  WatchlistSummary,
  moodLevel,
  pickTodayEvents,
  relativeTime,
  summarizeBoxes,
  summarizeHeartbeats,
  summarizeRange,
  summarizeWatchlist,
} from '../dashboard-stats';
import { SparklineComponent } from '../charts/sparkline.component';
import { formatPrice } from '../charts/mini-candles.component';

/** 12-minute candles: 120 of them cover exactly the last 24 hours. */
const RANGE_TIMEFRAME = '12m';
const RANGE_CANDLES = 120;
const REFRESH_MS = 60_000;

@Component({
  selector: 'app-dashboard-overview',
  standalone: true,
  imports: [TranslateModule, SparklineComponent],
  templateUrl: './overview-tab.component.html',
  styleUrl: './overview-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OverviewTabComponent {
  readonly isAdmin = input(false);

  private readonly _data = inject(DashboardDataService);
  private readonly _heartbeats = inject(HeartbeatService);
  private readonly _settings = inject(SettingsService);
  private readonly _router = inject(Router);
  private readonly _destroyRef = inject(DestroyRef);

  readonly symbol = DASHBOARD_DEFAULT_SYMBOL;
  readonly btc = signal<RangeSummary | null>(null);
  readonly btcLoaded = signal(false);
  readonly boxes = signal<BoxSummary | null>(null);
  readonly watchlist = signal<WatchlistSummary | null>(null);
  readonly aiQueue = signal<number | null>(null);
  readonly pendingNotifications = signal<number | null>(null);
  readonly events = signal<CalendarEvent[]>([]);
  readonly mood = signal<MarketMood | null>(null);
  readonly now = signal(Date.now());

  /** App language ('en' / 'nl'): numbers and times follow it, not the browser. */
  private readonly language = toSignal(inject(Store).select(appFeature.selectLanguage), {
    initialValue: 'nl',
  });
  private readonly heartbeatItems = toSignal(this._heartbeats.items$, { initialValue: [] });

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly overviewVm = computed(() => {
    const now = this.now();
    const lang = this.language();
    const price = (v: number) => formatPrice(v, lang);
    const b = this.btc();
    const bx = this.boxes();
    const mood = this.mood();
    const items = this.heartbeatItems();
    const hb = summarizeHeartbeats(items);
    const maxPerTf = Math.max(1, ...(bx?.perTimeframe.map((p) => p.count) ?? []));
    const wl = this.watchlist();
    return {
      isAdmin: this.isAdmin(),
      btcLoaded: this.btcLoaded(),
      btc: b
        ? {
            lastText: price(b.last),
            lowText: price(b.low),
            highText: price(b.high),
            up: b.changePct >= 0,
            changeText: `${formatNumber(Math.abs(b.changePct), 2, lang)}%`,
            positionPct: b.positionPct,
            positionText: `${formatNumber(b.positionPct, 0, lang)}%`,
            priceFormat: price,
            closes: b.closes,
          }
        : null,
      fearGreed: mood?.fearGreed
        ? { ...mood.fearGreed, level: moodLevel(mood.fearGreed.value) }
        : null,
      btcDominance: mood?.btcDominance ?? null,
      btcDominanceText:
        mood?.btcDominance != null ? `${formatNumber(mood.btcDominance, 1, lang)}%` : '',
      hasMood: !!mood && (!!mood.fearGreed || mood.btcDominance !== null),
      bots: items.map((bot) => ({
        id: bot.id,
        name: bot.name,
        ok: bot.ok,
        ago: relativeTime(bot.heartbeatReceivedAt ?? bot.lastAt, now, lang),
      })),
      botsRunning: hb.running,
      botsTotal: hb.total,
      botsAllOk: hb.running === hb.total,
      boxes: bx
        ? {
            ...bx,
            bars: bx.perTimeframe.map((p) => ({ ...p, heightPct: (p.count / maxPerTf) * 100 })),
          }
        : null,
      watchlist: wl ? { ...wl, topStatus: wl.byStatus.slice(0, 5) } : null,
      aiQueue: this.aiQueue(),
      pendingNotifications: this.pendingNotifications(),
      hasQueues: this.aiQueue() !== null || this.pendingNotifications() !== null,
      events: this.events(),
    };
  });

  constructor() {
    // Fast sources reload every minute while the tab is open. The admin role
    // arrives async, so restart when it changes to pick up the admin-only sources.
    toObservable(this.isAdmin)
      .pipe(
        distinctUntilChanged(),
        switchMap(() => timer(0, REFRESH_MS)),
        takeUntilDestroyed(this._destroyRef),
      )
      .subscribe(() => this.loadFast());
    this.loadSlow();
  }

  /** Called by the page when the refresh button is pressed. */
  refresh(): void {
    this.loadFast();
    this.loadSlow();
  }

  /** Cheap sources, refreshed every minute. */
  loadFast(): void {
    this.now.set(Date.now());
    this._data
      .candles(this.symbol, RANGE_TIMEFRAME, RANGE_CANDLES)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((candles) => {
        this.btc.set(summarizeRange(candles));
        this.btcLoaded.set(true);
      });
    // Heartbeats, AI queue and notifications are admin-only endpoints (403 otherwise).
    if (this.isAdmin()) {
      this._settings
        .waitForExchangeId$()
        .pipe(take(1), takeUntilDestroyed(this._destroyRef))
        .subscribe((exchangeId) => this._heartbeats.load(exchangeId));
      this._data
        .aiQueueCount()
        .pipe(takeUntilDestroyed(this._destroyRef))
        .subscribe((n) => this.aiQueue.set(n));
      this._data
        .pendingNotifications()
        .pipe(takeUntilDestroyed(this._destroyRef))
        .subscribe((n) => this.pendingNotifications.set(n));
    }
  }

  /** Heavier or slow-changing sources: loaded on open and on manual refresh. */
  loadSlow(): void {
    this._data
      .boxesPerTimeframe(this.symbol)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((byTf) => this.boxes.set(summarizeBoxes(byTf)));
    this._data
      .watchlist()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((rows) => this.watchlist.set(rows ? summarizeWatchlist(rows) : null));
    this._data
      .calendarToday()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((rows) => this.events.set(pickTodayEvents(rows, new Date())));
    this._data
      .marketMood()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((m) => this.mood.set(m));
  }

  openChart(): void {
    this._router.navigate(['/mcb-chart', this.symbol]);
  }
}
