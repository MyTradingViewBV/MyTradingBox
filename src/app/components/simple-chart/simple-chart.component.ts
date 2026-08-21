import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  IChartApi,
  ISeriesApi,
  createChart,
} from 'lightweight-charts';
import {
  Subscription,
  Subject,
  catchError,
  filter,
  forkJoin,
  map,
  of,
  switchMap,
  take,
  takeUntil,
  tap,
  timer,
} from 'rxjs';
import { FooterComponent } from '../footer/footer-compenent';
import { ChartBoxesService } from '../chart/services/chart-boxes.service';
import { BinanceStreamService } from '../chart/services/binance-stream.service';
import {
  aggregateToLiveCandle,
  applyLiveCandleToBaseData,
  dominanceTimeframeToPeriodMs,
  InternalCandle,
  isBinanceExchange,
  isDominanceSymbol,
  mapApiCandlesToInternal,
} from '../chart/utils/custom-timeframe-live';
import {
  isApproximateInterval,
  liveCandleApiToUpdate,
  mapTimeframeToBinanceInterval,
  mergeLiveCandle,
  timeframeToPeriodMs,
} from '../chart/utils/merge-live-candles';
import { formatPriceChange } from '../chart/utils/chart-utils';
import { LiveKlineUpdate } from '../../modules/shared/models/chart/binance-kline.dto';
import { BoxModel } from '../../modules/shared/models/chart/boxModel.dto';
import { SymbolModel } from '../../modules/shared/models/chart/symbol.dto';
import { Exchange } from '../../modules/shared/models/orders/exchange.dto';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { SettingsService } from '../../modules/shared/services/services/settingsService';
import { SettingsActions } from '../../store/settings/settings.actions';
import { BoxRangePrimitive } from './plugins/box-range-primitive';
import {
  internalToLwCandle,
  isIntradayTimeframe,
  prepareLwSeriesData,
} from './utils/lw-candle-mapper';

