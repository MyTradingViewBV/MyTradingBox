import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { Subscription, forkJoin } from 'rxjs';
import { appFeature } from 'src/app/store/app/app.reducer';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { DashboardDataService } from '../dashboard-data.service';
import {
  DASHBOARD_DEFAULT_SYMBOL,
  DASHBOARD_TIMEFRAMES,
  RangeSummary,
  formatNumber,
  summarizeRange,
} from '../dashboard-stats';
import { MiniCandlesComponent, formatPrice } from '../charts/mini-candles.component';
import { MiniMcbComponent } from '../charts/mini-mcb.component';

/** Candles per mini chart. */
const MINI_CANDLES = 60;
/** Candles fetched per timeframe: the MCB panel needs ~65 bars of warm-up before the visible 60. */
const FETCH_CANDLES = 200;
const SYMBOL_KEY = 'mtb.dashboard.timeframeSymbol';

export interface TimeframeTile {
  timeframe: string;
  candles: Candle[];
  /** All fetched candles (MCB input). */
  history: Candle[];
  summary: RangeSummary | null;
}

@Component({
  selector: 'app-dashboard-timeframes',
  standalone: true,
  imports: [TranslateModule, MiniCandlesComponent, MiniMcbComponent],
  templateUrl: './timeframes-tab.component.html',
  styleUrl: './timeframes-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeframesTabComponent {
  private readonly _data = inject(DashboardDataService);
  private readonly _router = inject(Router);
  private readonly _destroyRef = inject(DestroyRef);
  private _load?: Subscription;

  readonly symbols = signal<string[]>([DASHBOARD_DEFAULT_SYMBOL]);
  readonly symbol = signal(readSymbol());
  readonly tiles = signal<TimeframeTile[] | null>(null);
  readonly placeholders = [1, 2, 3, 4, 5, 6];
  /** App language ('en' / 'nl'): numbers follow it, not the browser. */
  private readonly language = toSignal(inject(Store).select(appFeature.selectLanguage), {
    initialValue: 'nl',
  });

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly timeframesVm = computed(() => {
    const symbol = this.symbol();
    const lang = this.language();
    return {
      symbol,
      lang,
      symbols: this.symbols(),
      tiles:
        this.tiles()?.map((tile) => {
          const s = tile.summary;
          return {
            timeframe: tile.timeframe,
            candles: tile.candles,
            history: tile.history,
            visible: MINI_CANDLES,
            label: `${symbol} ${tile.timeframe}`,
            hasSummary: !!s,
            up: (s?.changePct ?? 0) >= 0,
            changeText: s ? `${s.changePct >= 0 ? '+' : '−'}${formatNumber(Math.abs(s.changePct), 2, lang)}%` : '',
            lastText: s ? formatPrice(s.last, lang) : '',
          };
        }) ?? null,
    };
  });

  constructor() {
    this._data
      .symbols()
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((list) => {
        const merged = new Set([DASHBOARD_DEFAULT_SYMBOL, ...list]);
        this.symbols.set([...merged]);
      });
    this.load();
  }

  selectSymbol(symbol: string): void {
    if (!symbol || symbol === this.symbol()) return;
    this.symbol.set(symbol);
    try {
      localStorage.setItem(SYMBOL_KEY, symbol);
    } catch {
      // Storage blocked: the choice just isn't remembered.
    }
    this.load();
  }

  refresh(): void {
    this.load();
  }

  load(): void {
    this._load?.unsubscribe();
    this.tiles.set(null);
    const symbol = this.symbol();
    this._load = forkJoin(
      DASHBOARD_TIMEFRAMES.map((tf) => this._data.candles(symbol, tf, FETCH_CANDLES)),
    )
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe((lists) =>
        this.tiles.set(
          DASHBOARD_TIMEFRAMES.map((timeframe, i) => {
            const candles = lists[i].slice(-MINI_CANDLES);
            return { timeframe, candles, history: lists[i], summary: summarizeRange(candles) };
          }),
        ),
      );
  }

  open(timeframe: string): void {
    this._router.navigate(['/mcb-chart', this.symbol(), timeframe]);
  }
}

function readSymbol(): string {
  try {
    return localStorage.getItem(SYMBOL_KEY) || DASHBOARD_DEFAULT_SYMBOL;
  } catch {
    return DASHBOARD_DEFAULT_SYMBOL;
  }
}
