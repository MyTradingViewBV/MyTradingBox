import { ChangeDetectionStrategy, Component, Input, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export type Timeframe = '1H' | '4H' | '1D' | '1W' | '1M' | '12M' | '24M';
export type SignalType = 'bullish' | 'bearish' | 'neutral';

export interface MarketSignalRow {
  timeframe: Timeframe;
  btc?: SignalType;
  btcDominance?: SignalType;
  altDominance?: SignalType;
  usdtDominance?: SignalType;
}

export interface MatrixTapEvent {
  indicator: 'BTC' | 'BTC.D' | 'ALT.D' | 'USDT.D';
  timeframe: Timeframe;
}

@Component({
  selector: 'app-watchlist-matrix',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './watchlist-matrix.component.html',
  styleUrls: ['./watchlist-matrix.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistMatrixComponent {
  // Optional: allow parent to pass signals data; otherwise mock
  @Input({ required: false }) rowsInput?: MarketSignalRow[];

  private readonly allTimeframes: Timeframe[] = ['1H', '4H', '1D', '1W', '1M', '12M', '24M'];

  readonly rows: WritableSignal<MarketSignalRow[]> = signal([]);

  readonly headers: Signal<string[]> = computed(() => ['Timeframe', 'BTC', 'BTC.D', 'ALT.D', 'USDT.D']);

  constructor() {
    const initial = this.rowsInput ? this.normalizeRows(this.rowsInput) : this.buildMockData();
    this.rows.set(initial);
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

  onCellTap(indicator: 'BTC' | 'BTC.D' | 'ALT.D' | 'USDT.D', timeframe: Timeframe): void {
    // Emit a custom event via window for existing watchlist logic to hook in
    const evt: CustomEvent<MatrixTapEvent> = new CustomEvent('watchlist-matrix-tap', {
      detail: { indicator, timeframe },
      bubbles: true,
    });
    window.dispatchEvent(evt);
  }
}