@Component({
  selector: 'app-simple-chart',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FooterComponent],
  templateUrl: './simple-chart.component.html',
  styleUrls: ['./simple-chart.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SimpleChartComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('chartHost', { static: true }) chartHost!: ElementRef<HTMLDivElement>;

  private readonly marketService = inject(ChartService);
  private readonly boxesService = inject(ChartBoxesService);
  private readonly binanceStream = inject(BinanceStreamService);
  private readonly settingsService = inject(SettingsService);
  private readonly ngZone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly destroy$ = new Subject<void>();
  private readonly cancelCandleLoad$ = new Subject<void>();
  private chart: IChartApi | null = null;
  private candleSeries: ISeriesApi<'Candlestick'> | null = null;
  private boxPrimitive: BoxRangePrimitive | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private liveSubscription: Subscription | null = null;
  private chartReady = false;

  private liveStreamActive = false;

  private baseData: InternalCandle[] = [];
  private _ctfPeriodStart = 0;
  private _ctfPeriodMs = 0;
  private _ctfLiveCandle: InternalCandle | null = null;

  exchanges: Exchange[] = [];
  selectedExchange = new Exchange();
  selectedSymbol: SymbolModel = new SymbolModel();
  selectedSymbolName = '';
  selectedTimeframe = '1h';
  availableSymbols: SymbolModel[] = [];
  boxes: BoxModel[] = [];
  loading = false;
  hasChartData = false;
  currentPrice = 0;
  priceChangeFormatted = '';
  priceBadgeTop = 0;

  readonly timeframes = [
    { label: '12m', value: '12m' },
    { label: '24m', value: '24m' },
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
    { label: '1M', value: '1M' },
  ];

  ngOnInit(): void {
    this.marketService
      .getExchanges()
      .pipe(
        tap((exchanges) => {
          this.exchanges = exchanges || [];
        }),
        switchMap(() => this.settingsService.getSelectedExchange()),
        tap((exchange) => this.resolveSelectedExchange(exchange)),
        takeUntil(this.destroy$),
      )
      .subscribe();

    this.settingsService
      .getSelectedTimeframe()
      .pipe(takeUntil(this.destroy$))
      .subscribe((tf) => {
        if (tf) this.selectedTimeframe = tf;
      });

    this.loadSymbolsAndCandles();
  }

  ngAfterViewInit(): void {
    this.ensureChartInitialized();
  }

  private ensureChartInitialized(): void {
    const host = this.chartHost?.nativeElement;
    if (!host) return;

    const { width, height } = host.getBoundingClientRect();
    if (width < 20 || height < 20) {
      requestAnimationFrame(() => this.ensureChartInitialized());
      return;
    }

    if (!this.chart) {
      this.initChart(width, height);
      this.chartReady = true;
    }

    this.syncChartToData(true);
  }

  ngOnDestroy(): void {
    this.teardownLiveStream();
    this.resizeObserver?.disconnect();
    this.chart?.remove();
    this.destroy$.next();
    this.destroy$.complete();
    this.cancelCandleLoad$.complete();
  }

  onExchangeChange(exchange: Exchange): void {
    this.settingsService.dispatchAppAction(
      SettingsActions.setSelectedExchange({ exchange }),
    );
    this.loading = true;
    this.cdr.markForCheck();
    this.loadSymbolsAndCandles();
  }

  onSymbolChange(symbol: SymbolModel): void {
    if (!symbol?.SymbolName) return;
    this.settingsService.dispatchAppAction(
      SettingsActions.setSelectedSymbol({ symbol }),
    );
    this.selectedSymbol = symbol;
    this.selectedSymbolName = symbol.SymbolName;
    this.reloadChartData(symbol.SymbolName);
  }

  onTimeframeChange(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    this.settingsService.dispatchAppAction(
      SettingsActions.setSelectedTimeframe({ timeframe }),
    );
    if (this.selectedSymbol?.SymbolName) {
      this.reloadChartData(this.selectedSymbol.SymbolName);
    }
  }

  getSymbolIcon(): string | null {
    const icon = this.selectedSymbol?.Icon;
    if (!icon) return null;
    const trimmed = icon.trim();
    if (trimmed.startsWith('data:image')) return trimmed;
    return `data:image/png;base64,${trimmed}`;
  }

  private resolveSelectedExchange(exchange: Exchange | null): void {
    if (exchange) {
      const match = this.exchanges.find(
        (ex) =>
          (exchange.Id != null && ex.Id === exchange.Id) ||
          (exchange.Name && ex.Name === exchange.Name),
      );
      if (match) {
        this.selectedExchange = match;
        if (match !== exchange) {
          this.settingsService.dispatchAppAction(
            SettingsActions.setSelectedExchange({ exchange: match }),
          );
        }
        return;
      }
      if (this.exchanges.length) {
        this.selectedExchange = this.exchanges[0];
        this.settingsService.dispatchAppAction(
          SettingsActions.setSelectedExchange({ exchange: this.selectedExchange }),
        );
        return;
      }
      this.selectedExchange = exchange;
      return;
    }

    if (this.exchanges.length) {
      this.selectedExchange = this.exchanges[0];
      this.settingsService.dispatchAppAction(
        SettingsActions.setSelectedExchange({ exchange: this.selectedExchange }),
      );
    }
  }

  private initChart(width: number, height: number): void {
    const host = this.chartHost.nativeElement;
    this.chart = createChart(host, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#2a2e39' },
        horzLines: { color: '#2a2e39' },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: isIntradayTimeframe(this.selectedTimeframe),
      },
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    this.boxPrimitive = new BoxRangePrimitive();
    this.candleSeries.attachPrimitive(this.boxPrimitive);

    this.chart.subscribeCrosshairMove(() => this.updatePriceBadgePosition());
    this.resizeChartToHost();
    this.resizeObserver = new ResizeObserver(() => {
      this.resizeChartToHost();
      this.boxPrimitive?.updateAllViews();
      this.updatePriceBadgePosition();
    });
    this.resizeObserver.observe(host);
  }

  private resizeChartToHost(): void {
    const host = this.chartHost?.nativeElement;
    if (!host || !this.chart) return;
    const { width, height } = host.getBoundingClientRect();
    if (width > 0 && height > 0) {
      this.chart.applyOptions({ width, height });
    }
  }

  /** Push historical data to the chart; start live stream only after setData succeeds. */
  private syncChartToData(startLive: boolean): void {
    if (!this.chartReady || !this.candleSeries || !this.baseData.length) {
      return;
    }
    const rendered = this.pushCandlesToSeries(this.baseData, true);
    this.hasChartData = rendered;
    if (startLive && rendered) {
      this.setupLiveStream();
    }
    this.cdr.markForCheck();
  }

  private loadSymbolsAndCandles(): void {
    this.marketService
      .getSymbols()
      .pipe(
        tap((symbols) => {
          this.availableSymbols = symbols || [];
        }),
        switchMap((symbols) =>
          this.settingsService.getSelectedSymbol().pipe(
            take(1),
            map((stored) => this.resolveSymbol(symbols, stored)),
            tap((selected) => {
              this.selectedSymbol = selected;
              this.selectedSymbolName = selected?.SymbolName || '';
            }),
            map((selected) => selected.SymbolName),
          ),
        ),
        switchMap((symbolName) =>
          this.loadCandles(symbolName).pipe(
            switchMap(() =>
              this.fetchBoxes(symbolName).pipe(
                take(1),
                map((boxes) => ({ symbolName, boxes })),
              ),
            ),
          ),
        ),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          this.loading = false;
          if (this.chartReady) {
            this.syncChartToData(true);
          } else {
            this.ensureChartInitialized();
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private resolveSymbol(
    symbols: SymbolModel[],
    stored: SymbolModel | null,
  ): SymbolModel {
    if (stored?.SymbolName) {
      const match = symbols.find(
        (s) =>
          (s.SymbolName || '').toUpperCase() ===
          (stored.SymbolName || '').toUpperCase(),
      );
      return match || stored;
    }

    const preferred = ['BTCUSDT', 'BTC-EUR', 'BTCUSD'];
    for (const name of preferred) {
      const found = symbols.find(
        (s) => (s.SymbolName || '').toUpperCase() === name.toUpperCase(),
      );
      if (found) {
        this.settingsService.dispatchAppAction(
          SettingsActions.setSelectedSymbol({ symbol: found }),
        );
        return found;
      }
    }

    const fallback = symbols[0] || new SymbolModel();
    if (symbols.length) {
      this.settingsService.dispatchAppAction(
        SettingsActions.setSelectedSymbol({ symbol: fallback }),
      );
    }
    return fallback;
  }

  private reloadChartData(symbolName: string): void {
    this.teardownLiveStream();
    this.loading = true;
    this.cdr.markForCheck();
    this.cancelCandleLoad$.next();

    forkJoin({
      candles: this.loadCandles(symbolName).pipe(take(1)),
      boxes: this.fetchBoxes(symbolName).pipe(take(1)),
    })
      .pipe(takeUntil(this.cancelCandleLoad$), takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loading = false;
          if (this.chartReady) {
            this.syncChartToData(true);
          } else {
            this.ensureChartInitialized();
          }
          this.cdr.markForCheck();
        },
        error: () => {
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private loadCandles(symbol: string) {
    const fetchTimeframe = this.selectedTimeframe;
    return this.marketService.getCandles(symbol, fetchTimeframe, 1000).pipe(
      map((candles) => mapApiCandlesToInternal(candles || [])),
      tap((mapped) => {
        if (!mapped.length) return;
        this.baseData = mapped;
        const latest = mapped[mapped.length - 1];
        const previous = mapped[mapped.length - 2];
        this.currentPrice = latest.c;
        this.priceChangeFormatted = formatPriceChange(
          previous ? latest.c - previous.c : 0,
          previous?.c || 0,
        );
        this.applyTimeScaleOptions();
      }),
    );
  }

  private fetchBoxes(symbolName: string) {
    if (!symbolName) return of([] as BoxModel[]);
    return this.boxesService.getBoxes(symbolName, 'boxes').pipe(
      tap((boxes) => {
        this.boxes = boxes || [];
        this.boxPrimitive?.setBoxes(this.boxes);
      }),
    );
  }

  private pushCandlesToSeries(candles: InternalCandle[], fitContent: boolean): boolean {
    if (!this.candleSeries) return false;
    const lwData = prepareLwSeriesData(candles);
    if (!lwData.length) return false;
    this.candleSeries.setData(lwData);
    if (fitContent) {
      this.chart?.timeScale().fitContent();
    }
    this.boxPrimitive?.updateAllViews();
    this.updatePriceBadgePosition();
    this.cdr.markForCheck();
    return true;
  }

  /** Align live openTime with the last historical bar when in the same period bucket. */
  private normalizeLiveOpenTime(openTime: number): number {
    const periodMs = timeframeToPeriodMs(this.selectedTimeframe);
    let aligned = openTime;

    if (isApproximateInterval(this.selectedTimeframe)) {
      const lastTime = this.baseData[this.baseData.length - 1]?.x ?? 0;
      if (lastTime && aligned >= lastTime) {
        return lastTime;
      }
    }

    if (periodMs > 0) {
      aligned = Math.floor(aligned / periodMs) * periodMs;
      const lastX = this.baseData[this.baseData.length - 1]?.x ?? 0;
      if (lastX) {
        const liveBucket = Math.floor(aligned / periodMs);
        const lastBucket = Math.floor(lastX / periodMs);
        if (liveBucket === lastBucket) {
          return lastX;
        }
      }
    }

    return aligned;
  }

  private updateLastCandleOnSeries(): void {
    if (!this.candleSeries || !this.baseData.length) return;
    const last = this.baseData[this.baseData.length - 1];
    const bar = internalToLwCandle(last);
    if (!Number.isFinite(bar.time) || bar.time <= 0) return;

    try {
      this.candleSeries.update(bar);
    } catch {
      // Time mismatch — full refresh is safer than a broken series state
      this.pushCandlesToSeries(this.baseData, false);
    }
  }

  private applyTimeScaleOptions(): void {
    this.chart?.timeScale().applyOptions({
      timeVisible: true,
      secondsVisible: isIntradayTimeframe(this.selectedTimeframe),
    });
  }

  private updatePriceBadgePosition(): void {
    if (!this.candleSeries || !this.currentPrice) {
      this.priceBadgeTop = 0;
      return;
    }
    const coord = this.candleSeries.priceToCoordinate(this.currentPrice);
    this.priceBadgeTop = coord ?? 0;
    this.cdr.markForCheck();
  }

  private teardownLiveStream(): void {
    this.liveSubscription?.unsubscribe();
    this.liveSubscription = null;
    this.liveStreamActive = false;
    this.binanceStream.disconnect();
    this._ctfLiveCandle = null;
    this._ctfPeriodStart = 0;
    this._ctfPeriodMs = 0;
  }

  private setupLiveStream(): void {
    this.teardownLiveStream();
    if (!this.chartReady || !this.candleSeries || !this.baseData.length) return;
    if (!this.selectedSymbol?.SymbolName) return;

    this.liveStreamActive = true;
    const exchangeName = this.selectedExchange?.Name;
    const symbol = this.selectedSymbol.SymbolName.toUpperCase();

    if (!isBinanceExchange(exchangeName)) {
      this.setupExchangeLiveStream();
      return;
    }

    if (isDominanceSymbol(symbol)) {
      this.setupDominanceLiveStream();
      return;
    }

    if (this.selectedTimeframe === '12m' || this.selectedTimeframe === '24m') {
      this.setupCustomTimeframeStream(this.selectedTimeframe === '12m' ? 12 : 24);
      return;
    }

    const interval = mapTimeframeToBinanceInterval(this.selectedTimeframe);
    if (!interval) {
      this.liveStreamActive = false;
      return;
    }

    this.liveSubscription = this.binanceStream
      .connectKlineStream(symbol, interval)
      .pipe(
        filter((u) => u.symbol === symbol && u.interval === interval),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (update) => this.onLiveKlineUpdate(update),
      });
  }

  private setupExchangeLiveStream(): void {
    const symbol = this.selectedSymbol.SymbolName.toUpperCase();
    const timeframe = this.selectedTimeframe;

    this.liveSubscription = timer(0, 3000)
      .pipe(
        switchMap(() =>
          this.marketService.getLiveCandle(symbol, timeframe).pipe(
            catchError(() => of(null)),
          ),
        ),
        filter((payload) => payload != null),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (payload) => {
          const periodMs = timeframeToPeriodMs(timeframe);
          const fallbackOpenTime = this.baseData[this.baseData.length - 1]?.x;
          const liveUpdate = liveCandleApiToUpdate(payload, {
            fallbackOpenTime,
            periodMs,
          });
          if (liveUpdate) this.onLiveKlineUpdate(liveUpdate);
        },
      });
  }

  private setupCustomTimeframeStream(periodMinutes: number): void {
    const symbol = this.selectedSymbol.SymbolName.toUpperCase();
    const periodMs = periodMinutes * 60 * 1000;
    const nowMs = Date.now();

    this._ctfPeriodStart = Math.floor(nowMs / periodMs) * periodMs;
    this._ctfPeriodMs = periodMs;
    this._ctfLiveCandle = null;

    const elapsedMinutes = Math.floor((nowMs - this._ctfPeriodStart) / 60000);
    const fetchElapsed$ =
      elapsedMinutes > 0
        ? this.marketService.getCandles(symbol, '1m', elapsedMinutes + 2)
        : of([]);

    this.liveSubscription = fetchElapsed$
      .pipe(
        map((candles) => mapApiCandlesToInternal(candles || [])),
        tap((mapped) => {
          const inPeriod = mapped.filter((c) => c.x >= this._ctfPeriodStart);
          if (inPeriod.length > 0) {
            this._ctfLiveCandle = aggregateToLiveCandle(inPeriod, this._ctfPeriodStart);
            this.applyInternalLiveCandle(this._ctfLiveCandle);
          }
        }),
        switchMap(() => this.binanceStream.connectKlineStream(symbol, '1m')),
        filter((u) => u.symbol === symbol && u.interval === '1m'),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (update) => this.onCustomTimeframeLiveUpdate(update, periodMinutes),
      });
  }

  private setupDominanceLiveStream(): void {
    const symbol = this.selectedSymbol.SymbolName.toUpperCase();
    const periodMs = dominanceTimeframeToPeriodMs(this.selectedTimeframe);
    if (!periodMs) return;

    this._ctfPeriodMs = periodMs;
    this._ctfPeriodStart = 0;
    this._ctfLiveCandle = null;

    this.liveSubscription = timer(0, 90_000)
      .pipe(
        switchMap(() => {
          const nowMs = Date.now();
          const periodStart = Math.floor(nowMs / periodMs) * periodMs;
          const elapsedMinutes = Math.ceil((nowMs - periodStart) / 60_000) + 2;
          return this.marketService
            .getCandles(symbol, '1m', Math.max(3, elapsedMinutes))
            .pipe(
              map((candles) => ({
                periodStart,
                candles: mapApiCandlesToInternal(candles || []),
              })),
              catchError(() => of(null)),
            );
        }),
        filter(
          (result): result is { periodStart: number; candles: InternalCandle[] } =>
            result !== null,
        ),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: ({ periodStart, candles }) => {
          const inPeriod = candles.filter((c) => c.x >= periodStart);
          if (!inPeriod.length) return;

          const liveCandle = aggregateToLiveCandle(inPeriod, periodStart);
          if (this._ctfPeriodStart > 0 && periodStart > this._ctfPeriodStart) {
            this._ctfPeriodStart = periodStart;
            this._ctfLiveCandle = liveCandle;
            this.loadCandles(symbol).pipe(take(1), takeUntil(this.destroy$)).subscribe({
              next: () => this.pushCandlesToSeries(this.baseData, false),
            });
            return;
          }

          this._ctfPeriodStart = periodStart;
          this._ctfLiveCandle = liveCandle;
          this.applyInternalLiveCandle(liveCandle);
        },
      });
  }

  private onCustomTimeframeLiveUpdate(
    update: LiveKlineUpdate,
    periodMinutes: number,
  ): void {
    this.ngZone.runOutsideAngular(() => {
      const periodMs = this._ctfPeriodMs;
      const updatePeriodStart = Math.floor(update.openTime / periodMs) * periodMs;

      if (updatePeriodStart > this._ctfPeriodStart) {
        this._ctfPeriodStart = updatePeriodStart;
        this._ctfLiveCandle = null;
        const symbol = this.selectedSymbol.SymbolName.toUpperCase();

        setTimeout(() => {
          this.marketService
            .getCandles(symbol, `${periodMinutes}m`, 1000)
            .pipe(take(1), takeUntil(this.destroy$), map(mapApiCandlesToInternal))
            .subscribe({
              next: (mapped) => {
                if (!mapped.length) return;
                this.ngZone.run(() => {
                  this.baseData = mapped;
                  const prevClosed = mapped[mapped.length - 1];
                  const seedOpen = prevClosed?.c ?? update.open;
                  this._ctfLiveCandle = {
                    x: this._ctfPeriodStart,
                    o: seedOpen,
                    h: Math.max(seedOpen, update.high),
                    l: Math.min(seedOpen, update.low),
                    c: update.close,
                    v: update.volume,
                  };
                  this.applyInternalLiveCandle(this._ctfLiveCandle);
                });
              },
            });
        }, 2000);
        return;
      }

      if (!this._ctfLiveCandle) {
        const prevClosed = this.baseData[this.baseData.length - 1];
        const seedOpen = prevClosed?.c ?? update.open;
        this._ctfLiveCandle = {
          x: this._ctfPeriodStart,
          o: seedOpen,
          h: Math.max(seedOpen, update.high),
          l: Math.min(seedOpen, update.low),
          c: update.close,
          v: update.volume,
        };
      } else if (update.isClosed) {
        this._ctfLiveCandle = {
          x: this._ctfPeriodStart,
          o: this._ctfLiveCandle.o,
          h: Math.max(this._ctfLiveCandle.h, update.high),
          l: Math.min(this._ctfLiveCandle.l, update.low),
          c: update.close,
          v: (this._ctfLiveCandle.v ?? 0) + update.volume,
        };
      } else {
        this._ctfLiveCandle = {
          x: this._ctfPeriodStart,
          o: this._ctfLiveCandle.o,
          h: Math.max(this._ctfLiveCandle.h, update.high),
          l: Math.min(this._ctfLiveCandle.l, update.low),
          c: update.close,
          v: this._ctfLiveCandle.v ?? 0,
        };
      }

      this.applyInternalLiveCandle(this._ctfLiveCandle);
    });
  }

  private onLiveKlineUpdate(liveUpdate: {
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isClosed?: boolean;
  }): void {
    if (!this.baseData.length || !this.candleSeries) return;

    this.ngZone.runOutsideAngular(() => {
      const openTime = this.normalizeLiveOpenTime(liveUpdate.openTime);
      const periodMs = timeframeToPeriodMs(this.selectedTimeframe);

      const merged = mergeLiveCandle(
        this.baseData,
        {
          openTime,
          closeTime: liveUpdate.closeTime,
          open: liveUpdate.open,
          high: liveUpdate.high,
          low: liveUpdate.low,
          close: liveUpdate.close,
          volume: liveUpdate.volume,
          isClosed: liveUpdate.isClosed,
        },
        { periodMs },
      );

      if (merged === this.baseData) return;
      this.baseData = merged as InternalCandle[];
      const last = this.baseData[this.baseData.length - 1];
      const prev = this.baseData[this.baseData.length - 2];
      this.currentPrice = last.c;
      this.priceChangeFormatted = formatPriceChange(
        prev ? last.c - prev.c : 0,
        prev?.c || 0,
      );

      this.updateLastCandleOnSeries();
      this.ngZone.run(() => {
        this.updatePriceBadgePosition();
        this.cdr.markForCheck();
      });
    });
  }

  private applyInternalLiveCandle(liveCandle: InternalCandle): void {
    this.baseData = applyLiveCandleToBaseData(this.baseData, liveCandle);
    this.currentPrice = liveCandle.c;
    const prev = this.baseData[this.baseData.length - 2];
    this.priceChangeFormatted = formatPriceChange(
      prev ? liveCandle.c - prev.c : 0,
      prev?.c || 0,
    );
    this.updateLastCandleOnSeries();
    this.ngZone.run(() => {
      this.updatePriceBadgePosition();
      this.cdr.markForCheck();
    });
  }
}
