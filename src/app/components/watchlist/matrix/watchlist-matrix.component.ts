import { ChangeDetectionStrategy, Component, Input, OnChanges, OnInit, SimpleChanges, computed, inject, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import { take } from 'rxjs/operators';
import { TranslateModule } from '@ngx-translate/core';

export type Timeframe = '1H' | '4H' | '1D' | '1W' | '1M' | '12M' | '24M';
export type SignalType = 'bullish' | 'bearish' | 'neutral';

export interface MarketSignalRow {
  timeframe: Timeframe;
  btc?: SignalType;
  btcDominance?: SignalType;
  altDominance?: SignalType;
  usdtDominance?: SignalType;
  barsAgo?: number | null;
}

export interface MatrixTapEvent {
  indicator: 'BTC' | 'BTC.D' | 'ALT.D' | 'USDT.D';
  timeframe: Timeframe;
}

@Component({
  selector: 'app-watchlist-matrix',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './watchlist-matrix.component.html',
  styleUrls: ['./watchlist-matrix.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistMatrixComponent implements OnChanges, OnInit {
  private static readonly MAX_SIGNAL_BARS_AGO = 5;

  // Optional: allow parent to pass signals data; otherwise load from API
  @Input({ required: false }) rowsInput?: MarketSignalRow[];

  private readonly allTimeframes: Timeframe[] = ['1H', '4H', '1D', '1W', '1M', '12M', '24M'];

  readonly rows: WritableSignal<MarketSignalRow[]> = signal([]);

  readonly headers: Signal<string[]> = computed(() => ['Timeframe', 'BTC', 'BTC.D', 'ALT.D', 'USDT.D']);

  private readonly chartService = inject(ChartService);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rowsInput'] && this.rowsInput && this.rowsInput.length) {
      this.rows.set(this.normalizeRows(this.rowsInput));
    }
  }

  ngOnInit(): void {
    // Only fall back to the API if the parent did not supply data via rowsInput
    if (!this.rows().length) {
      this.chartService
        .getWatchlist()
        .pipe(take(1))
        .subscribe({
          next: (items: any[]) => {
            const mapped = this.mapWatchlistToRows(items);
            this.rows.set(mapped);
          },
          error: () => {
            this.rows.set(this.buildMockData());
          },
        });
    }
  }

  private normalizeRows(data: MarketSignalRow[]): MarketSignalRow[] {
    return data.map(r => this.stripDominanceForLongTF(r));
  }

  private stripDominanceForLongTF(row: MarketSignalRow): MarketSignalRow {
    if (row.timeframe === '12M' || row.timeframe === '24M') {
      return { ...row, btcDominance: undefined, altDominance: undefined, usdtDominance: undefined };
    }
    return row;
  }

  private buildMockData(): MarketSignalRow[] {
    const pick = (idx: number): SignalType => (idx % 3 === 0 ? 'bullish' : idx % 3 === 1 ? 'bearish' : 'neutral');
    return this.allTimeframes.map((tf, i) => this.stripDominanceForLongTF({
      timeframe: tf,
      btc: pick(i),
      btcDominance: tf === '12M' || tf === '24M' ? undefined : pick(i + 1),
      altDominance: tf === '12M' || tf === '24M' ? undefined : pick(i + 2),
      usdtDominance: tf === '12M' || tf === '24M' ? undefined : pick(i + 3),
    }));
  }

  private tfApiToUi(tf: string): Timeframe | null {
    const lower = (tf || '').toString().trim().toLowerCase();
    switch (lower) {
      case '1h': return '1H';
      case '4h': return '4H';
      case '1d': return '1D';
      case '1w': return '1W';
      case '1m': return '1M';
      case '12m': return '12M';
      case '24m': return '24M';
      default: return null;
    }
  }

  private dirToSignal(direction: string | null | undefined): SignalType {
    const d = (direction || '').toUpperCase();
    if (d === 'BULL' || d === 'BULLISH' || d === 'LONG') return 'bullish';
    if (d === 'BEAR' || d === 'BEARISH' || d === 'SHORT') return 'bearish';
    return 'neutral';
  }

  private isFreshBarsAgo(barsAgo: number | null | undefined): boolean {
    return barsAgo == null || barsAgo <= WatchlistMatrixComponent.MAX_SIGNAL_BARS_AGO;
  }

  private pickBetter(current: SignalType | undefined, incoming: SignalType, state?: string | null): SignalType {
    const isActive = (state || '').toUpperCase() === 'ACTIVE';
    // If nothing set yet, accept incoming
    if (!current) return incoming;
    // Only allow overrides from ACTIVE items
    if (!isActive) return current;
    // Do not let neutral override an existing non-neutral
    if (incoming === 'neutral' && current !== 'neutral') return current;
    // ACTIVE non-neutral can replace current
    if (incoming !== 'neutral') return incoming;
    // Otherwise keep current
    return current;
  }

  private mapWatchlistToRows(items: any[]): MarketSignalRow[] {
    // Initialize rows for all timeframes
    const rowMap: Record<Timeframe, MarketSignalRow> = {
      '1H': { timeframe: '1H', barsAgo: null },
      '4H': { timeframe: '4H', barsAgo: null },
      '1D': { timeframe: '1D', barsAgo: null },
      '1W': { timeframe: '1W', barsAgo: null },
      '1M': { timeframe: '1M', barsAgo: null },
      '12M': { timeframe: '12M', barsAgo: null },
      '24M': { timeframe: '24M', barsAgo: null },
    };

    for (const it of items || []) {
      const tf = this.tfApiToUi(it?.Timeframe ?? it?.timeframe ?? '');
      if (!tf) continue;

      const symbol = (it?.Symbol ?? it?.symbol ?? '').toString().trim().toUpperCase();
      let dir = this.dirToSignal((it?.Direction ?? it?.direction));

      // Debug: trace mapping for 4H USDT dominance specifically
      if (symbol === 'USDTDOMINANCE' && tf === '4H') {
        console.debug('[watchlist-matrix] Mapping USDTDOMINANCE 4H ->', dir, it);
      }

      const state = it?.State ?? it?.state;
      const barsAgoRaw = it?.BarsAgo ?? it?.barsAgo;
      const barsAgo = typeof barsAgoRaw === 'number' ? barsAgoRaw : null;
      const isFresh = this.isFreshBarsAgo(barsAgo);
      if (!isFresh) {
        continue;
      }

      // If a dominance item has Direction NONE, force neutral regardless of precedence
      const isDominanceSymbol = symbol === 'DOMINANCE' || symbol === 'BTCDOMINANCE' || symbol === 'BTC.D' || symbol === 'ALTCOINDOMINANCE' || symbol === 'ALT.D' || symbol === 'USDTDOMINANCE' || symbol === 'USDT.D';
      if (isDominanceSymbol && (it?.Direction ?? it?.direction ?? '').toString().trim().toUpperCase() === 'NONE') {
        dir = 'neutral';
      }

      if (symbol === 'BTCUSDT' || symbol === 'BTC' || symbol === 'BTC-EUR' || symbol === 'BTCEUR') {
        rowMap[tf].btc = this.pickBetter(rowMap[tf].btc, dir, state);
        rowMap[tf].barsAgo = this.pickBarsAgo(rowMap[tf].barsAgo, isFresh ? barsAgo : null);
      } else if (symbol === 'DOMINANCE' || symbol === 'BTCDOMINANCE' || symbol === 'BTC.D') {
        // BTC Dominance
        if (tf !== '12M' && tf !== '24M') rowMap[tf].btcDominance = this.pickBetter(rowMap[tf].btcDominance, dir, state);
        rowMap[tf].barsAgo = this.pickBarsAgo(rowMap[tf].barsAgo, isFresh ? barsAgo : null);
      } else if (symbol === 'ALTCOINDOMINANCE' || symbol === 'ALT.D') {
        if (tf !== '12M' && tf !== '24M') rowMap[tf].altDominance = this.pickBetter(rowMap[tf].altDominance, dir, state);
        rowMap[tf].barsAgo = this.pickBarsAgo(rowMap[tf].barsAgo, isFresh ? barsAgo : null);
      } else if (symbol === 'USDTDOMINANCE' || symbol === 'USDT.D') {
        if (tf !== '12M' && tf !== '24M') rowMap[tf].usdtDominance = this.pickBetter(rowMap[tf].usdtDominance, dir, state);
        rowMap[tf].barsAgo = this.pickBarsAgo(rowMap[tf].barsAgo, isFresh ? barsAgo : null);
      }
    }

    // Ensure long TF dominance columns are stripped
    const rows = Object.values(rowMap).map(r => this.stripDominanceForLongTF(r));
    // Debug: verify resulting row values for 4H
    const row4h = rows.find(r => r.timeframe === '4H');
    console.debug('[watchlist-matrix] Row 4H after mapping:', row4h);
    return rows;
  }

  private pickBarsAgo(current: number | null | undefined, incoming: number | null | undefined): number | null {
    if (incoming == null) return current ?? null;
    if (current == null) return incoming;
    // Smaller values are fresher, so keep the freshest visible badge.
    return Math.min(current, incoming);
  }

  onCellTap(indicator: 'BTC' | 'BTC.D' | 'ALT.D' | 'USDT.D', timeframe: Timeframe): void {
    // Emit a custom event via window for existing watchlist logic to hook in
    const evt: CustomEvent<MatrixTapEvent> = new CustomEvent('watchlist-matrix-tap', {
      detail: { indicator, timeframe },
      bubbles: true,
    });
    window.dispatchEvent(evt);
  }
}
