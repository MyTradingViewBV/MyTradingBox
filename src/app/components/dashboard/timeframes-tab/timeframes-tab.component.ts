import { NgTemplateOutlet } from '@angular/common';
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
const ORDER_KEY = 'mtb.dashboard.timeframeOrder';

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
  imports: [NgTemplateOutlet, TranslateModule, MiniCandlesComponent, MiniMcbComponent],
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
  /** Tile order chosen by the user (stored on this device). */
  readonly order = signal<string[]>(readOrder());
  /** Order mode: tiles get move buttons and can be dragged instead of opening the chart. */
  readonly editing = signal(false);
  private _dragged: string | null = null;
  /** App language ('en' / 'nl'): numbers follow it, not the browser. */
  private readonly language = toSignal(inject(Store).select(appFeature.selectLanguage), {
    initialValue: 'nl',
  });

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly timeframesVm = computed(() => {
    const symbol = this.symbol();
    const lang = this.language();
    const order = this.order();
    const sorted = this.tiles()
      ?.slice()
      .sort((a, b) => order.indexOf(a.timeframe) - order.indexOf(b.timeframe));
    const last = (sorted?.length ?? 0) - 1;
    return {
      symbol,
      lang,
      symbols: this.symbols(),
      editing: this.editing(),
      tiles:
        sorted?.map((tile, index) => {
          const s = tile.summary;
          return {
            timeframe: tile.timeframe,
            first: index === 0,
            last: index === last,
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

  toggleEditing(): void {
    this.editing.update((v) => !v);
  }

  /** Move a tile `delta` places (−1 = earlier, +1 = later). */
  move(timeframe: string, delta: number): void {
    const order = this.order();
    this.moveTo(timeframe, order[order.indexOf(timeframe) + delta]);
  }

  /** Put `timeframe` at the place of `target`. */
  moveTo(timeframe: string, target: string | undefined): void {
    const order = [...this.order()];
    const from = order.indexOf(timeframe);
    const to = target ? order.indexOf(target) : -1;
    if (from < 0 || to < 0 || from === to) return;
    order.splice(from, 1);
    order.splice(to, 0, timeframe);
    this.saveOrder(order);
  }

  resetOrder(): void {
    this.saveOrder([...DASHBOARD_TIMEFRAMES]);
  }

  onDragStart(timeframe: string, event: DragEvent): void {
    this._dragged = timeframe;
    event.dataTransfer?.setData('text/plain', timeframe);
  }

  onDrop(target: string, event: DragEvent): void {
    event.preventDefault();
    if (this._dragged) this.moveTo(this._dragged, target);
    this._dragged = null;
  }

  private saveOrder(order: string[]): void {
    this.order.set(order);
    try {
      localStorage.setItem(ORDER_KEY, JSON.stringify(order));
    } catch {
      // Storage blocked: the order only lasts for this visit.
    }
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

/** Stored tile order; unknown timeframes are dropped and missing ones appended in default order. */
export function readOrder(): string[] {
  let stored: unknown = null;
  try {
    stored = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null');
  } catch {
    stored = null;
  }
  const known = new Set<string>(DASHBOARD_TIMEFRAMES);
  const kept = [...new Set(Array.isArray(stored) ? stored.filter((tf): tf is string => known.has(tf)) : [])];
  return [...kept, ...DASHBOARD_TIMEFRAMES.filter((tf) => !kept.includes(tf))];
}
