/* Removed explicit-function-return-type disable (no longer needed) */

import { CommonModule } from '@angular/common';
import { FooterComponent } from '../footer/footer-compenent';
import { FormsModule } from '@angular/forms';
import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  NgZone,
} from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
  LineController,
  LineElement,
  PointElement,
} from 'chart.js';
import {
  CandlestickController,
  CandlestickElement,
} from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
import { chartCustomPlugins } from './services/chart-plugins';
import {
  ChartInteractionService,
  GestureKind,
} from './services/chart-interaction.service';
import { DrawingToolsService } from './services/drawing-tools.service';
import { createDrawingToolsPlugin } from './services/drawing-tools.plugin';
import { DrawingToolboxComponent } from './drawing-toolbox.component';
import { formatPriceChange, buildBoxDatasets } from './utils/chart-utils';
import { ChartIndicatorsService } from './services/chart-indicators.service';
import { ChartBoxesService } from './services/chart-boxes.service';
import { ChartLayoutService } from './services/chart-layout.service';
import 'chartjs-adapter-date-fns';
import { ChartService } from '../../modules/shared/services/http/chart.service';
// Angular Material removed
import {
  tap,
  switchMap,
  map,
  of,
  forkJoin,
  Observable,
  Subject,
  takeUntil,
  take,
  filter,
} from 'rxjs';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { OrderModel } from 'src/app/modules/shared/models/orders/order.dto';
import { KeyZonesModel } from 'src/app/modules/shared/models/chart/keyZones.dto';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { Router } from '@angular/router';
import { BinanceStreamService } from './services/binance-stream.service';
import { mapTimeframeToBinanceInterval, mergeLiveCandle } from './utils/merge-live-candles';
import { ChangeDetectorRef } from '@angular/core';

