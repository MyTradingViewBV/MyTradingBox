import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import {
  Subject,
  forkJoin,
  switchMap,
  take,
  takeUntil,
  tap,
} from 'rxjs';
import {
  CandlestickData,
  CandlestickSeries,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  createChart,
} from 'lightweight-charts';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { BinanceStreamService } from '../chart/services/binance-stream.service';
import { mapTimeframeToBinanceInterval, parseUtcMs } from '../chart/utils/merge-live-candles';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { LiveKlineUpdate } from 'src/app/modules/shared/models/chart/binance-kline.dto';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';

@Component({
  selector: 'app-tv-chart',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './tv-chart.component.html',
  styleUrls: ['./tv-chart.component.scss'],
})
export class TvChartComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly chartService = inject(ChartService);
  private readonly binanceStream = inject(BinanceStreamService);
  private readonly settingsService = inject(SettingsService);

  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef<HTMLDivElement>;

  private chart?: IChartApi;
  private series?: ISeriesApi<'Candlestick'>;
  private resizeObserver?: ResizeObserver;

  private readonly destroy$ = new Subject<void>();
  // Re-created on every symbol/timeframe switch to tear down the previous live stream
  private streamSwitch$ = new Subject<void>();

  loading = false;

  exchanges: Exchange[] = [];
  selectedExchange = new Exchange();

  symbols: SymbolModel[] = [];
  selectedSymbol = new SymbolModel();

  selectedTimeframe = '1h';
  readonly timeframes = [
    { label: '12m', value: '12m' },
    { label: '24m', value: '24m' },
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
    { label: '1M', value: '1M' },
  ];

  ngAfterViewInit(): void {
    this.chart = createChart(this.chartContainer.nativeElement, {
      layout: { background: { color: '#131722' }, textColor: '#d1d4dc' },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    this.resizeObserver = new ResizeObserver(() => {
      const el = this.chartContainer.nativeElement;
      this.chart?.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    this.resizeObserver.observe(this.chartContainer.nativeElement);
  }

  ngOnInit(): void {
    this.loading = true;
    this.chartService
      .getExchanges()
      .pipe(
        tap((exchanges) => (this.exchanges = exchanges || [])),
        switchMap(() => this.settingsService.getSelectedExchange().pipe(take(1))),
        tap((stored) => {
          const match = stored
            ? this.exchanges.find((e) => e.Id === stored.Id)
            : undefined;
          this.selectedExchange = match ?? this.exchanges[0] ?? new Exchange();
          if (!match) {
            this.settingsService.dispatchAppAction(
              SettingsActions.setSelectedExchange({ exchange: this.selectedExchange }),
            );
          }
        }),
        switchMap(() => this.settingsService.getSelectedTimeframe().pipe(take(1))),
        tap((tf) => {
          const known = this.timeframes.some((t) => t.value === tf);
          this.selectedTimeframe = known ? (tf as string) : '1h';
        }),
        switchMap(() => this.chartService.getSymbols()),
        tap((symbols) => (this.symbols = symbols || [])),
        switchMap(() => this.settingsService.getSelectedSymbol().pipe(take(1))),
        tap((stored) => {
          const match = stored
            ? this.symbols.find(
                (s) => s.SymbolName.toUpperCase() === stored.SymbolName.toUpperCase(),
              )
            : undefined;
          this.selectedSymbol = match ?? stored ?? this.symbols[0] ?? new SymbolModel();
          if (!match) {
            this.settingsService.dispatchAppAction(
              SettingsActions.setSelectedSymbol({ symbol: this.selectedSymbol }),
            );
          }
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => this.loadCandlesAndStream(),
        error: (e) => {
          console.warn('[TvChart] init error', e);
          this.loading = false;
        },
      });
  }

  onExchangeChange(exchange: Exchange): void {
    this.selectedExchange = exchange;
    this.settingsService.dispatchAppAction(SettingsActions.setSelectedExchange({ exchange }));
    this.loading = true;
    this.chartService
      .getSymbolsForExchange(exchange.Id)
      .pipe(takeUntil(this.destroy$))
      .subscribe((symbols) => {
        this.symbols = symbols || [];
        this.selectedSymbol = this.symbols[0] ?? new SymbolModel();
        this.settingsService.dispatchAppAction(
          SettingsActions.setSelectedSymbol({ symbol: this.selectedSymbol }),
        );
        this.loadCandlesAndStream();
      });
  }

  onSymbolChange(symbol: SymbolModel): void {
    this.selectedSymbol = symbol;
    this.settingsService.dispatchAppAction(SettingsActions.setSelectedSymbol({ symbol }));
    this.loadCandlesAndStream();
  }

  onTimeframeChange(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    this.settingsService.dispatchAppAction(SettingsActions.setSelectedTimeframe({ timeframe }));
    this.loadCandlesAndStream();
  }

  private loadCandlesAndStream(): void {
    if (!this.selectedSymbol?.SymbolName || !this.series) return;
    this.loading = true;

    // Tear down the previous live stream before loading new history
    this.streamSwitch$.next();

    this.chartService
      .getCandles(this.selectedSymbol.SymbolName, this.selectedTimeframe, 1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (candles) => {
          const bars = this.toBars(candles);
          this.series!.setData(bars);
          this.chart?.timeScale().fitContent();
          this.loading = false;
          this.setupLiveStream();
        },
        error: (e) => {
          console.warn('[TvChart] getCandles error', e);
          this.loading = false;
        },
      });
  }

  private setupLiveStream(): void {
    const symbol = this.selectedSymbol?.SymbolName?.toUpperCase();
    const interval = mapTimeframeToBinanceInterval(this.selectedTimeframe);
    if (!symbol || !interval || !this.series) return;

    this.binanceStream
      .connectKlineStream(symbol, interval)
      .pipe(takeUntil(this.streamSwitch$), takeUntil(this.destroy$))
      .subscribe((update: LiveKlineUpdate) => {
        this.series!.update({
          time: Math.floor(update.openTime / 1000) as UTCTimestamp,
          open: update.open,
          high: update.high,
          low: update.low,
          close: update.close,
        });
      });
  }

  private toBars(candles: Candle[]): CandlestickData[] {
    return (candles || [])
      .map((c) => ({
        time: Math.floor(parseUtcMs(c.Time) / 1000) as UTCTimestamp,
        open: c.Open,
        high: c.High,
        low: c.Low,
        close: c.Close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.streamSwitch$.next();
    this.streamSwitch$.complete();
    this.resizeObserver?.disconnect();
    this.chart?.remove();
  }
}