ChartJS.register(
  TimeScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
  LineController,
  LineElement,
  PointElement,
  CandlestickController,
  CandlestickElement,
  zoomPlugin,
  ...chartCustomPlugins,
);

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective, DrawingToolboxComponent],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './chart-component.html',
  styleUrls: ['./chart-component.scss'],
})
export class ChartComponent implements OnInit, AfterViewInit, OnDestroy {
  exchanges: Exchange[] = [];
  selectedExchange = new Exchange();
  /**
   * Called when the exchange is changed from the dropdown.
   * Dispatches NGRX action to update exchange and clears selected symbol.
   */
  onExchangeChange(exchange: Exchange): void {
    console.log('Exchange changed to:', exchange);
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedExchange({ exchange }),
    );
    // Setup or disconnect Binance stream based on selected exchange
    this.setupBinanceStream();
    // Clear selected symbol in NGRX store
    // this._settingsService.dispatchAppAction(
    //   SettingsActions.setSelectedSymbol({ symbol: new SymbolModel() })
    // );
    // // Optionally, reload symbols for the new exchange
    // this.loadSymbolsAndBoxes();
  }
  // Mark static:true so it's available during ngOnInit (we access the chart soon after data loads)
  @ViewChild(BaseChartDirective, { static: true }) chart?: BaseChartDirective;
  @ViewChild('chartCanvas', { read: ElementRef }) chartCanvas?: ElementRef;
  showSettings = false;
  // Compact (fullscreen-ish) mode: hides symbol/timeframe selects & settings icon, maximizes chart
  // compactMode now provided by ChartLayoutService (footer toggles)
  chartData: any = { datasets: [] };
  boxes: any; //BoxModel[] = [];
  // store base candle data for overlays
  baseData: any[] = [];
  isFullscreen = false;
  // Orders
  showOrders = false;
  orders: OrderModel[] = [];

  // New: mode for boxes fetching: 'boxes' = current (v2), 'all' = getBoxes (v1)
  boxMode: 'boxes' | 'all' = 'boxes';

  // KeyZones toggle and storage
  showKeyZones = false; // default off
  keyZones: KeyZonesModel | null = null;

  fullDataRange: { min: number; max: number } = { min: 0, max: 0 };
  initialYRange: { min: number; max: number } = { min: 0, max: 0 };
  // Extended range allowing overscroll/extra space beyond first/last candle
  extendedDataRange: { min: number; max: number } = { min: 0, max: 0 };

  // TradingView-style interface data
  selectedSymbol: SymbolModel = new SymbolModel();
  // track selected symbol by name for template binding (simpler equality)
  selectedSymbolName = '';

  selectedTimeframe = '1h';
  availableSymbols: SymbolModel[] = [];
  currentPrice = 0;
  priceChange = 0;
  priceChangeFormatted = '';
  sellPrice = 0;
  buyPrice = 0;
  spread = 0;

  timeframes = [
    { label: '12m', value: '12m' },
    { label: '24m', value: '24m' },
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
    { label: '1M', value: '1M' },
  ];

  // Ensure currently selected timeframe stays valid when switching symbols
  private ensureTimeframeAllowed(): void {
    const allowed = this.visibleTimeframes.map((t) => t.value);
    if (!allowed.includes(this.selectedTimeframe)) {
      // fallback to '1d' if not allowed
      this.selectedTimeframe = '1d';
    }
  }

  symbols: SymbolModel[] = [];
  // selectedSymbol: SymbolModel = new SymbolModel(); // ? now full object
  showBoxes = true;

  // Indicator toggle and storage
  showIndicators = true; // default ON as requested
  indicatorSignals: any[] = [];

  // Market Cipher toggle and storage
  showMarketCipher = false;
  marketCipherSignals: any[] = [];

  // Divergences toggle and storage
  showDivergences = false;
  divergences: any[] = [];

  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      intersect: false,
      axis: 'x',
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }, // Disable default tooltips for cleaner look
      datalabels: { display: false },
      zoom: {
        pan: { enabled: false },
        zoom: {
          wheel: { enabled: false },
          pinch: { enabled: false },
          drag: { enabled: false },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        display: true,
        grid: {
          color: 'rgba(42,46,57,0.6)',
          drawBorder: false,
        },
        ticks: {
          source: 'data',
          callback: (val: any) => this.formatTimeTick(val),
          color: '#787b86',
          maxTicksLimit: 20,
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 8,
          font: { size: 11 },
          padding: 4,
        },
      },
      y: {
        position: 'right',
        beginAtZero: false,
        grid: {
          color: 'rgba(42,46,57,0.6)',
          borderColor: 'transparent',
          drawBorder: false,
        },
        ticks: {
          color: '#787b86',
          callback: (
            val: any,
            index: number,
            ticks: Array<{ value: number }>,
          ) => this.formatPriceTick(val, index, ticks),
          maxTicksLimit: 14,
          padding: 8,
          font: { size: 11 },
        },
      },
      // hidden indicator axis so indicator datasets do not affect main y-scale
      indicator: {
        display: false,
        position: 'left',
        grid: { display: false },
        ticks: { display: false },
        type: 'linear',
      },
    },
    layout: {
      backgroundColor: '#131722',
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
    },
  };

  private _initTries = 0; // retry counter for initializeChart scheduling
  private destroy$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;
  private containerSized = false;
  // Prevent duplicate network calls on rapid/duplicate symbol change events
  private lastRequestedSymbol: string | null = null;
  // Binance WebSocket stream subscription
  private binanceStreamSubscription: any = null;

  private readonly marketService = inject(ChartService);
  private readonly _settingsService = inject(SettingsService);
  private readonly interaction = inject(ChartInteractionService);
  private readonly boxesService = inject(ChartBoxesService);
  private readonly indicatorsService = inject(ChartIndicatorsService);
  private readonly layout = inject(ChartLayoutService);
  private readonly keyZoneSettings = inject(KeyZoneSettingsService);
  private readonly _router = inject(Router);
  private readonly binanceStream = inject(BinanceStreamService);
  private readonly ngZone = inject(NgZone);
  readonly drawingTools = inject(DrawingToolsService);
  private drawingPluginRegistered = false;

  constructor(private cdr: ChangeDetectorRef) {}

  // Build a data URL for the current symbol icon
  getSymbolIcon(): string | null {
    const icon = this.selectedSymbol?.Icon;
    if (!icon) return null;
    const trimmed = (icon || '').trim();
    // If already a full data URL, return as-is
    if (trimmed.startsWith('data:image')) return trimmed;
    // Default to PNG if MIME type is not provided
    return `data:image/png;base64,${trimmed}`;
  }

  // New: expose only the percent portion for topbar template
  get priceChangePercent(): string {
    // priceChangeFormatted is like: "+1.23 (+0.45%)"
    // we want only the percent inside parentheses, e.g. "+0.45%" (keeping the sign)
    if (!this.priceChangeFormatted) {
      // fallback compute quickly
      const prev = 0; // cannot compute here, but keep empty
      const percent = prev ? (this.priceChange / prev) * 100 : 0;
      const sign = this.priceChange >= 0 ? '+' : '';
      return `${sign}${percent.toFixed(2)}%`;
    }
    const match = this.priceChangeFormatted.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      // ensure trailing % exists
      const text = match[1].trim();
      return text.indexOf('%') !== -1 ? text : `${text}%`;
    }

    // Avoid subscribing here to prevent repeated triggers and leaks

    // default
    const sign = this.priceChange >= 0 ? '+' : '';
    const prev = 0;
    const percent = prev ? (this.priceChange / prev) * 100 : 0;
    return `${sign}${percent.toFixed(2)}%`;
  }

  // Dynamically format price ticks: 2 decimals for >= 1, more for tiny values
  private formatPriceTick(
    val: any,
    index?: number,
    ticks?: Array<{ value: number }>,
  ): string {
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);
    const abs = Math.abs(num);
    if (abs === 0) return '0.00';
    if (abs >= 1) return num.toFixed(2);

    // Derive step size from ticks array if available
    let stepHint: number | null = null;
    if (Array.isArray(ticks) && ticks.length >= 2) {
      const prev =
        index! > 0 ? Number(ticks[index! - 1]?.value) : Number(ticks[0]?.value);
      const next =
        index! + 1 < ticks.length
          ? Number(ticks[index! + 1]?.value)
          : Number(ticks[ticks.length - 1]?.value);
      const diffs: number[] = [];
      if (Number.isFinite(prev)) diffs.push(Math.abs(num - prev));
      if (Number.isFinite(next)) diffs.push(Math.abs(next - num));
      const diff = diffs.length ? Math.min(...diffs) : null;
      if (diff && Number.isFinite(diff) && diff > 0) stepHint = diff;
    }

    // Base decimals from magnitude
    const mag = -Math.log10(abs);
    let decimals = Math.min(8, Math.max(2, Math.ceil(mag + 2)));
    // Enforce minimum decimals based on step size
    if (stepHint != null) {
      if (stepHint < 0.000001) decimals = Math.max(decimals, 8);
      else if (stepHint < 0.00001) decimals = Math.max(decimals, 7);
      else if (stepHint < 0.0001) decimals = Math.max(decimals, 6);
      else if (stepHint < 0.001) decimals = Math.max(decimals, 5);
      else if (stepHint < 0.01) decimals = Math.max(decimals, 4);
      else if (stepHint < 0.1) decimals = Math.max(decimals, 3);
    }
    // Output with fixed decimals; avoid trimming which caused 0s
    return num.toFixed(decimals);
  }

  /**
   * Format time tick for x-axis using the original time string from candle data.
   * Looks up the candle by timestamp and uses its original Time value.
   */
  private formatTimeTick(val: any): string {
    if (!val) return '';
    
    try {
      // Find the corresponding candle with this x timestamp
      const candle = this.baseData?.find((c: any) => c.x === val);
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      
      const parseDate = (raw: any): Date | null => {
        const d = raw instanceof Date ? raw : new Date(raw);
        return d && !isNaN(d.getTime()) ? d : null;
      };

      const date = parseDate(candle?.timeStr) ?? parseDate(val);
      if (!date) return String(val);

      const timeframe = (this.selectedTimeframe || '1h').toLowerCase();
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const dd = date.getDate();
      const mon = months[date.getMonth()];

      if (timeframe.endsWith('m')) {
        return `${hh}:${min}`;
      }
      
      if (timeframe.endsWith('h')) {
        return `${hh}:${min}`;
      }
      
      // Days/weeks/months: show "dd Mon" or "Mon 'YY" at year boundary
      if (timeframe === '1m' || timeframe === '1w') {
        return dd === 1
          ? `${mon} '${String(date.getFullYear()).slice(-2)}`
          : `${dd} ${mon}`;
      }

      return `${dd} ${mon}`;
    } catch {
      return String(val);
    }
  }

  // Expose interaction state (service holds runtime values after refactor)
  get isInteracting(): boolean {
    return this.interaction.isInteracting;
  }
  get gestureType(): GestureKind | null {
    return this.interaction.gestureType;
  }

  // Compute pixel position for current price to place badge on y-axis
  getCurrentPricePixel(): number {
    const chartRef: any = this.chart?.chart;
    try {
      const yScale = chartRef?.scales?.y;
      if (!yScale || !Number.isFinite(this.currentPrice)) return 0;
      return yScale.getPixelForValue(this.currentPrice);
    } catch {
      return 0;
    }
  }

  // compareWith function for mat-select to compare symbols by SymbolName instead of object reference
  public compareSymbols = (
    a: SymbolModel | null,
    b: SymbolModel | null,
  ): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      (a.SymbolName || '').toString().toUpperCase() ===
      (b.SymbolName || '').toString().toUpperCase()
    );
  };

  ngOnInit(): void {
    // Chain: load exchanges then read selected exchange from store; fallback to first exchange if none set.
    this.marketService
      .getExchanges()
      .pipe(
        tap((exchanges) => {
          this.exchanges = exchanges || [];
          console.log('Loaded exchanges:', this.exchanges);
        }),
        switchMap(() => this._settingsService.getSelectedExchange()),
        tap((exchange) => {
          if (exchange) {
            // Try to find matching instance in loaded exchanges array for proper identity binding in native select
            const match = this.exchanges.find((ex: any) => {
              if (
                exchange &&
                (exchange as any).Id != null &&
                ex.Id === (exchange as any).Id
              )
                return true;
              if (
                exchange &&
                (exchange as any).Name &&
                ex.Name === (exchange as any).Name
              )
                return true;
              return false;
            });
            if (match) {
              this.selectedExchange = match as Exchange;
              // If store object is not the same reference, dispatch updated instance so other consumers can benefit
              if (match !== exchange) {
                this._settingsService.dispatchAppAction(
                  SettingsActions.setSelectedExchange({
                    exchange: match as Exchange,
                  }),
                );
              }
            } else {
              // Store had an exchange but it did not exist in freshly loaded list; fall back to first
              if (this.exchanges.length) {
                this.selectedExchange = this.exchanges[0] as Exchange;
                this._settingsService.dispatchAppAction(
                  SettingsActions.setSelectedExchange({
                    exchange: this.selectedExchange,
                  }),
                );
              } else {
                this.selectedExchange = exchange; // keep original
              }
            }
            console.log('Selected exchange (resolved):', this.selectedExchange);
          } else if (this.exchanges.length) {
            // Fallback: pick first exchange and dispatch to store for persistence via NGRX mechanisms.
            const first = this.exchanges[0];
            this.selectedExchange = first;
            this._settingsService.dispatchAppAction(
              SettingsActions.setSelectedExchange({ exchange: first }),
            );
            console.log(
              'No exchange in store; dispatched first exchange:',
              first,
            );
          }
        }),

        takeUntil(this.destroy$),
      )
      .subscribe({ error: (e) => console.warn('Exchange init error', e) });

    // Apply persisted selected timeframe from settings
    try {
      this._settingsService
        .getSelectedTimeframe()
        .pipe(takeUntil(this.destroy$))
        .subscribe((tf) => {
          if (tf) {
            // Validate that the timeframe is a valid Binance interval
            const interval = mapTimeframeToBinanceInterval(tf);
            if (interval) {
              this.selectedTimeframe = interval;
            } else {
              // Invalid timeframe; fallback to '1h'
              console.warn('[Chart] Invalid persisted timeframe:', tf, '- falling back to 1h');
              this.selectedTimeframe = '1h';
              this._settingsService.dispatchAppAction(
                SettingsActions.setSelectedTimeframe({ timeframe: '1h' }),
              );
              return;
            }
            // Ensure persistence consistency
            this._settingsService.dispatchAppAction(
              SettingsActions.setSelectedTimeframe({ timeframe: interval }),
            );
          }
        });
    } catch {}

    this.loadSymbolsAndBoxes();

    // React to Key Zone settings changes (master/timeframes)
    try {
      this.keyZoneSettings.settings$
        .pipe(takeUntil(this.destroy$))
        .subscribe((s) => {
          // If disabled, remove key zone datasets immediately
          if (!s.enabled) {
            this.safeUpdateDatasets(() => {
              this.chartData.datasets = this.chartData.datasets.filter(
                (d: any) => !d.isKeyZone,
              );
            });
            return;
          }
          // If enabled and we have keyZones cached, rebuild datasets filtered by per-timeframe toggles
          if (this.keyZones && this.showKeyZones) {
            this.addKeyZoneDatasets();
          }
        });
    } catch {}

    // Reactively filter Capital Flow Signals by tier without refetch
    try {
      this.interaction.capitalFlowFilter$
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => {
          if (!this.showIndicators || !this.indicatorSignals?.length) return;
          const newDatasets = this.indicatorsService.buildCapitalFlowDatasets({
            rawSignals: this.indicatorSignals,
            timeframe: this.selectedTimeframe,
            baseData: this.baseData,
            filter: this.interaction.capitalFlowFilter,
          });
          this.safeUpdateDatasets(() => {
            this.chartData.datasets = (this.chartData.datasets || []).filter(
              (d: any) => !d.isIndicator,
            );
            this.chartData.datasets =
              this.chartData.datasets.concat(newDatasets);
          });
          try {
            const chartRef = this.chart?.chart as any;
            if (chartRef && chartRef.scales?.y) {
              this.interaction.autoFitYScale(chartRef);
              chartRef.update('none');
            }
          } catch {}
        });
    } catch {}
  }

  ngOnDestroy(): void {
    try {
      // Cleanup Binance stream subscription
      if (this.binanceStreamSubscription) {
        this.binanceStreamSubscription.unsubscribe();
      }
      this.binanceStream.disconnect();
    } catch {}
    try {
      this.destroy$.next();
      this.destroy$.complete();
    } catch {}
    try {
      this.resizeObserver?.disconnect();
    } catch {}
  }

  ngAfterViewInit(): void {
    // Ensure the chart container has a real size before first render.
    const host = this.chartCanvas?.nativeElement as HTMLElement | undefined;
    if (host) {
      const markSized = () => {
        const rect = host.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          this.containerSized = true;
        }
      };
      markSized();
      try {
        this.resizeObserver = new ResizeObserver(() => {
          markSized();
          const chartRef = this.chart?.chart as any;
          if (chartRef) {
            try {
              chartRef.resize();
            } catch {}
            try {
              this.interaction.updateCandleWidth(chartRef);
            } catch {}
            try {
              chartRef.update('none');
            } catch {}
          }
        });
        this.resizeObserver.observe(host);
      } catch {}
    }

    // Hook into interaction updates to refresh key zone visibility when panning/zooming
    try {
      this.interaction.onAfterInteractionUpdate = () => {
        // Rebuild key zone datasets based on current visible range so they
        // disappear when out of view and reappear when zooming back in.
        if (this.showKeyZones && this.keyZones) {
          this.addKeyZoneDatasets();
        }
      };
    } catch {}

    // Register drawing tools Chart.js plugin once
    if (!this.drawingPluginRegistered) {
      const drawingPlugin = createDrawingToolsPlugin(this.drawingTools);
      ChartJS.register(drawingPlugin);
      this.drawingPluginRegistered = true;
    }

    // Escape key cancels active drawing tool
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && this.drawingTools.activeToolValue) {
        this.drawingTools.cancelDrawing();
        const chartRef = this.chart?.chart as any;
        if (chartRef) chartRef.draw();
      }
    };
    document.addEventListener('keydown', escHandler);
    this.destroy$.subscribe(() => document.removeEventListener('keydown', escHandler));

    // Redraw chart when drawings change so completed drawings render immediately
    this.drawingTools.drawings.pipe(takeUntil(this.destroy$)).subscribe(() => {
      const chartRef = this.chart?.chart as any;
      if (chartRef) chartRef.draw();
    });
  }

  safeUpdateDatasets(modifier: () => void, preserveScales = true): void {
    const chartRef = this.chart?.chart as any;
    let saved: any = null;
    if (preserveScales && chartRef && chartRef.scales) {
      try {
        const xScale = chartRef.scales.x;
        const yScale = chartRef.scales.y;
        saved = {
          xMin:
            xScale && typeof xScale.min === 'number'
              ? xScale.min
              : xScale?.options?.min,
          xMax:
            xScale && typeof xScale.max === 'number'
              ? xScale.max
              : xScale?.options?.max,
          yMin:
            yScale && typeof yScale.min === 'number'
              ? yScale.min
              : yScale?.options?.min,
          yMax:
            yScale && typeof yScale.max === 'number'
              ? yScale.max
              : yScale?.options?.max,
        };
      } catch (e) {
        saved = null;
      }
    }

    // If we captured runtime ranges, persist them into chartOptions so ng2-charts recreation preserves view
    if (preserveScales && saved) {
      try {
        this.chartOptions = this.chartOptions || {};
        this.chartOptions.scales = this.chartOptions.scales || {};
        this.chartOptions.scales.x = this.chartOptions.scales.x || {};
        this.chartOptions.scales.y = this.chartOptions.scales.y || {};

        if (saved.xMin !== undefined)
          this.chartOptions.scales.x.min = saved.xMin;
        if (saved.xMax !== undefined)
          this.chartOptions.scales.x.max = saved.xMax;
        if (saved.yMin !== undefined)
          this.chartOptions.scales.y.min = saved.yMin;
        if (saved.yMax !== undefined)
          this.chartOptions.scales.y.max = saved.yMax;

        // Force change detection by replacing the object reference so ng2-charts will not recreate with default autoscale
        this.chartOptions = {
          ...this.chartOptions,
          scales: { ...(this.chartOptions.scales || {}) },
        };
      } catch (e) {
        // ignore
      }
    }

    // apply dataset changes
    modifier();

    // ensure change detection for ng2-charts
    this.chartData = { datasets: this.chartData.datasets.slice() };

    // reapply saved axis ranges to current chart instance as well
    if (preserveScales && chartRef && chartRef.scales && saved) {
      try {
        if (!chartRef.config) chartRef.config = { options: { scales: {} } };
        chartRef.config.options = chartRef.config.options || {};
        chartRef.config.options.scales = chartRef.config.options.scales || {};

        if (saved.xMin !== undefined)
          chartRef.config.options.scales.x = {
            ...(chartRef.config.options.scales.x || {}),
            min: saved.xMin,
          };
        if (saved.xMax !== undefined)
          chartRef.config.options.scales.x = {
            ...(chartRef.config.options.scales.x || {}),
            max: saved.xMax,
          };
        if (saved.yMin !== undefined)
          chartRef.config.options.scales.y = {
            ...(chartRef.config.options.scales.y || {}),
            min: saved.yMin,
          };
        if (saved.yMax !== undefined)
          chartRef.config.options.scales.y = {
            ...(chartRef.config.options.scales.y || {}),
            max: saved.yMax,
          };

        if (chartRef.scales.x) {
          chartRef.scales.x.options = chartRef.scales.x.options || {};
          if (saved.xMin !== undefined)
            chartRef.scales.x.options.min = saved.xMin;
          if (saved.xMax !== undefined)
            chartRef.scales.x.options.max = saved.xMax;
          try {
            if (typeof saved.xMin === 'number')
              chartRef.scales.x.min = saved.xMin;
          } catch (e) {}
          try {
            if (typeof saved.xMax === 'number')
              chartRef.scales.x.max = saved.xMax;
          } catch (e) {}
        }
        if (chartRef.scales.y) {
          chartRef.scales.y.options = chartRef.scales.y.options || {};
          if (saved.yMin !== undefined)
            chartRef.scales.y.options.min = saved.yMin;
          if (saved.yMax !== undefined)
            chartRef.scales.y.options.max = saved.yMax;
          try {
            if (typeof saved.yMin === 'number')
              chartRef.scales.y.min = saved.yMin;
          } catch (e) {}
          try {
            if (typeof saved.yMax === 'number')
              chartRef.scales.y.max = saved.yMax;
          } catch (e) {}
        }
      } catch (e) {
        // ignore
      }
      try {
        chartRef.update('none');
      } catch (e) {
        try {
          this.chart?.update();
        } catch (ee) {}
      }
    } else {
      try {
        this.chart?.update();
      } catch (e) {
        /* ignore */
      }
    }
  }

  // New helper: keep the hidden 'indicator' axis in sync with main y-axis so indicator glyphs remain pinned to candle prices when panning/zooming
  syncIndicatorAxis(chartRef: any): void {
    if (!chartRef || !chartRef.scales) return;
    try {
      const yScale = chartRef.scales.y;
      if (!yScale) return;

      const yMin =
        typeof yScale.min === 'number' ? yScale.min : yScale.options?.min;
      const yMax =
        typeof yScale.max === 'number' ? yScale.max : yScale.options?.max;
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return;

      // Update runtime config options
      chartRef.config = chartRef.config || {};
      chartRef.config.options = chartRef.config.options || {};
      chartRef.config.options.scales = chartRef.config.options.scales || {};
      chartRef.config.options.scales.indicator =
        chartRef.config.options.scales.indicator || {};
      chartRef.config.options.scales.indicator.min = yMin;
      chartRef.config.options.scales.indicator.max = yMax;

      // Update runtime scale object if present
      const indScale = chartRef.scales.indicator;
      if (indScale) {
        indScale.options = indScale.options || {};
        indScale.options.min = yMin;
        indScale.options.max = yMax;
        try {
          indScale.min = yMin;
          indScale.max = yMax;
        } catch (e) {
          /* ignore */
        }
      }
    } catch (e) {
      // ignore errors
    }
  }

  loadSymbolsAndBoxes(): void {
    this.marketService
      .getSymbols()
      .pipe(
        tap((symbols: any[]) => {
          this.availableSymbols = symbols || [];
          console.log('symbols:', symbols);
        }),
        switchMap((symbols: any[]) =>
          this._settingsService.getSelectedSymbol().pipe(
            // Read the initially selected symbol once; avoid reacting to later store updates
            take(1),
            map((stored: any) => {
              // If store already has a symbol, ensure we return the full object from fetched list (matching by name)
              if (stored && stored.SymbolName) {
                const match = (symbols || []).find(
                  (s: any) =>
                    (s.SymbolName || '').toString().toUpperCase() ===
                    (stored.SymbolName || '').toString().toUpperCase(),
                );
                return (match as SymbolModel) || (stored as SymbolModel);
              }
              // Fallback: choose preferred BTC-like symbol or first available, then dispatch to store
              const preferred = ['BTCUSDT', 'BTC-EUR', 'BTCUSD'];
              let chosen: SymbolModel | null = null;
              if (symbols && symbols.length) {
                for (const p of preferred) {
                  const found = symbols.find(
                    (s: any) =>
                      (s.SymbolName || '').toString().toUpperCase() ===
                      p.toUpperCase(),
                  );
                  if (found) {
                    chosen = found as SymbolModel;
                    break;
                  }
                }
                if (!chosen) chosen = symbols[0] as SymbolModel;
              } else {
                chosen = new SymbolModel();
              }
              this._settingsService.dispatchAppAction(
                SettingsActions.setSelectedSymbol({ symbol: chosen }),
              );
              return chosen as SymbolModel;
            }),
            tap((selected: SymbolModel) => {
              this.selectedSymbol = selected;
              this.selectedSymbolName = selected?.SymbolName || '';
            }),
            map((selected: SymbolModel) => selected.SymbolName),
          ),
        ),
        switchMap((symbolName: string) => {
          console.log('?? Loading candles for:', symbolName);
          return this.loadCandles(symbolName).pipe(
            tap(() => console.log('[Chart] loadCandles completed for:', symbolName)),
            switchMap(() => {
              console.log('[Chart] Starting forkJoin for boxes/orders, showOrders=', this.showOrders);
              return forkJoin({
                boxes: this.fetchBoxes(symbolName).pipe(
                  tap(result => console.log('[Chart] fetchBoxes result:', result)),
                  take(1) // Ensure observable completes after emitting
                ),
                orders: this.showOrders ? this.fetchOrders(symbolName).pipe(
                  tap(result => console.log('[Chart] fetchOrders result:', result)),
                  take(1) // Ensure observable completes after emitting
                ) : of([]).pipe(
                  tap(() => console.log('[Chart] orders skipped (showOrders=false)')),
                  take(1) // Ensure this completes
                ),
              }).pipe(
                tap(result => console.log('[Chart] forkJoin completed with result:', result))
              );
            }),
          );
        }),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (result) => {
          // Start Binance stream after initial load completes
          console.log('[Chart] ✅ loadSymbolsAndBoxes .subscribe().next() FIRED with result:', result);
          this.setupBinanceStream();
        },
        error: (err) => console.warn('[Chart] ❌ loadSymbolsAndBoxes error:', err),
        complete: () => console.log('[Chart] loadSymbolsAndBoxes subscribe completed'),
      });
  }

  // Called when user switches mode in UI
  onBoxModeChange(mode: 'boxes' | 'all'): void {
    const previous = this.boxMode;
    this.boxMode = mode;

    // Ensure boxes are visible when switching mode
    this.showBoxes = true;

    if (this.selectedSymbol && this.selectedSymbol.SymbolName) {
      console.log(
        `Box mode changed from ${previous} to ${mode} — fetching boxes for ${this.selectedSymbol.SymbolName}`,
      );

      this.fetchBoxes(this.selectedSymbol.SymbolName)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          error: (e) => console.warn('fetchBoxes error after mode change', e),
        });
    } else {
      console.warn('No selectedSymbol available when changing box mode');
    }
  }

  // New: checkbox handler to support two checkbox menu items behaving like radio buttons
  onBoxModeCheckbox(mode: 'boxes' | 'all', checked: boolean): void {
    if (!checked) return; // don't allow unchecking both
    this.onBoxModeChange(mode);
  }

  // New: fetch boxes using selected mode
  fetchBoxes(symbolName: string): Observable<any[]> {
    if (!symbolName) return of([]);

    // Clear existing boxes immediately
    this.boxes = [];

    // Remove existing box datasets immediately
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isBox,
      );
    });

    console.log(`fetchBoxes(start): mode=${this.boxMode} symbol=${symbolName}`);

    return this.boxesService.getBoxes(symbolName, this.boxMode).pipe(
      tap((filtered) => {
        console.log(
          `fetchBoxes(received): ${filtered?.length || 0} boxes for mode=${this.boxMode}`,
        );
        this.boxes = filtered || [];

        // Always render if we have both baseData and boxes, regardless of showBoxes flag
        // The mode change implies user wants to see the result
        if (this.baseData && this.baseData.length && this.boxes.length) {
          console.log(
            `fetchBoxes: calling addBoxesDatasets with ${this.boxes.length} boxes`,
          );
          this.addBoxesDatasets();
        } else {
          console.log(
            `fetchBoxes: skipping render - baseData=${!!this.baseData?.length}, boxes=${this.boxes.length}`,
          );
        }
      }),
    );
  }

  onBoxesToggle(): void {
    console.log('?? onBoxesToggle triggered. showBoxes =', this.showBoxes);
    if (!this.showBoxes) {
      // clear box data and remove existing box datasets immediately
      this.boxes = [];
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d: any) => !d.isBox,
        );
      });
    } else if (this.selectedSymbol && this.selectedSymbol.SymbolName) {
      this.fetchBoxes(this.selectedSymbol.SymbolName)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          error: (e) => console.warn('fetchBoxes error', e),
        });
    }
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
    // Close drawing toolbox when opening settings
    if (this.showSettings) {
      this.drawingTools.toolboxOpen = false;
      this.drawingTools.cancelDrawing();
    }
  }

  toggleDrawingToolbox(): void {
    this.drawingTools.toolboxOpen = !this.drawingTools.toolboxOpen;
    if (!this.drawingTools.toolboxOpen) {
      this.drawingTools.cancelDrawing();
    } else {
      // Close settings when opening drawing toolbox
      this.showSettings = false;
    }
  }

  // Toggle compact mode; when enabling compact mode also force-hide settings panel
  // Footer toggles compact via service; ensure we close settings when entering compact
  // Called optionally if internal logic needs to force-disable settings
  private handleCompactModeEffects(): void {
    if (this.layout.compactMode) {
      this.showSettings = false;
    }
  }

  // Expose compactMode as getter for template binding
  get compactMode(): boolean {
    this.handleCompactModeEffects();
    return this.layout.compactMode;
  }

  // Footer controls visibility propagated from layout service
  get footerControlsVisible(): boolean {
    return this.layout.footerControlsVisible;
  }

  onSymbolChange(symbol: SymbolModel): void {
    // ensure we clear any persisted axis ranges so the new symbol auto-fits
    this.clearScaleRanges();

    // support being called with either a SymbolModel or a symbol name string

    let symbolName: string | undefined;
    let symbolObj: SymbolModel | undefined;
    if (!symbol) return;
    if (typeof symbol === 'string') {
      symbolName = symbol as string;
      symbolObj = (this.availableSymbols || []).find(
        (s) =>
          (s.SymbolName || '').toString().toUpperCase() ===
          symbolName?.toString().toUpperCase(),
      );
    } else {
      symbolObj = symbol as SymbolModel;
      symbolName = symbolObj?.SymbolName;
    }
    if (symbolObj) {
      this._settingsService.dispatchAppAction(
        SettingsActions.setSelectedSymbol({ symbol: symbolObj }),
      );
      this.selectedSymbol = symbolObj;
      this.selectedSymbolName = symbolName || '';
    } else if (symbolName) {
      // fallback: dispatch a minimal model with the name
      const minimal = new SymbolModel();
      minimal.SymbolName = symbolName;
      this._settingsService.dispatchAppAction(
        SettingsActions.setSelectedSymbol({ symbol: minimal }),
      );
      this.selectedSymbolName = symbolName;
    }
    if (symbolName) {
      // Guard: skip if same symbol requested consecutively before previous completes
      if (this.lastRequestedSymbol && this.lastRequestedSymbol === symbolName) {
        return;
      }
      this.lastRequestedSymbol = symbolName;
      // Capture symbolName in a const to satisfy TypeScript
      const capturedSymbolName = symbolName;
      // After updating selectedSymbolName, validate timeframe visibility
      this.ensureTimeframeAllowed();
      this.loadCandles(capturedSymbolName)
        .pipe(
          switchMap(() =>
            forkJoin({
              boxes: this.fetchBoxes(capturedSymbolName),
              orders: this.showOrders
                ? this.fetchOrders(capturedSymbolName)
                : of([]),
            }),
          ),
          takeUntil(this.destroy$),
        )
        .subscribe({
          next: () => {
            // On iOS Safari, axis ranges sometimes stick between symbol switches.
            // Force a fit to data after datasets are updated to refresh x/y ranges.
            try {
              // Nudge change detection: replace options/scales object references
              const prev = this.chartOptions || {};
              const prevScales = (prev as any).scales || {};
              this.chartOptions = {
                ...prev,
                scales: { ...prevScales },
              };
            } catch {}
            try {
              this.fitToData();
            } catch {}
            // Double-tap with a microtask to ensure Chart.js internal state is settled
            try {
              setTimeout(() => {
                try {
                  const prev = this.chartOptions || {};
                  const prevScales = (prev as any).scales || {};
                  this.chartOptions = {
                    ...prev,
                    scales: { ...prevScales },
                  };
                  this.fitToData();
                } catch {}
              }, 0);
            } catch {}
            // Reconnect Binance stream for new symbol
            this.setupBinanceStream();

            // Reload Market Cipher signals if enabled
            if (this.showMarketCipher) {
              this.loadMarketCipherSignals();
            }
            // Reload Divergences if enabled
            if (this.showDivergences) {
              this.loadDivergences();
            }
          },
          error: (e) => console.warn('onSymbolChange chain error', e),
          complete: () => {
            // reset guard once chain completes
            this.lastRequestedSymbol = null;
          },
        });
    }
  }

  // Clear any stored/forced axis min/max ranges so next data load auto-fits
  clearScaleRanges(): void {
    try {
      // Clear stored chartOptions ranges
      if (!this.chartOptions) this.chartOptions = {};
      if (!this.chartOptions.scales) this.chartOptions.scales = {};
      if (!this.chartOptions.scales.x)
        this.chartOptions.scales.x = this.chartOptions.scales.x || {};
      if (!this.chartOptions.scales.y)
        this.chartOptions.scales.y = this.chartOptions.scales.y || {};
      // also clear hidden indicator axis
      if (!this.chartOptions.scales.indicator)
        this.chartOptions.scales.indicator =
          this.chartOptions.scales.indicator || {};
      delete this.chartOptions.scales.x.min;
      delete this.chartOptions.scales.x.max;
      delete this.chartOptions.scales.y.min;
      delete this.chartOptions.scales.y.max;
      delete (this.chartOptions.scales as any).indicator?.min;
      delete (this.chartOptions.scales as any).indicator?.max;

      // Also clear runtime chart instance ranges if available
      const chartRef = this.chart?.chart as any;
      if (
        chartRef &&
        chartRef.config &&
        chartRef.config.options &&
        chartRef.config.options.scales
      ) {
        if (chartRef.config.options.scales.x) {
          delete chartRef.config.options.scales.x.min;
          delete chartRef.config.options.scales.x.max;
        }
        if (chartRef.config.options.scales.y) {
          delete chartRef.config.options.scales.y.min;
          delete chartRef.config.options.scales.y.max;
        }
      }
      // Clear runtime scale option objects if present
      if (chartRef && chartRef.scales) {
        try {
          if (chartRef.scales.x && chartRef.scales.x.options) {
            delete chartRef.scales.x.options.min;
            delete chartRef.scales.x.options.max;
          }
        } catch (e) {}
        try {
          if (chartRef.scales.y && chartRef.scales.y.options) {
            delete chartRef.scales.y.options.min;
            delete chartRef.scales.y.options.max;
          }
        } catch (e) {}
        try {
          if (chartRef.scales.indicator && chartRef.scales.indicator.options) {
            delete chartRef.scales.indicator.options.min;
            delete chartRef.scales.indicator.options.max;
          }
        } catch (e) {}
      }

      try {
        chartRef?.update?.('none');
      } catch (e) {
        /* ignore */
      }
    } catch (e) {
      // ignore any errors in cleanup
    }
  }

  onTimeframeChange(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    // Persist selection to settings/localStorage
    try {
      this._settingsService.dispatchAppAction(
        SettingsActions.setSelectedTimeframe({ timeframe }),
      );
    } catch {}
    if (this.selectedSymbol) {
      this.loadCandles(this.selectedSymbol.SymbolName)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            // reconnect Binance stream for new timeframe
            this.setupBinanceStream();

            // Reload Market Cipher signals if enabled
            if (this.showMarketCipher) {
              this.loadMarketCipherSignals();
            }
            // Reload Divergences if enabled
            if (this.showDivergences) {
              this.loadDivergences();
            }
          },
          error: (e) => console.warn('loadCandles error', e),
        });
    }
  }

  //
  // ?? Load chart data and update price info
  //
  loadCandles(symbol: string): Observable<any[]> {
    return this.marketService
      .getCandles(symbol, this.selectedTimeframe, 1000)
      .pipe(
        map((candles: any[]) =>
          candles.map((c: any) => ({
            x: new Date(c.Time).getTime(),
            timeStr: c.Time, // Keep original time string from backend
            o: c.Open,
            h: c.High,
            l: c.Low,
            c: c.Close,
          })),
        ),
        tap((mapped: any[]) => {
          if (!mapped.length) return;
          // store base data for overlays
          this.baseData = mapped;
          const latestCandle = mapped[mapped.length - 1];
          const previousCandle = mapped[mapped.length - 2];
          this.currentPrice = latestCandle.c;
          this.priceChange = previousCandle
            ? latestCandle.c - previousCandle.c
            : 0;
          this.priceChangeFormatted = formatPriceChange(
            this.priceChange,
            previousCandle?.c || 0,
          );
          this.spread = this.currentPrice * 0.001;
          this.sellPrice = this.currentPrice - this.spread / 2;
          this.buyPrice = this.currentPrice + this.spread / 2;
          this.fullDataRange = {
            min: mapped[0].x,
            max: mapped[mapped.length - 1].x,
          };
          // compute extended range (overscroll) based on candle width and total range
          this.interaction.computeExtendedRange(mapped);
          this.extendedDataRange = { ...this.interaction.extendedDataRange };
          try {
            (window as any).__chartExtendedMax = this.extendedDataRange.max;
          } catch {}
          const allHighs = mapped.map((c: any) => c.h);
          const allLows = mapped.map((c: any) => c.l);
          this.initialYRange = {
            min: Math.min(...allLows),
            max: Math.max(...allHighs),
          };
          // propagate ranges to interaction service
          this.interaction.setRanges(
            this.fullDataRange,
            this.extendedDataRange,
            this.initialYRange,
          );
          this.chartData = {
            datasets: [
              {
                label: `${symbol} ${this.selectedTimeframe.toUpperCase()}`,
                data: mapped,
                type: 'candlestick',
                borderWidth: 1,
                // chartjs-chart-financial uses plural property names!
                borderColors: {
                  up: '#26a69a',
                  down: '#ef5350',
                  unchanged: '#b2b5be',
                },
                backgroundColors: {
                  up: '#26a69a',
                  down: '#ef5350',
                  unchanged: '#b2b5be',
                },
                // TradingView-style candle width (consistent with updateCandleWidth)
                barPercentage: 0.9,
                categoryPercentage: 0.9,
                maxBarThickness: 16,
              },
            ],
          };
          if (this.boxes && this.boxes.length && this.showBoxes) {
            this.addBoxesDatasets();
          }
          if (!this.showIndicators) {
            this.safeUpdateDatasets(() => {
              this.chartData.datasets = this.chartData.datasets.filter(
                (d: any) => !d.isIndicator,
              );
            });
          }
          // Nieuwe fix: als orders al geladen zijn (bij navigatie van andere pagina) maar lijnen niet getekend zijn
          // omdat baseData eerder ontbrak, render ze nu.
          if (this.showOrders && this.orders && this.orders.length) {
            const hasOrderLines = (this.chartData.datasets || []).some(
              (d: any) => d.isOrder,
            );
            if (!hasOrderLines) {
              try {
                this.addOrderDatasets();
                console.log('[Chart] Re-render orders after candle load.');
              } catch (e) {
                console.warn('orders redraw error', e);
              }
            }
          }
          this.scheduleInitializeChart(mapped);

          // If the container was not sized yet, delay overlays/markers until next frame.
          // This avoids distorted positions on first render.
          // Do NOT force-fit here; rely on existing initializeChart and interaction logic.
          // Auto-load indicator signals on initial data load if the toggle is ON so the first user click behaves intuitively.
          // Previously the checkbox defaulted to checked but indicators were only fetched after a manual re-check cycle.
          if (this.showIndicators) {
            // Avoid duplicate fetches: only trigger if we currently have no indicator datasets.
            const hasIndicators = (this.chartData.datasets || []).some(
              (d: any) => d.isIndicator,
            );
            if (!hasIndicators) {
              this.loadCapitalFlowSignals();
            }
          }
        }),
      );
  }

  // Attempt to initialize chart scales once the underlying Chart.js instance is available.
  // Falls back to a few animation frame retries if the ViewChild isn't ready yet.
  scheduleInitializeChart(data: any[]): void {
    const chartRef = this.chart?.chart as any;
    if (chartRef && chartRef.scales && chartRef.scales.x && chartRef.scales.y) {
      try {
        this.initializeChart(data);
      } catch (e) {
        console.warn('initializeChart failed', e);
      }
      return;
    }
    if (this._initTries > 10) {
      // give up after ~10 frames
      console.warn('scheduleInitializeChart: chart not ready after retries');
      return;
    }
    this._initTries++;
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.scheduleInitializeChart(data));
    } else {
      setTimeout(() => this.scheduleInitializeChart(data), 32);
    }
  }

  // (legacy formatPriceChange moved to chart-utils.ts)

  initializeChart(data: any[]): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef) return;

    // Avoid forcing fits here; just proceed with visible window logic.

    // Show last 100 candles initially for better mobile view
    const initialVisible = Math.min(100, data.length);
    const visibleData = data.slice(-initialVisible);

    const xMin = visibleData[0].x;
    const xMax = visibleData[visibleData.length - 1].x;

    const visibleHighs = visibleData.map((c: any) => c.h);
    const visibleLows = visibleData.map((c: any) => c.l);
    const yMin = Math.min(...visibleLows);
    const yMax = Math.max(...visibleHighs);
    const yBuffer = (yMax - yMin) * 0.05;

    // ensure we respect extended overscroll limits for initial view
    chartRef.scales.x.options.min = xMin;
    chartRef.scales.x.options.max = xMax;
    chartRef.scales.y.options.min = yMin - yBuffer;
    chartRef.scales.y.options.max = yMax + yBuffer;

    // Set a nice step size for y-axis ticks based on visible range
    this.setYAxisStep(chartRef);

    chartRef.update('none');
    // keep hidden indicator axis aligned with main y-axis so indicator glyphs stay pinned
    // keep hidden indicator axis aligned with main y-axis so indicator glyphs stay pinned
    this.interaction.syncIndicatorAxis(chartRef);
    // Dynamische candle breedte op basis van zichtbare candles
    this.interaction.updateCandleWidth(chartRef);
  }

  // Compute a "nice" tick step given a range and desired tick count
  private computeNiceStep(range: number, desiredTicks = 6): number {
    if (!Number.isFinite(range) || range <= 0) return 0.01;
    const rough = range / Math.max(2, desiredTicks);
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const scaled = rough / power;
    let niceScaled: number;
    if (scaled < 1.5) niceScaled = 1;
    else if (scaled < 3) niceScaled = 2;
    else if (scaled < 7) niceScaled = 5;
    else niceScaled = 10;
    const step = niceScaled * power;
    // For tiny ranges, ensure step has enough precision
    const minStep = 1e-8;
    return Math.max(step, minStep);
  }

  // Apply a nice y-axis step to the current chart instance
  private setYAxisStep(chartRef: any): void {
    try {
      if (!chartRef?.scales?.y) return;
      const yScale = chartRef.scales.y;
      const min =
        typeof yScale.min === 'number'
          ? yScale.min
          : (yScale.options?.min ?? 0);
      const max =
        typeof yScale.max === 'number'
          ? yScale.max
          : (yScale.options?.max ?? min + 1);
      const range = max - min;
      const step = this.computeNiceStep(range, 7);
      chartRef.config = chartRef.config || { options: { scales: {} } };
      chartRef.config.options = chartRef.config.options || { scales: {} };
      chartRef.config.options.scales = chartRef.config.options.scales || {};
      chartRef.config.options.scales.y = chartRef.config.options.scales.y || {};
      chartRef.config.options.scales.y.ticks =
        chartRef.config.options.scales.y.ticks || {};
      chartRef.config.options.scales.y.ticks.stepSize = step;
      // Ensure autoskip doesn't drop labels to 0.00 repeatedly
      chartRef.config.options.scales.y.ticks.autoSkip = true;
      chartRef.config.options.scales.y.ticks.maxTicksLimit = 14;
    } catch {}
  }

  /**
   * Set up Binance WebSocket streaming for live candle updates
   * Only activates if:
   * - Exchange is "Binance"
   * - Symbol and timeframe are selected
   * - Historical data is already loaded (baseData array exists)
   *
   * Does NOT interfere with historical loading or existing pan/zoom logic.
   * Live updates only affect the rightmost candle or append new ones.
   */
  private setupBinanceStream(): void {
    console.log('[Chart] setupBinanceStream called at', new Date().toLocaleTimeString());
    console.log('[Chart] State:', {
      exchange: this.selectedExchange?.Name,
      symbol: this.selectedSymbol?.SymbolName,
      timeframe: this.selectedTimeframe,
      baseDataLength: this.baseData?.length
    });
    
    // Stop previous stream
    if (this.binanceStreamSubscription) {
      this.binanceStreamSubscription.unsubscribe();
      this.binanceStreamSubscription = null;
    }

    this.binanceStream.disconnect();

    // Only Binance exchange supports websocket streaming
    const isBinance =
      this.selectedExchange &&
      (this.selectedExchange.Name || '').toLowerCase().includes('binance');

    if (!isBinance) {
      console.log('[Chart] setupBinanceStream BLOCKED: Not Binance exchange =', this.selectedExchange?.Name);
      return;
    }

    // Disable live candles for dominance symbols
    const isDominanceSymbol = /DOMINANCE|BTC\.D|ALT\.D|USDT\.D/.test((this.selectedSymbol?.SymbolName || '').toUpperCase());
    if (isDominanceSymbol) {
      console.log('[Chart] setupBinanceStream BLOCKED: Dominance symbol selected - live candles disabled');
      return;
    }

    if (!this.selectedSymbol?.SymbolName || !this.selectedTimeframe) {
      console.log('[Chart] setupBinanceStream BLOCKED: Missing symbol or timeframe', {
        symbol: this.selectedSymbol?.SymbolName,
        timeframe: this.selectedTimeframe
      });
      return;
    }

    if (!this.baseData?.length) {
      console.log('[Chart] setupBinanceStream BLOCKED: baseData not ready, length:', this.baseData?.length);
      return;
    }

    const symbol = this.selectedSymbol.SymbolName.toUpperCase();

    const interval = mapTimeframeToBinanceInterval(this.selectedTimeframe);

    if (!interval) {
      console.warn('[Chart] setupBinanceStream BLOCKED: Invalid Binance interval:', this.selectedTimeframe);
      return;
    }

    console.log(`[Chart] ✅ Starting Binance stream: ${symbol} ${interval}`);

    this.binanceStreamSubscription = this.binanceStream
      .connectKlineStream(symbol, interval)
      .pipe(
        filter((u) => u.symbol === symbol && u.interval === interval),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (update) => this.onBinanceLiveUpdate(update),
        error: (err) => console.error('[Chart] Binance stream error', err),
      });
  }

  /**
   * Handle a live kline update from Binance
   * Merges the update into baseData and refreshes chart display
   */
  private onBinanceLiveUpdate(liveUpdate: any): void {
    if (!this.baseData?.length) return;

    this.ngZone.run(() => {
      const oldPrice = this.currentPrice;
      
      // Merge the live candle safely
      const merged = mergeLiveCandle(this.baseData, {
        openTime: liveUpdate.openTime,
        closeTime: liveUpdate.closeTime,
        open: liveUpdate.open,
        high: liveUpdate.high,
        low: liveUpdate.low,
        close: liveUpdate.close,
        volume: liveUpdate.volume,
        isClosed: liveUpdate.isClosed,
      });

      // Only update if something actually changed
      if (merged === this.baseData) return;
      
      this.baseData = merged;

      const last = this.baseData[this.baseData.length - 1];
      const prev = this.baseData[this.baseData.length - 2];

      this.currentPrice = last.c;
      this.priceChange = prev ? last.c - prev.c : 0;

      this.priceChangeFormatted = formatPriceChange(
        this.priceChange,
        prev?.c || 0,
      );

      // Update chart dataset
      const chartRef = this.chart?.chart;

      if (!chartRef) return;

      try {
        chartRef.data.datasets[0].data = this.baseData;

        // ultra-light update (no animation)
        chartRef.update('none');
      } catch (err) {
        console.warn('[Chart] Live update failed', err);
      }

      // Force Angular to detect changes for currentPrice badge
      this.cdr.detectChanges();
    });
  }

  // Touch handlers
  // Delegated interaction handlers
  onTouchStart(event: TouchEvent): void {
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      // Record touch start position for drawing; don't start pan/zoom/longpress
      const chartRef = this.chart?.chart as any;
      if (chartRef && event.touches.length === 1) {
        const rect = chartRef.canvas.getBoundingClientRect();
        const cx = event.touches[0].clientX - rect.left;
        const cy = event.touches[0].clientY - rect.top;
        this.drawingTools.updateCursor(cx, cy);
        chartRef.draw();
      }
      return;
    }
    this.interaction.onTouchStart(event, this.chart?.chart as any);
  }
  onTouchMove(event: TouchEvent): void {
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      const chartRef = this.chart?.chart as any;
      if (chartRef && event.touches.length === 1) {
        const rect = chartRef.canvas.getBoundingClientRect();
        const cx = event.touches[0].clientX - rect.left;
        const cy = event.touches[0].clientY - rect.top;
        this.drawingTools.updateCursor(cx, cy);
        chartRef.draw();
      }
      return;
    }
    this.interaction.onTouchMove(event, this.chart?.chart as any);
  }
  onTouchEnd(event: TouchEvent): void {
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      const chartRef = this.chart?.chart as any;
      // Use last known touch position (from touchstart/touchmove cursor)
      // If no cursor (very fast tap), use changedTouches
      let cx: number | null = null;
      let cy: number | null = null;
      const cursor = this.drawingTools.cursorPosition;
      if (cursor) {
        cx = cursor.x;
        cy = cursor.y;
      } else if (event.changedTouches.length) {
        const rect = chartRef?.canvas?.getBoundingClientRect();
        if (rect) {
          cx = event.changedTouches[0].clientX - rect.left;
          cy = event.changedTouches[0].clientY - rect.top;
        }
      }
      if (chartRef && cx != null && cy != null) {
        const area = chartRef.chartArea;
        if (area && cx >= area.left && cx <= area.right && cy >= area.top && cy <= area.bottom) {
          const xScale = chartRef.scales?.x;
          const yScale = chartRef.scales?.y;
          if (xScale && yScale) {
            const dataX = xScale.getValueForPixel(cx);
            const dataY = yScale.getValueForPixel(cy);
            this.drawingTools.addPoint(dataX, dataY, chartRef);
            chartRef.draw();
          }
        }
      }
      return;
    }
    this.interaction.onTouchEnd(event, this.chart?.chart as any);
  }
  onMouseDown(event: MouseEvent): void {
    if (this.drawingTools.activeToolValue) {
      // Handle drawing click
      const chartRef = this.chart?.chart as any;
      if (chartRef) {
        const rect = chartRef.canvas.getBoundingClientRect();
        const cx = event.clientX - rect.left;
        const cy = event.clientY - rect.top;
        const area = chartRef.chartArea;
        if (area && cx >= area.left && cx <= area.right && cy >= area.top && cy <= area.bottom) {
          const xScale = chartRef.scales?.x;
          const yScale = chartRef.scales?.y;
          if (xScale && yScale) {
            const dataX = xScale.getValueForPixel(cx);
            const dataY = yScale.getValueForPixel(cy);
            this.drawingTools.addPoint(dataX, dataY, chartRef);
            chartRef.draw();
          }
        }
      }
      return;
    }
    this.interaction.onMouseDown(event, this.chart?.chart as any);
  }
  onMouseMove(event: MouseEvent): void {
    if (this.drawingTools.activeToolValue) {
      const chartRef = this.chart?.chart as any;
      if (chartRef) {
        const rect = chartRef.canvas.getBoundingClientRect();
        const cx = event.clientX - rect.left;
        const cy = event.clientY - rect.top;
        this.drawingTools.updateCursor(cx, cy);
        chartRef.draw();
      }
      return;
    }
    this.interaction.onMouseMove(event, this.chart?.chart as any);
  }
  onMouseUp(event: MouseEvent): void {
    if (this.drawingTools.activeToolValue) return;
    this.interaction.onMouseUp(event, this.chart?.chart as any);
  }
  onMouseLeave(event: MouseEvent): void {
    if (this.drawingTools.activeToolValue) {
      this.drawingTools.clearCursor();
      const chartRef = this.chart?.chart as any;
      if (chartRef) chartRef.draw();
      return;
    }
    this.interaction.onMouseLeave(this.chart?.chart as any);
  }
  onWheel(event: WheelEvent): void {
    this.interaction.onWheel(event, this.chart?.chart as any);
  }

  // Helper method to detect if touch is in axis area
  isTouchInAxisArea(
    touchPoint: { x: number; y: number },
    chartRef: any,
  ): boolean {
    if (!chartRef || !chartRef.chartArea) return false;

    const canvas = chartRef.canvas;
    const rect = canvas.getBoundingClientRect();
    const chartArea = chartRef.chartArea;

    // Convert touch coordinates to canvas coordinates
    const canvasX = touchPoint.x - rect.left;
    const canvasY = touchPoint.y - rect.top;

    // Define axis areas (outside the main chart area where candles are drawn)
    const isInXAxisArea =
      canvasX >= chartArea.left &&
      canvasX <= chartArea.right &&
      (canvasY < chartArea.top || canvasY > chartArea.bottom);

    const isInYAxisArea =
      canvasY >= chartArea.top &&
      canvasY <= chartArea.bottom &&
      (canvasX < chartArea.left || canvasX > chartArea.right);

    // Allow zoom gestures only in axis areas
    return isInXAxisArea || isInYAxisArea;
  }

  // (legacy interaction helper methods removed; logic now lives in ChartInteractionService)

  //
  // ?? Public methods for toolbar
  //
  resetZoom(): void {
    const chartRef = this.chart?.chart as any;
    this.interaction.resetZoom(
      chartRef,
      this.chartData.datasets[0]?.data || [],
    );
    this.setYAxisStep(chartRef);
    try {
      chartRef?.update?.('none');
    } catch {}
  }
  fitToData(): void {
    const chartRef = this.chart?.chart as any;
    this.interaction.fitToData(chartRef);
    this.setYAxisStep(chartRef);
    try {
      chartRef?.update?.('none');
    } catch {}
  }

  onChartDblClick(): void {
    if (!this.chart?.chart) return;
    const chartRef = this.chart.chart as any;
    this.interaction.autoFitYScale(chartRef);
    this.setYAxisStep(chartRef);
    chartRef.update('none');
    this.interaction.syncIndicatorAxis(chartRef);
  }

  // Compatibility noop: some templates/code expect ensureOverlaysLoaderV2
  public ensureOverlaysLoaderV2(): void {
    /* noop for backward compatibility */
  }

  // (resolveBoxColors moved to chart-utils.ts)

  addBoxesDatasets(): void {
    const mainDs = this.chartData.datasets[0]?.data as Array<{ x: number }>;
    if (!mainDs || mainDs.length < 2) return;
    // remove existing box datasets first
    this.chartData.datasets = this.chartData.datasets.filter(
      (d: any) => !d.isBox,
    );
    const overlays = buildBoxDatasets({
      boxes: this.boxes || [],
      baseData: this.baseData,
      mainData: mainDs,
      boxMode: this.boxMode,
    });

    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.concat(overlays);
    });

    console.log(
      'addBoxesDatasets: added',
      overlays.length,
      'overlays, total datasets=',
      this.chartData.datasets.length,
    );
  }

  // New method to fetch and toggle KeyZones
  onToggleKeyZones(): void {
    // ngModel already updates `showKeyZones` from the checkbox input.
    // Respect the current model value and act accordingly (do not flip it again).
    if (
      this.showKeyZones &&
      this.selectedSymbol &&
      this.selectedSymbol.SymbolName
    ) {
      // sync master toggle to settings service
      this.keyZoneSettings.setEnabled(true);
      this.fetchKeyZones(this.selectedSymbol.SymbolName).subscribe({
        error: (e) => console.warn('fetchKeyZones error', e),
      });
    } else {
      this.keyZoneSettings.setEnabled(false);
      // remove existing keyzone datasets
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d: any) => !d.isKeyZone,
        );
      });
    }
  }

  // New method to fetch key zones
  fetchKeyZones(symbolName: string): Observable<any> {
    if (!symbolName) return of(null);

    // clear any existing key zone state immediately so UI updates
    this.keyZones = null;
    // remove existing key zone datasets from chart immediately (use isKeyZone flag)
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isKeyZone,
      );
    });

    console.log(`fetchKeyZones: symbol=${symbolName}`);

    // KeyZones endpoint returns an object with VolumeProfiles and FibLevels
    return this.marketService.getKeyZones(symbolName).pipe(
      tap((kz: any) => {
        if (!kz) return;
        console.log('fetchKeyZones result', kz);
        this.keyZones = kz;
        // Discover available timeframes from API response and update settings service
        try {
          const tfSet = new Set<string>();
          const vps = (kz?.VolumeProfiles || []) as any[];
          const fibs = (kz?.FibLevels || []) as any[];
          vps.forEach((vp) => {
            const tf = (vp.Timeframe || vp.timeframe || '').toString();
            if (tf) tfSet.add(tf);
          });
          fibs.forEach((f) => {
            const tf = (f.Timeframe || f.timeframe || '').toString();
            if (tf) tfSet.add(tf);
          });
          const tfs = Array.from(tfSet);
          if (tfs.length) this.keyZoneSettings.setAvailableTimeframes(tfs);
        } catch {}
        if (!this.showKeyZones) return;
        this.addKeyZoneDatasets();
      }),
    );
  }

  // New: method to add KeyZones datasets
  addKeyZoneDatasets(): void {
    if (!this.keyZones) return;
    const mainDs = this.chartData.datasets[0]?.data as Array<{ x: number }>;

    if (!mainDs || mainDs.length < 2) return;

    // Respect master and per-timeframe settings
    const settings = this.keyZoneSettings.getSettings();
    if (!settings.enabled) {
      // ensure removal if disabled
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isKeyZone,
      );
      return;
    }

    // remove existing key zone datasets
    this.chartData.datasets = this.chartData.datasets.filter(
      (d: any) => !d.isKeyZone,
    );

    const xMin = mainDs[0].x;
    // Extend key zone lines to the same right bound used by boxes/interaction overscroll
    let xMax = mainDs[mainDs.length - 1].x;
    try {
      const overscrollMax =
        this.extendedDataRange?.max ??
        (this.interaction as any)?.extendedDataRange?.max;
      if (Number.isFinite(overscrollMax) && overscrollMax > xMax) {
        xMax = overscrollMax;
      }
    } catch {}

    // Determine current visible Y range to hide lines outside chart view
    const { yMinVisible, yMaxVisible } = this.getVisibleYRange();

    const lines: any[] = [];

    // VolumeProfiles -> POC, VAH, VAL
    const vps = this.keyZones.VolumeProfiles || [];
    vps.forEach((vp: any) => {
      const tf = vp.Timeframe || vp.timeframe || '';
      if (!this.isTimeframeVisible(tf)) return;
      if (vp.Poc != null) {
        if (!this.isPriceInVisibleRange(vp.Poc, yMinVisible, yMaxVisible))
          return;
        lines.push({
          type: 'line' as const,
          label: `${tf} POC`,
          data: [
            { x: xMin, y: vp.Poc },
            { x: xMax, y: vp.Poc },
          ],
          borderColor: 'rgba(57,255,20,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tf} POC`,
          keyColor: 'rgba(57,255,20,0.9)',
        });
      }
      if (vp.Vah != null) {
        if (!this.isPriceInVisibleRange(vp.Vah, yMinVisible, yMaxVisible))
          return;
        lines.push({
          type: 'line' as const,
          label: `${tf} VAH`,
          data: [
            { x: xMin, y: vp.Vah },
            { x: xMax, y: vp.Vah },
          ],
          borderColor: 'rgba(200,0,200,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tf} VAH`,
          keyColor: 'rgba(200,0,200,0.9)',
        });
      }
      if (vp.Val != null) {
        if (!this.isPriceInVisibleRange(vp.Val, yMinVisible, yMaxVisible))
          return;
        lines.push({
          type: 'line' as const,
          label: `${tf} VAL`,
          data: [
            { x: xMin, y: vp.Val },
            { x: xMax, y: vp.Val },
          ],
          borderColor: 'rgba(200,200,0,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tf} VAL`,
          keyColor: 'rgba(200,200,0,0.9)',
        });
      }
    });

    // FibLevels -> label with timeframe,type,level and gold for 0.618
    const fibs = this.keyZones.FibLevels || [];
    fibs.forEach((f: any) => {
      const tf = f.Timeframe || f.timeframe || '';
      if (!this.isTimeframeVisible(tf)) return;
      const type = f.Type || f.type || '';
      const level = f.Level ?? f.level ?? null;
      const price = f.Price ?? f.price ?? null;
      if (price == null) return;
      if (!this.isPriceInVisibleRange(price, yMinVisible, yMaxVisible)) return;

      const levelStr = level != null ? `${level}` : '';
      const label = `${tf} ${type} ${levelStr}`.trim();
      const isGold =
        ('' + level).indexOf('0.618') !== -1 || Number(level) === 0.618;

      lines.push({
        type: 'line' as const,
        label,
        data: [
          { x: xMin, y: price },
          { x: xMax, y: price },
        ],
        borderColor: isGold ? '#FFD700' : 'rgba(255,165,0,0.9)',
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        isKeyZone: true,
        keyLabel: label,
        keyColor: isGold ? '#FFD700' : 'rgba(255,165,0,0.9)',
      });
    });

    if (!lines.length) return;

    // add keyzone lines but preserve current view
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.concat(lines);
      try {
        console.log('[Chart] Added order line datasets:', lines.length);
      } catch {}
    });

    console.log(
      'addKeyZoneDatasets: added',
      lines.length,
      'key zone lines, total datasets=',
      this.chartData.datasets.length,
    );
  }

  // Deprecated: previous filter-only approach removed keyzones permanently when out of view
  // Keeping stub for reference; logic now handled by addKeyZoneDatasets on interaction updates.
  private refreshKeyZoneVisibility(): void {
    /* replaced by addKeyZoneDatasets on interaction */
  }

  private isTimeframeVisible(tf: string): boolean {
    const settings = this.keyZoneSettings.getSettings();
    const key = (tf || '').toString();
    if (!key) return false;
    return !!settings.enabled && !!settings.timeframes[key];
  }

  private getVisibleYRange(): { yMinVisible: number; yMaxVisible: number } {
    const chartRef = this.chart?.chart as any;
    try {
      const yScale = chartRef?.scales?.y;
      const min =
        typeof yScale?.min === 'number'
          ? yScale.min
          : (yScale?.options?.min ?? this.initialYRange.min);
      const max =
        typeof yScale?.max === 'number'
          ? yScale.max
          : (yScale?.options?.max ?? this.initialYRange.max);
      if (Number.isFinite(min) && Number.isFinite(max)) {
        return { yMinVisible: min, yMaxVisible: max };
      }
    } catch {}
    // Fallback to initial full range
    return {
      yMinVisible: this.initialYRange.min,
      yMaxVisible: this.initialYRange.max,
    };
  }

  private isPriceInVisibleRange(
    price: number,
    yMin: number,
    yMax: number,
  ): boolean {
    if (!Number.isFinite(price)) return false;
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return true; // if unknown, don't filter out
    return price >= Math.min(yMin, yMax) && price <= Math.max(yMin, yMax);
  }

  // Expose timeframe UI helpers for chart settings panel
  get availableTimeframes(): string[] {
    return this.keyZoneSettings.getAvailableTimeframes();
  }
  get allTimeframesEnabled(): boolean {
    return this.keyZoneSettings.isAllTimeframesEnabled();
  }
  timeframeEnabled(tf: string): boolean {
    const settings = this.keyZoneSettings.getSettings();
    return !!settings.timeframes[tf];
  }
  onAllTimeframesToggle(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.keyZoneSettings.setAllTimeframesEnabled(!!target.checked);
    // If currently showing key zones and we have data, refresh
    if (this.showKeyZones && this.keyZones) {
      this.addKeyZoneDatasets();
    }
  }
  onTimeframeToggle(tf: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    this.keyZoneSettings.setTimeframeEnabled(tf, !!target.checked);
    if (this.showKeyZones && this.keyZones) {
      this.addKeyZoneDatasets();
    }
  }

  // Orders (moved above private methods to satisfy member ordering lint rules)
  onOrdersToggle(): void {
    if (!this.showOrders) {
      this.orders = [];
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d: any) => !d.isOrder,
        );
      });
      return;
    }

    // If we already have orders cached and baseData is available, render them immediately
    if (
      this.orders &&
      this.orders.length &&
      this.baseData &&
      this.baseData.length
    ) {
      console.log(
        '[Chart] Rendering cached orders immediately:',
        this.orders.length,
      );
      this.addOrderDatasets();
    }

    // Then fetch fresh orders from the server
    if (this.selectedSymbol?.SymbolName) {
      this.fetchOrders(this.selectedSymbol.SymbolName)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          error: (e) => console.warn('fetchOrders error in toggle', e),
        });
    }
  }
  addOrderDatasets(): void {
    if (!this.orders?.length) return;
    const mainDs = this.chartData.datasets[0]?.data as Array<{ x: number }>;
    if (!mainDs || mainDs.length < 2) return;
    this.chartData.datasets = this.chartData.datasets.filter(
      (d: any) => !d.isOrder,
    );
    const xMin = mainDs[0].x;
    const xMax = mainDs[mainDs.length - 1].x;
    const lines: any[] = [];
    this.orders.forEach((o: any) => {
      const entry = Number(
        o.EntryPrice ?? o.Entryprice ?? o.entryPrice ?? null,
      );
      const sl = Number(o.StopLoss ?? o.Stoploss ?? o.stopLoss ?? null);
      const t1 = Number(
        o.TargetPrice ?? o.Target1Price ?? o.Target1price ?? null,
      );
      const t2 = Number(o.Target2Price ?? o.Target2price ?? o.Target2 ?? null);
      const side = ((o.Direction || o.direction || '') + '').toLowerCase();
      const isLong = /long|buy/.test(side);
      const entryColor = isLong ? '#00C853' : '#FF8F00';
      const slColor = '#FF4444';
      const tColor = '#00C8FF';
      if (!Number.isNaN(entry))
        lines.push(
          this.buildOrderLine('Entry', entryColor, xMin, xMax, entry, o.Id),
        );
      if (!Number.isNaN(sl))
        lines.push(
          this.buildOrderLine(
            'Stoploss',
            slColor,
            xMin,
            xMax,
            sl,
            o.Id,
            [4, 4],
          ),
        );
      if (!Number.isNaN(t1))
        lines.push(
          this.buildOrderLine('Target1', tColor, xMin, xMax, t1, o.Id),
        );
      if (!Number.isNaN(t2))
        lines.push(
          this.buildOrderLine('Target2', tColor, xMin, xMax, t2, o.Id, [2, 4]),
        );
    });
    if (!lines.length) return;
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.concat(lines);
    });
  }

  fetchOrders(symbolName: string): Observable<any[]> {
    if (!symbolName) return of([]);

    // Don't clear orders immediately - keep them for instant render above
    // this.orders = [];

    // Remove existing order datasets to prepare for fresh render
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isOrder,
      );
    });

    return this.marketService.getTradeOrders(symbolName).pipe(
      tap((arr: any[]) => {
        if (!arr?.length) {
          this.orders = [];
          return;
        }
        const relevant = arr.filter(
          (o) =>
            (o.Symbol || '').toString().toUpperCase() ===
            symbolName.toUpperCase(),
        );
        if (!relevant.length) {
          this.orders = [];
          return;
        }
        this.orders = relevant;
        console.log(
          `[Chart] fetchOrders received ${this.orders.length} orders for ${symbolName}`,
        );
        if (!this.baseData?.length) {
          console.warn('[Chart] fetchOrders: no baseData yet, cannot render');
          return;
        }
        this.addOrderDatasets();
      }),
    );
  }

  // Toggle handler exposed to UI
  // Toggle handler for Market Cipher
  onToggleMarketCipher(): void {
    console.log('Market Cipher toggled:', this.showMarketCipher);
    if (this.showMarketCipher) {
      this.loadMarketCipherSignals();
    } else {
      // Remove Market Cipher datasets from chart
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d: any) => !d.isMarketCipher,
        );
      });
      this.marketCipherSignals = [];
    }
  }

  private loadMarketCipherSignals(): void {
    if (!this.selectedSymbol?.SymbolName || !this.selectedTimeframe) {
      console.warn('Market Cipher: Missing symbol or timeframe');
      return;
    }

    this.indicatorsService
      .fetchMarketCipherSignals({
        symbolName: this.selectedSymbol.SymbolName,
        timeframe: this.selectedTimeframe,
        showMarketCipher: this.showMarketCipher,
      })
      .subscribe({
        next: (signals: any[]) => {
          console.log('Market Cipher signals received:', signals);
          this.marketCipherSignals = signals;

          // Build datasets from signals
          const mcDatasets = this.indicatorsService.buildMarketCipherDatasets({
            rawSignals: signals,
            baseData: this.baseData,
          });

          if (mcDatasets.length > 0) {
            // Remove existing Market Cipher datasets and add new ones
            this.safeUpdateDatasets(() => {
              this.chartData.datasets = this.chartData.datasets.filter(
                (d: any) => !d.isMarketCipher,
              );
              this.chartData.datasets.push(...mcDatasets);
            });
          }
        },
        error: (err) => {
          console.error('Error loading Market Cipher signals:', err);
        },
      });
  }

  onToggleDivergences(): void {
    if (this.showDivergences) {
      this.loadDivergences();
    } else {
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d: any) => !d.isDivergence,
        );
      });
      this.divergences = [];
    }
  }

  private loadDivergences(): void {
    if (!this.selectedSymbol?.SymbolName || !this.selectedTimeframe) {
      console.warn('Divergences: Missing symbol or timeframe');
      return;
    }

    this.indicatorsService
      .fetchDivergences({
        symbolName: this.selectedSymbol.SymbolName,
        timeframe: this.selectedTimeframe,
        showDivergences: this.showDivergences,
      })
      .subscribe({
        next: (data: any[]) => {
          console.log('Divergences received:', data);
          this.divergences = data;

          const divDatasets = this.indicatorsService.buildDivergenceDatasets({
            divergences: data,
            baseData: this.baseData,
          });

          this.safeUpdateDatasets(() => {
            this.chartData.datasets = this.chartData.datasets.filter(
              (d: any) => !d.isDivergence,
            );
            if (divDatasets.length > 0) {
              this.chartData.datasets.push(...divDatasets);
            }
          });
        },
        error: (err) => {
          console.error('Error loading Divergences:', err);
        },
      });
  }

  onToggleIndicators(): void {
    // ngModel already updates `showIndicators` from the checkbox input.
    // Respect the current model value and act accordingly (do not flip it again).
    if (!this.showIndicators) {
      // remove indicator datasets ONLY, do NOT reset chartData/datasets
      // Do not preserve prior scales (they may be expanded due to indicator axis sync); allow autoFit afterwards.
      const chartRef = this.chart?.chart as any;
      let xMinBefore: number | undefined;
      let xMaxBefore: number | undefined;
      try {
        if (chartRef?.scales?.x) {
          xMinBefore =
            typeof chartRef.scales.x.min === 'number'
              ? chartRef.scales.x.min
              : chartRef.scales.x.options?.min;
          xMaxBefore =
            typeof chartRef.scales.x.max === 'number'
              ? chartRef.scales.x.max
              : chartRef.scales.x.options?.max;
        }
      } catch {}
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d: any) => !d.isIndicator,
        );
        this.ensureCandleWidth();
      }, false);
      this.interaction.updateCandleWidth(chartRef);

      // After removing indicator datasets, re-fit Y scale to visible candles so candles keep correct height
      try {
        const chartRef = this.chart?.chart as any;
        if (chartRef) {
          // Clear any previously forced y min/max so autoFit works from raw candle data
          try {
            if (chartRef.config?.options?.scales?.y) {
              delete chartRef.config.options.scales.y.min;
              delete chartRef.config.options.scales.y.max;
            }
            if (chartRef.scales?.y?.options) {
              delete chartRef.scales.y.options.min;
              delete chartRef.scales.y.options.max;
            }
          } catch {}
          // recalc y-scale based on visible candles
          this.interaction.autoFitYScale(chartRef);
          this.setYAxisStep(chartRef);
          // Restore previous x-range (to avoid accidental full-range zoom making candles appear huge)
          if (
            xMinBefore !== undefined &&
            xMaxBefore !== undefined &&
            chartRef.scales?.x
          ) {
            chartRef.scales.x.options.min = xMinBefore;
            chartRef.scales.x.options.max = xMaxBefore;
          }
          chartRef.update('none');
        }
      } catch (e) {
        // ignore errors
      }

      return;
    }
    this.loadCapitalFlowSignals();
  }

  // Fetch Capital Flow signals from backend and add datasets
  // Fetching is in ChartIndicatorsService; this orchestrates dataset addition & axis sync
  private loadCapitalFlowSignals(): void {
    if (!this.showIndicators || !this.selectedSymbol?.SymbolName) return;
    // clear existing indicator datasets
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isIndicator,
      );
    });
    this.indicatorsService
      .fetchCapitalFlowSignals({
        symbolName: this.selectedSymbol.SymbolName,
        timeframe: this.selectedTimeframe,
        baseData: this.baseData,
        showIndicators: this.showIndicators,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (raw) => {
          if (!this.showIndicators) return;
          // Cache raw signals for client-side filtering
          this.indicatorSignals = raw || [];
          const newDatasets = this.indicatorsService.buildCapitalFlowDatasets({
            rawSignals: this.indicatorSignals,
            timeframe: this.selectedTimeframe,
            baseData: this.baseData,
            filter: this.interaction.capitalFlowFilter,
          });
          // debug logging removed for performance
          if (!newDatasets.length) return;
          this.safeUpdateDatasets(() => {
            this.chartData.datasets =
              this.chartData.datasets.concat(newDatasets);
          });
          try {
            this.interaction.updateCandleWidth(this.chart?.chart as any);
          } catch {}
          // refit y-scale ignoring indicator datasets
          try {
            const chartRef = this.chart?.chart as any;
            if (chartRef && chartRef.scales?.y) {
              this.interaction.autoFitYScale(chartRef);
              chartRef.update('none');
            }
          } catch {}
        },
        error: (e) => console.warn('capital flow signals load error', e),
      });
  }

  private buildOrderLine(
    label: string,
    color: string,
    xMin: number,
    xMax: number,
    price: number,
    orderId: any,
    dash: number[] = [],
  ): any {
    return {
      type: 'line' as const,
      label: `Order ${orderId} ${label}`,
      orderLabel: label,
      orderColor: color,
      data: [
        { x: xMin, y: price },
        { x: xMax, y: price },
      ],
      borderColor: color,
      borderWidth: 1,
      borderDash: dash,
      pointRadius: 0,
      isOrder: true,
      order: 950,
    };
  }

  // Only show 12m / 24m when BTC-like symbol or dominance symbol selected
  get visibleTimeframes(): Array<{ label: string; value: string }> {
    const sym = (this.selectedSymbol?.SymbolName || '').toUpperCase();
    const isBtc = /BTC/.test(sym);
    const isDominance = /DOMINANCE|BTC\.D|ALT\.D|USDT\.D/.test(sym);
    if (isBtc || isDominance) return this.timeframes;
    // filter out 12m and 24m for non-BTC and non-dominance symbols
    return this.timeframes.filter(
      (tf) => tf.value !== '12m' && tf.value !== '24m',
    );
  }

  // helper moved to utils (isBtcSymbol)
  // ensure candle width options set (compat function kept from earlier)
  private ensureCandleWidth(): void {
    const candleDs = this.chartData.datasets.find(
      (d: any) => d.type === 'candlestick',
    );
    if (candleDs) {
      // TradingView-style consistent candlestick widths
      candleDs.barPercentage = 0.9;
      candleDs.categoryPercentage = 0.9;
      candleDs.maxBarThickness = 16;
      this.chartData = { datasets: this.chartData.datasets.slice() };
    }
  }
  // (removed local candle width / extended range / scheduleInteractionUpdate helpers)

  navigate(route: string): void {
    console.log('navigating to', route);
    this._router.navigate([`/${route}`]);
  }

  toggleFullscreen(): void {
    // Don't toggle fullscreen while in drawing mode
    if (this.drawingTools.activeToolValue) return;
    this.isFullscreen = !this.isFullscreen;
    document.body.style.overflow = this.isFullscreen ? 'hidden' : '';
  }

  cancelDrawing(): void {
    this.drawingTools.cancelDrawing();
    const chartRef = this.chart?.chart as any;
    if (chartRef) chartRef.draw();
  }

  get drawingHint(): string {
    const tool = this.drawingTools.activeToolValue;
    const pending = this.drawingTools.pendingDrawingPoints.length;
    switch (tool) {
      case 'horizontal-line': return 'Klik om horizontale lijn te plaatsen';
      case 'vertical-line':   return 'Klik om verticale lijn te plaatsen';
      case 'fib-retracement':
        return pending === 0 ? 'Punt 1/2 — klik op het laagpunt' : 'Punt 2/2 — klik op het hoogtepunt';
      case 'fib-extension':
        if (pending === 0) return 'Punt 1/3 — klik op startpunt (A)';
        if (pending === 1) return 'Punt 2/3 — klik op eindpunt (B)';
        return 'Punt 3/3 — klik op de pullback (C)';
      default: return '';
    }
  }

  // Tier toggle handler for settings UI
  onTierToggle(
    tier: 'bronze' | 'silver' | 'gold' | 'platinum',
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.interaction.setCapitalFlowFilter({ [tier]: checked } as any);
  }

  // Expose current filter to template
  get capitalFlowFilter(): {
    bronze: boolean;
    silver: boolean;
    gold: boolean;
    platinum: boolean;
  } {
    return this.interaction.capitalFlowFilter;
  }
}
