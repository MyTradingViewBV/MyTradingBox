/* Removed explicit-function-return-type disable (no longer needed) */

import { CommonModule } from '@angular/common';
import { FooterComponent } from '../footer/footer-compenent';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
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
  debounceTime,
  distinctUntilChanged,
  finalize,
  timer,
  catchError,
} from 'rxjs';
import { ChartStateDto } from 'src/app/modules/shared/models/chart/chart-state.dto';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { OrderModel } from 'src/app/modules/shared/models/orders/order.dto';
import { KeyZonesModel } from 'src/app/modules/shared/models/chart/keyZones.dto';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { BinanceStreamService } from './services/binance-stream.service';
import { LiveKlineUpdate } from 'src/app/modules/shared/models/chart/binance-kline.dto';
import { mapTimeframeToBinanceInterval, mergeLiveCandle, isApproximateInterval } from './utils/merge-live-candles';
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
  imports: [CommonModule, FormsModule, BaseChartDirective, DrawingToolboxComponent, TranslateModule, FooterComponent],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './chart-component.html',
  styleUrls: ['./chart-component.scss'],
})
export class ChartComponent implements OnInit, AfterViewInit, OnDestroy {
  exchanges: Exchange[] = [];
  selectedExchange = new Exchange();
  loading = false;
  /**
   * Called when the exchange is changed from the dropdown.
   * Dispatches NGRX action to update exchange and clears selected symbol.
   */
  onExchangeChange(exchange: Exchange): void {
    console.log('Exchange changed to:', exchange);
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedExchange({ exchange }),
    );
    // Reload symbols and candles for the new exchange
    this.loading = true;
    this.loadSymbolsAndBoxes();
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
          maxTicksLimit: 40,
          padding: 8,
          font: { size: 10 },
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
  /** Emitted to cancel any in-flight loadCandles request when switching timeframes. */
  private cancelCandleLoad$ = new Subject<void>();
  private resizeObserver?: ResizeObserver;
  private containerSized = false;
  // Prevent duplicate network calls on rapid/duplicate symbol change events
  private lastRequestedSymbol: string | null = null;
  // Binance WebSocket stream subscription
  private binanceStreamSubscription: any = null;

  // ── Custom timeframe (12m / 24m) live-candle state ───────────────────────
  /** UTC timestamp (ms) of the start of the currently tracked 12m / 24m period */
  private _ctfPeriodStart = 0;
  /** Duration of the custom period in milliseconds */
  private _ctfPeriodMs = 0;
  /** Accumulated aggregated candle for the current period (Chart.js format) */
  private _ctfLiveCandle: { x: number; o: number; h: number; l: number; c: number; v: number } | null = null;

  private readonly marketService = inject(ChartService);
  private readonly _settingsService = inject(SettingsService);
  private readonly interaction = inject(ChartInteractionService);
  private readonly boxesService = inject(ChartBoxesService);
  private readonly indicatorsService = inject(ChartIndicatorsService);
  private readonly layout = inject(ChartLayoutService);
  private readonly keyZoneSettings = inject(KeyZoneSettingsService);
  private readonly binanceStream = inject(BinanceStreamService);
  private readonly ngZone = inject(NgZone);
  readonly drawingTools = inject(DrawingToolsService);
  private drawingPluginRegistered = false;
  private _ctrlSavedMagnetMode: 'off' | 'weak' | 'strong' | null = null;
  /** Raw (pre-snap) touch start pixel position — used for drag-distance check */
  private _touchStartRaw: { x: number; y: number } | null = null;
  private readonly MIN_TOUCH_DRAG_PX = 8;
  /** Id of an existing horizontal line being dragged to a new price level */
  private _draggingLineId: string | null = null;
  /** Data-space position of the pointer at the moment a box drag started */
  private _dragStartDataPos: { x: number; y: number } | null = null;
  /** Snapshot of the dragged box's points at drag-start (prevents drift) */
  private _dragStartPoints: import('./services/drawing-tools.service').DrawingPoint[] | null = null;
  /** Suppress auto-save while restoring state from the backend */
  private _restoringChartState = false;

  // ── Position edit panel state ────────────────────────────────────
  selectedPositionId: string | null = null;
  editEntry: number | null = null;
  editTP: number | null = null;
  editSL: number | null = null;
  editMode: 'price' | 'pct' = 'price';
  editTPPct: number | null = null;
  editSLPct: number | null = null;
  private _longPressTimer: any = null;
  private _pendingPosId: string | null = null;
  private _longPressStartX: number | null = null;
  private _longPressStartY: number | null = null;
  private _activePositionResize: { id: string; row: 'tp' | 'entry' | 'sl'; side: 'left' | 'right' } | null = null;
  private _activeFibResize: { id: string; pointIndex: number } | null = null;

  get selectedPositionDrawing(): import('./services/drawing-tools.service').Drawing | null {
    if (!this.selectedPositionId) return null;
    return this.drawingTools.drawingsValue.find(
      d => d.id === this.selectedPositionId && (d.type === 'long-position' || d.type === 'short-position')
    ) ?? null;
  }

  selectPositionDrawing(d: import('./services/drawing-tools.service').Drawing): void {
    this.selectedPositionId = d.id;
    this.drawingTools.selectedDrawingId = d.id;
    this.editEntry = d.points[0].y;
    this.editTP    = d.points[1].y;
    this.editSL    = d.points[2].y;
    this.editMode  = 'price';
    this.editTPPct = null;
    this.editSLPct = null;
  }

  private syncPositionEditorFromDrawing(d: import('./services/drawing-tools.service').Drawing): void {
    if (this.selectedPositionId !== d.id) return;
    this.editEntry = d.points[0]?.y ?? null;
    this.editTP = d.points[1]?.y ?? null;
    this.editSL = d.points[2]?.y ?? null;
    if (this.editMode === 'pct' && this.editEntry && this.editTP != null && this.editSL != null) {
      this.editTPPct = +(((this.editTP - this.editEntry) / this.editEntry) * 100).toFixed(3);
      this.editSLPct = +(((this.editEntry - this.editSL) / this.editEntry) * 100).toFixed(3);
    }
  }

  setEditMode(mode: 'price' | 'pct'): void {
    if (mode === this.editMode) return;
    if (mode === 'pct' && this.editEntry && this.editTP != null && this.editSL != null) {
      this.editTPPct = +((( this.editTP  - this.editEntry) / this.editEntry) * 100).toFixed(3);
      this.editSLPct = +((( this.editEntry - this.editSL) / this.editEntry) * 100).toFixed(3);
    } else if (mode === 'price' && this.editEntry && this.editTPPct != null && this.editSLPct != null) {
      this.editTP = +(this.editEntry * (1 + this.editTPPct / 100)).toFixed(2);
      this.editSL = +(this.editEntry * (1 - this.editSLPct / 100)).toFixed(2);
    }
    this.editMode = mode;
  }

  dismissPositionEdit(): void {
    this.selectedPositionId = null;
    this.drawingTools.selectedDrawingId = null;
    this.editMode  = 'price';
    this.editTPPct = null;
    this.editSLPct = null;
  }

  applyPositionEdit(): void {
    if (!this.selectedPositionId || this.editEntry == null) return;
    // Convert % back to prices if needed
    if (this.editMode === 'pct' && this.editTPPct != null && this.editSLPct != null) {
      this.editTP = +(this.editEntry * (1 + this.editTPPct / 100)).toFixed(2);
      this.editSL = +(this.editEntry * (1 - this.editSLPct / 100)).toFixed(2);
    }
    if (this.editTP == null || this.editSL == null) return;
    const d = this.selectedPositionDrawing;
    if (!d) return;
    this.drawingTools.updateDrawingPoints(this.selectedPositionId, [
      { ...d.points[0], y: this.editEntry },
      { ...d.points[1], y: this.editTP },
      { ...d.points[2], y: this.editSL },
    ]);
    this.dismissPositionEdit();
    (this.chart?.chart as any)?.draw();
  }

  flipPosition(): void {
    if (this.editTP == null || this.editSL == null || this.editEntry == null) return;
    const distTP = this.editTP - this.editEntry;
    const distSL = this.editSL - this.editEntry;
    this.editTP = this.editEntry - distTP;
    this.editSL = this.editEntry - distSL;
  }

  deleteSelectedPosition(): void {
    if (!this.selectedPositionId) return;
    this.drawingTools.removeDrawing(this.selectedPositionId);
    this.dismissPositionEdit();
    (this.chart?.chart as any)?.draw();
  }

  /**
   * Calculate profit percentage based on entry and TP prices
   */
  getProfitPercent(): number | null {
    if (!this.editEntry || this.editTP == null) return null;
    return +((( this.editTP - this.editEntry) / this.editEntry) * 100).toFixed(2);
  }

  /**
   * Calculate loss percentage based on entry and SL prices
   */
  getLossPercent(): number | null {
    if (!this.editEntry || this.editSL == null) return null;
    return +((( this.editEntry - this.editSL) / this.editEntry) * 100).toFixed(2);
  }

  /**
   * Get position type label (Long/Short)
   */
  getPositionType(): string {
    const d = this.selectedPositionDrawing;
    if (!d) return '';
    return d.type === 'short-position' ? 'Short' : 'Long';
  }

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
        // At day boundaries show compact date instead of 00:00
        if (hh === '00' && min === '00') return `${dd} ${mon}`;
        return `${hh}:${min}`;
      }
      
      if (timeframe.endsWith('h')) {
        // At day boundaries show compact date instead of 00:00
        if (hh === '00' && min === '00') return `${dd} ${mon}`;
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
            // Validate that the timeframe exists in our app timeframe list.
            // Do NOT map to the Binance interval here — that mapping is only
            // used internally by setupBinanceStream. Storing the Binance
            // interval (e.g. '30m') would corrupt what '24m' buttons match.
            const knownAppTimeframe = this.timeframes.some(
              (t) => t.value === tf,
            );
            if (knownAppTimeframe) {
              this.selectedTimeframe = tf;
            } else {
              // Unknown timeframe; fallback to '1h'
              console.warn('[Chart] Unknown persisted timeframe:', tf, '- falling back to 1h');
              this.selectedTimeframe = '1h';
              this._settingsService.dispatchAppAction(
                SettingsActions.setSelectedTimeframe({ timeframe: '1h' }),
              );
            }
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

    // Auto-save drawings to backend whenever they change (debounced)
    try {
      this.drawingTools.drawings
        .pipe(
          debounceTime(1500),
          distinctUntilChanged(),
          takeUntil(this.destroy$),
        )
        .subscribe(() => {
          if (!this._restoringChartState) {
            this.saveCurrentChartState();
          }
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
      // Ctrl hold temporarily activates/deactivates magnet while drawing
      if (e.key === 'Control' && !e.repeat && this._ctrlSavedMagnetMode === null) {
        this._ctrlSavedMagnetMode = this.drawingTools.magnetMode;
        this.drawingTools.magnetMode = this.drawingTools.magnetMode === 'off' ? 'weak' : 'off';
      }
    };
    const ctrlUpHandler = (e: KeyboardEvent) => {
      if (e.key === 'Control' && this._ctrlSavedMagnetMode !== null) {
        this.drawingTools.magnetMode = this._ctrlSavedMagnetMode;
        this._ctrlSavedMagnetMode = null;
      }
    };
    document.addEventListener('keydown', escHandler);
    document.addEventListener('keyup', ctrlUpHandler);
    this.destroy$.subscribe(() => {
      document.removeEventListener('keydown', escHandler);
      document.removeEventListener('keyup', ctrlUpHandler);
    });

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

    // If we captured runtime ranges, persist them into chartOptions so ng2-charts recreation preserves view.
    // Skip if xMin/xMax are not finite numbers — this happens right after loadCandles clears the scale,
    // meaning we intentionally want a fresh viewport for the new data.
    if (preserveScales && saved && typeof saved.xMin === 'number' && typeof saved.xMax === 'number' && isFinite(saved.xMin) && isFinite(saved.xMax)) {
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
          this.loading = false;
          this.cdr.markForCheck();
          // Re-schedule chart initialisation now that loading=false and the chart
          // instance is guaranteed to be available (covers 12m/24m refresh case
          // where the tap's scheduleInitializeChart ran before scales were ready).
          if (this.baseData?.length) {
            this.scheduleInitializeChart(this.baseData);
          }
          this.setupBinanceStream();
          // Restore persisted drawings & settings from backend
          this.loadChartStateForCurrentContext();
        },
        error: (err) => {
          console.warn('[Chart] ❌ loadSymbolsAndBoxes error:', err);
          this.loading = false;
          this.cdr.markForCheck();
        },
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
    this.saveCurrentChartState();
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
      this.loading = true;
      this.cdr.markForCheck();
      // Capture symbolName in a const to satisfy TypeScript
      const capturedSymbolName = symbolName;
      // After updating selectedSymbolName, validate timeframe visibility
      this.ensureTimeframeAllowed();
      this.loadCandles(capturedSymbolName)
        .pipe(
          switchMap(() =>
            forkJoin({
              boxes: this.fetchBoxes(capturedSymbolName).pipe(take(1)),
              orders: this.showOrders
                ? this.fetchOrders(capturedSymbolName).pipe(take(1))
                : of([]),
            }),
          ),
          finalize(() => {
            // Always clear spinner/guard, even if the chain errors or is cancelled.
            this.lastRequestedSymbol = null;
            this.loading = false;
            this.cdr.markForCheck();
          }),
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
            // Restore persisted drawings & settings from backend for new symbol
            this.loadChartStateForCurrentContext();
          },
          error: (e) => {
            console.warn('onSymbolChange chain error', e);
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
      // Clear stale axis ranges so the new timeframe gets a fresh viewport
      this.clearScaleRanges();
      this.loading = true;
      this.cdr.markForCheck();
      // Cancel any previous in-flight candle request so a slow 12m response
      // cannot overwrite a freshly-requested 24m dataset (and vice-versa).
      this.cancelCandleLoad$.next();
      this.loadCandles(this.selectedSymbol.SymbolName)
        .pipe(takeUntil(this.cancelCandleLoad$), takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.loading = false;
            this.cdr.markForCheck();
            // Re-run chart initialisation now that loading=false so the canvas
            // is fully visible. This is the safety net for 12m/24m timeframes
            // where the tap's scheduleInitializeChart may have run while the
            // chart instance had no scales yet (empty initial dataset).
            if (this.baseData?.length) {
              this.scheduleInitializeChart(this.baseData);
            }
            // Force chartOptions object reference change + fitToData like onSymbolChange
            try {
              const prev = this.chartOptions || {};
              const prevScales = (prev as any).scales || {};
              this.chartOptions = { ...prev, scales: { ...prevScales } };
            } catch {}
            try {
              this.fitToData();
            } catch {}
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
            // Restore persisted drawings & settings from backend for new timeframe
            this.loadChartStateForCurrentContext();
          },
          error: (e) => {
            console.warn('loadCandles error', e);
            this.loading = false;
            this.cdr.markForCheck();
          },
        });
    }
  }

  //
  // ?? Load chart data and update price info
  //
  loadCandles(symbol: string): Observable<any[]> {
    // Reset retry counter so every fresh load gets a clean slate of retries.
    this._initTries = 0;
    const fetchTimeframe = this.selectedTimeframe;
    console.log('[Chart] loadCandles:', { symbol, fetchTimeframe });

    // Clear any previously stored scale min/max so safeUpdateDatasets (called
    // later in the tap) does not re-apply the OLD timeframe's axis range on top
    // of the freshly loaded data. initializeChart will compute the correct
    // viewport from the new candles.
    try {
      if (this.chartOptions?.scales?.x) {
        delete this.chartOptions.scales.x.min;
        delete this.chartOptions.scales.x.max;
      }
      if (this.chartOptions?.scales?.y) {
        delete this.chartOptions.scales.y.min;
        delete this.chartOptions.scales.y.max;
      }
      const chartRef = this.chart?.chart as any;
      if (chartRef?.scales?.x?.options) {
        delete chartRef.scales.x.options.min;
        delete chartRef.scales.x.options.max;
      }
      if (chartRef?.scales?.y?.options) {
        delete chartRef.scales.y.options.min;
        delete chartRef.scales.y.options.max;
      }
    } catch {}

    return this.marketService
      .getCandles(symbol, fetchTimeframe, 1000)
      .pipe(
        map((candles: any[]) => {
          // Parse candle timestamps as UTC regardless of device timezone.
          // Strings without a timezone suffix (e.g. "2026-03-15T14:00:00") are
          // treated as LOCAL time by new Date(), which shifts candles by the UTC
          // offset and creates visible gaps. Appending 'Z' forces UTC parsing.
          const toUtcMs = (s: string): number =>
            new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z').getTime();
          const mapped = (candles || []).map((c: any) => ({
            x: toUtcMs(c.Time),
            timeStr: c.Time,
            o: c.Open,
            h: c.High,
            l: c.Low,
            c: c.Close,
          }));
          console.log('[Chart] API returned', mapped.length, 'candles for', fetchTimeframe);
          return mapped;
        }),
        tap((mapped: any[]) => {
          if (!mapped.length) {
            console.warn('[Chart] No candle data received for', symbol, fetchTimeframe);
            return;
          }
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
          // Sync Chart.js instance data immediately so chartRef.update()
          // renders the new candles (Angular change detection hasn't propagated
          // the this.chartData input to BaseChartDirective yet).
          try {
            const chartRef = this.chart?.chart as any;
            if (chartRef) {
              chartRef.data.datasets = this.chartData.datasets;
            }
          } catch {}
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

    const newYMin = yMin - yBuffer;
    const newYMax = yMax + yBuffer;

    // Apply to live chart instance
    chartRef.scales.x.options.min = xMin;
    chartRef.scales.x.options.max = xMax;
    chartRef.scales.y.options.min = newYMin;
    chartRef.scales.y.options.max = newYMax;

    // Also write into chartOptions so Angular change detection does NOT
    // overwrite these values with the previous timeframe's scale the next
    // time ng2-charts re-reads chartOptions (e.g. after addBoxesDatasets).
    try {
      this.chartOptions = this.chartOptions ?? {};
      this.chartOptions.scales = this.chartOptions.scales ?? {};
      this.chartOptions.scales.x = { ...(this.chartOptions.scales.x ?? {}), min: xMin, max: xMax };
      this.chartOptions.scales.y = { ...(this.chartOptions.scales.y ?? {}), min: newYMin, max: newYMax };
    } catch {}

    // Set a nice step size for y-axis ticks based on the intended visible range.
    // Pass newYMin/newYMax explicitly because chartRef.scales.y.min/max still reflect
    // the previous render at this point; using them would produce a stale (too-small)
    // stepSize that triggers Chart.js "too many ticks" warnings.
    this.setYAxisStep(chartRef, newYMin, newYMax);

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

  // Apply a nice y-axis step to the current chart instance.
  // Pass explicit yMin/yMax when the chart scale hasn't been redrawn yet (e.g. initializeChart)
  // so the step is computed from the intended range rather than stale rendered bounds.
  private setYAxisStep(chartRef: any, yMin?: number, yMax?: number): void {
    try {
      if (!chartRef?.scales?.y) return;
      const yScale = chartRef.scales.y;
      const min =
        typeof yMin === 'number' ? yMin :
        (typeof yScale.min === 'number' ? yScale.min : (yScale.options?.min ?? 0));
      const max =
        typeof yMax === 'number' ? yMax :
        (typeof yScale.max === 'number' ? yScale.max : (yScale.options?.max ?? min + 1));
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
      chartRef.config.options.scales.y.ticks.maxTicksLimit = 40;
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

    // Dominance symbols have no Binance stream: use ByBit 1m polling instead
    const isDominanceSymbol = /DOMINANCE|BTC\.D|ALT\.D|USDT\.D/.test((this.selectedSymbol?.SymbolName || '').toUpperCase());
    if (isDominanceSymbol) {
      console.log('[Chart] ✅ Starting dominance live stream (polling) for', this.selectedSymbol?.SymbolName);
      this.setupDominanceLiveStream();
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

    // Route 12m/24m to the custom aggregation-based stream
    if (this.selectedTimeframe === '12m' || this.selectedTimeframe === '24m') {
      const periodMinutes = this.selectedTimeframe === '12m' ? 12 : 24;
      console.log(`[Chart] ✅ Starting custom ${periodMinutes}m stream for ${symbol}`);
      this.setupCustomTimeframeStream(periodMinutes);
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
  /**
   * Handle live candle updates for 12m / 24m timeframes.
   *
   * Since Binance has no 12m or 24m stream, we:
   *  1. Fetch the elapsed 1m candles for the current period from /Candles/ByBit
   *  2. Aggregate them into the current live Nm candle
   *  3. Subscribe to the Binance 1m stream and update the live candle on each tick
   *  4. When the Nm period boundary is crossed, re-fetch the completed candle from the API
   */
  private setupCustomTimeframeStream(periodMinutes: number): void {
    if (!this.selectedSymbol?.SymbolName || !this.baseData?.length) return;

    const symbol = this.selectedSymbol.SymbolName.toUpperCase();
    const periodMs = periodMinutes * 60 * 1000;

    // Determine period boundary and elapsed completed 1m candles
    const nowMs = Date.now();
    this._ctfPeriodStart = Math.floor(nowMs / periodMs) * periodMs;
    this._ctfPeriodMs = periodMs;
    this._ctfLiveCandle = null;

    const elapsedMinutes = Math.floor((nowMs - this._ctfPeriodStart) / 60000);
    console.log(`[Chart] CustomTF ${periodMinutes}m: period started at ${new Date(this._ctfPeriodStart).toISOString()}, elapsed=${elapsedMinutes}m`);

    // Fetch completed 1m candles for this period (fetch a couple extra in case of timing)
    const fetchElapsed$ = elapsedMinutes > 0
      ? this.marketService.getCandles(symbol, '1m', elapsedMinutes + 2)
      : of([] as any[]);

    this.binanceStreamSubscription = fetchElapsed$.pipe(
      map((candles: any[]) => {
        const toUtcMs = (s: string): number =>
          new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z').getTime();
        return (candles || []).map((c: any) => ({
          x: toUtcMs(c.Time),
          o: c.Open as number,
          h: c.High as number,
          l: c.Low as number,
          c: c.Close as number,
          v: (c.Volume as number) ?? 0,
        }));
      }),
      tap((mapped) => {
        // Keep only candles that fall within the current period
        const inPeriod = mapped.filter(c => c.x >= this._ctfPeriodStart);
        if (inPeriod.length > 0) {
          this._ctfLiveCandle = this.aggregateToLiveCandle(inPeriod, this._ctfPeriodStart);
          this.applyLiveCandleToBaseData(this._ctfLiveCandle);
          this.currentPrice = this._ctfLiveCandle.c;
          const prev = this.baseData[this.baseData.length - 2];
          this.priceChange = prev ? this._ctfLiveCandle.c - ((prev as any).c ?? 0) : 0;
          this.priceChangeFormatted = formatPriceChange(this.priceChange, (prev as any)?.c ?? 0);
          this.refreshChartData();
        }
      }),
      switchMap(() => this.binanceStream.connectKlineStream(symbol, '1m')),
      filter((u: LiveKlineUpdate) => u.symbol === symbol && u.interval === '1m'),
      takeUntil(this.destroy$),
    ).subscribe({
      next: (update: LiveKlineUpdate) => this.onCustomTimeframeLiveUpdate(update, periodMinutes),
      error: (err) => console.error(`[Chart] CustomTF ${periodMinutes}m stream error`, err),
    });
  }

  private onCustomTimeframeLiveUpdate(update: LiveKlineUpdate, periodMinutes: number): void {
    this.ngZone.run(() => {
      const periodMs = this._ctfPeriodMs;
      const updatePeriodStart = Math.floor(update.openTime / periodMs) * periodMs;

      if (updatePeriodStart > this._ctfPeriodStart) {
        // The 1m candle belongs to the NEXT period — current Nm period has closed
        console.log(`[Chart] CustomTF ${periodMinutes}m period ended, refetching from API...`);
        this._ctfPeriodStart = updatePeriodStart;
        this._ctfLiveCandle = null;

        const symbol = this.selectedSymbol?.SymbolName?.toUpperCase() ?? '';
        // Wait a couple seconds for the backend to compute the closed candle
        setTimeout(() => {
          this.marketService.getCandles(symbol, `${periodMinutes}m`, 1000)
            .pipe(
              take(1),
              takeUntil(this.destroy$),
              map((candles: any[]) => {
                const toUtcMs = (s: string): number =>
                  new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z').getTime();
                return (candles || []).map((c: any) => ({
                  x: toUtcMs(c.Time), timeStr: c.Time,
                  o: c.Open, h: c.High, l: c.Low, c: c.Close,
                }));
              }),
            )
            .subscribe({
              next: (mapped) => {
                if (!mapped.length) return;
                this.ngZone.run(() => {
                  this.baseData = mapped;
                  // Seed the new period's live candle from the first incoming 1m update
                  this._ctfLiveCandle = {
                    x: this._ctfPeriodStart,
                    o: update.open,
                    h: update.high,
                    l: update.low,
                    c: update.close,
                    v: update.volume,
                  };
                  this.applyLiveCandleToBaseData(this._ctfLiveCandle);
                  this.currentPrice = update.close;
                  const prev = this.baseData[this.baseData.length - 2];
                  this.priceChange = prev ? update.close - ((prev as any).c ?? 0) : 0;
                  this.priceChangeFormatted = formatPriceChange(this.priceChange, (prev as any)?.c ?? 0);
                  this.refreshChartData();
                  this.cdr.detectChanges();
                });
              },
            });
        }, 2000);
        return;
      }

      // Same period — update the aggregated live candle
      if (!this._ctfLiveCandle) {
        // First stream tick in this period
        this._ctfLiveCandle = {
          x: this._ctfPeriodStart,
          o: update.open,
          h: update.high,
          l: update.low,
          c: update.close,
          v: update.volume,
        };
      } else if (update.isClosed) {
        // A complete 1m candle just closed — incorporate it fully
        this._ctfLiveCandle = {
          x: this._ctfPeriodStart,
          o: this._ctfLiveCandle.o,
          h: Math.max(this._ctfLiveCandle.h, update.high),
          l: Math.min(this._ctfLiveCandle.l, update.low),
          c: update.close,
          v: this._ctfLiveCandle.v + update.volume,
        };
      } else {
        // 1m still in progress — update live close/high/low; don't add volume yet
        this._ctfLiveCandle = {
          x: this._ctfPeriodStart,
          o: this._ctfLiveCandle.o,
          h: Math.max(this._ctfLiveCandle.h, update.high),
          l: Math.min(this._ctfLiveCandle.l, update.low),
          c: update.close,
          v: this._ctfLiveCandle.v,
        };
      }

      this.applyLiveCandleToBaseData(this._ctfLiveCandle);
      this.currentPrice = this._ctfLiveCandle.c;
      const prev = this.baseData[this.baseData.length - 2];
      this.priceChange = prev ? this._ctfLiveCandle.c - ((prev as any).c ?? 0) : 0;
      this.priceChangeFormatted = formatPriceChange(this.priceChange, (prev as any)?.c ?? 0);
      this.refreshChartData();
      this.cdr.detectChanges();
    });
  }

  /**
   * Live candle for DOMINANCE symbols.
   *
   * Dominance data is only available via the ByBit 1m REST endpoint — there is
   * no WebSocket stream. New 1m candles appear roughly every 1–1.5 minutes, so
   * we poll every 90 seconds.
   *
   * Steps per poll:
   *  1. Determine the start of the current timeframe period.
   *  2. Fetch enough 1m candles from /Candles/ByBit to cover elapsed time.
   *  3. Filter to candles that fall inside the current period.
   *  4. Aggregate them into a single live candle and push it to the chart.
   *  5. If the period boundary has advanced, reload the full candle set.
   */
  private setupDominanceLiveStream(): void {
    if (!this.selectedSymbol?.SymbolName || !this.baseData?.length) return;

    const symbol = this.selectedSymbol.SymbolName.toUpperCase();
    const periodMs = this.timeframeToPeriodMs(this.selectedTimeframe);
    if (!periodMs) return;

    // Reset period tracking
    this._ctfPeriodMs = periodMs;
    this._ctfPeriodStart = 0;
    this._ctfLiveCandle = null;

    // Poll immediately, then every 90 seconds
    this.binanceStreamSubscription = timer(0, 90_000).pipe(
      switchMap(() => {
        const nowMs = Date.now();
        const periodStart = Math.floor(nowMs / periodMs) * periodMs;
        const elapsedMinutes = Math.ceil((nowMs - periodStart) / 60_000) + 2;

        return this.marketService.getCandles(symbol, '1m', Math.max(3, elapsedMinutes)).pipe(
          map((candles: any[]) => {
            const toUtcMs = (s: string): number =>
              new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z').getTime();
            return {
              periodStart,
              candles: (candles || []).map((c: any) => ({
                x: toUtcMs(c.Time),
                o: c.Open as number,
                h: c.High as number,
                l: c.Low as number,
                c: c.Close as number,
                v: (c.Volume as number) ?? 0,
              })),
            };
          }),
          // if API fails for one poll, skip it without killing the stream
          catchError(() => of(null)),
        );
      }),
      filter((result): result is { periodStart: number; candles: any[] } => result !== null),
      takeUntil(this.destroy$),
    ).subscribe({
      next: ({ periodStart, candles }) => {
        this.ngZone.run(() => {
          const inPeriod = candles.filter((c) => c.x >= periodStart);
          if (!inPeriod.length) return;

          const liveCandle = this.aggregateToLiveCandle(inPeriod, periodStart);

          // Period boundary crossed — reload full candle set from API then continue updating
          if (this._ctfPeriodStart > 0 && periodStart > this._ctfPeriodStart) {
            console.log(`[Chart] Dominance period ended (${this.selectedTimeframe}), reloading candles...`);
            this._ctfPeriodStart = periodStart;
            this._ctfLiveCandle = liveCandle;
            this.loadCandles(symbol).pipe(take(1), takeUntil(this.destroy$)).subscribe();
            return;
          }

          this._ctfPeriodStart = periodStart;
          this._ctfLiveCandle = liveCandle;

          this.applyLiveCandleToBaseData(liveCandle);
          this.currentPrice = liveCandle.c;
          const prev = this.baseData[this.baseData.length - 2];
          this.priceChange = prev ? liveCandle.c - ((prev as any).c ?? 0) : 0;
          this.priceChangeFormatted = formatPriceChange(this.priceChange, (prev as any)?.c ?? 0);
          this.refreshChartData();
          this.cdr.detectChanges();
        });
      },
      error: (err) => console.error('[Chart] Dominance live stream error', err),
    });
  }

  /** Map app timeframe string to period duration in milliseconds */
  private timeframeToPeriodMs(timeframe: string): number {
    const map: Record<string, number> = {
      '12m': 12 * 60 * 1000,
      '24m': 24 * 60 * 1000,
      '1h':  60 * 60 * 1000,
      '4h':   4 * 60 * 60 * 1000,
      '1d':  24 * 60 * 60 * 1000,
      '1w':   7 * 24 * 60 * 60 * 1000,
      '1M':  30 * 24 * 60 * 60 * 1000,
    };
    return map[timeframe] ?? 0;
  }

  /** Aggregate 1m candles into a single Nm candle at the given period start */
  private aggregateToLiveCandle(
    candles: Array<{ x: number; o: number; h: number; l: number; c: number; v: number }>,
    periodStart: number,
  ): { x: number; o: number; h: number; l: number; c: number; v: number } {
    const first = candles[0];
    const last = candles[candles.length - 1];
    return {
      x: periodStart,
      o: first.o,
      h: Math.max(...candles.map(c => c.h)),
      l: Math.min(...candles.map(c => c.l)),
      c: last.c,
      v: candles.reduce((sum, c) => sum + c.v, 0),
    };
  }

  /** Replace or append the live custom-timeframe candle in baseData */
  private applyLiveCandleToBaseData(
    liveCandle: { x: number; o: number; h: number; l: number; c: number; v: number },
  ): void {
    if (!this.baseData?.length) return;
    const last = this.baseData[this.baseData.length - 1];
    if ((last as any)?.x === liveCandle.x) {
      this.baseData = [...this.baseData.slice(0, -1), { ...(last as any), ...liveCandle }];
    } else if (liveCandle.x > ((last as any)?.x ?? 0)) {
      this.baseData = [...this.baseData, liveCandle];
    }
  }

  /** Push baseData to Chart.js and trigger a lightweight redraw */
  private refreshChartData(): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef) return;
    try {
      chartRef.data.datasets[0].data = this.baseData;
      chartRef.update('none');
    } catch (err) {
      console.warn('[Chart] refreshChartData failed', err);
    }
  }

  private onBinanceLiveUpdate(liveUpdate: any): void {
    if (!this.baseData?.length) return;

    this.ngZone.run(() => {
      const oldPrice = this.currentPrice;

      // For approximate intervals (e.g. 12m uses 15m stream), snap the live
      // update's openTime to the last candle so it updates in place instead
      // of being appended as a new bar.
      let openTime = liveUpdate.openTime;
      if (isApproximateInterval(this.selectedTimeframe)) {
        const lastCandle = this.baseData[this.baseData.length - 1];
        const lastTime = lastCandle?.x ?? 0;
        if (lastTime && openTime >= lastTime) {
          openTime = lastTime;
        }
      }

      // Merge the live candle safely
      const merged = mergeLiveCandle(this.baseData, {
        openTime,
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

  /** Returns the id of a horizontal line within HIT_PX pixels of (cx, cy), or null */
  private hitTestHorizontalLine(cx: number, cy: number, chartRef: any): string | null {
    const HIT_PX = 8;
    const yScale = chartRef?.scales?.y;
    if (!yScale) return null;
    for (const d of this.drawingTools.drawingsValue) {
      if (d.type !== 'horizontal-line') continue;
      if (Math.abs(cy - yScale.getPixelForValue(d.points[0].y)) <= HIT_PX) return d.id;
    }
    return null;
  }

  /** Returns the id of a vertical line within HIT_PX pixels of (cx, cy), or null */
  private hitTestVerticalLine(cx: number, cy: number, chartRef: any): string | null {
    const HIT_PX = 8;
    const xScale = chartRef?.scales?.x;
    if (!xScale) return null;
    for (const d of this.drawingTools.drawingsValue) {
      if (d.type !== 'vertical-line') continue;
      if (Math.abs(cx - xScale.getPixelForValue(d.points[0].x)) <= HIT_PX) return d.id;
    }
    return null;
  }

  /** Returns the id of a box drawing if (cx,cy) is inside it (or on its border), or null */
  private hitTestBox(cx: number, cy: number, chartRef: any): string | null {
    const HIT_PX = 6;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;
    for (const d of this.drawingTools.drawingsValue) {
      const isBox = d.type === 'box-green' || d.type === 'box-red';
      const isPos = d.type === 'long-position' || d.type === 'short-position';
      if (!isBox && !isPos) continue;
      if (d.points.length < 2) continue;
      const allX = d.points.map((p: any) => xScale.getPixelForValue(p.x));
      const allY = d.points.map((p: any) => yScale.getPixelForValue(p.y));
      const left   = Math.min(...allX) - HIT_PX;
      const right  = Math.max(...allX) + HIT_PX;
      const top    = Math.min(...allY) - HIT_PX;
      const bottom = Math.max(...allY) + HIT_PX;
      if (cx >= left && cx <= right && cy >= top && cy <= bottom) return d.id;
    }
    return null;
  }

  private hitTestPositionHandle(
    cx: number,
    cy: number,
    chartRef: any,
    specificId?: string,
  ): { id: string; row: 'tp' | 'entry' | 'sl'; side: 'left' | 'right' } | null {
    const HIT_PX = 10;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.drawingsValue) {
      if (specificId && d.id !== specificId) continue;
      if (d.type !== 'long-position' && d.type !== 'short-position') continue;
      if (d.points.length < 3) continue;

      const x1 = xScale.getPixelForValue(d.points[0].x);
      const x2 = xScale.getPixelForValue(d.points[1].x);
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const entryY = yScale.getPixelForValue(d.points[0].y);
      const tpY = yScale.getPixelForValue(d.points[1].y);
      const slY = yScale.getPixelForValue(d.points[2].y);

      const handles: Array<{ row: 'tp' | 'entry' | 'sl'; side: 'left' | 'right'; x: number; y: number }> = [
        { row: 'tp', side: 'left', x: left, y: tpY },
        { row: 'tp', side: 'right', x: right, y: tpY },
        { row: 'entry', side: 'left', x: left, y: entryY },
        { row: 'entry', side: 'right', x: right, y: entryY },
        { row: 'sl', side: 'left', x: left, y: slY },
        { row: 'sl', side: 'right', x: right, y: slY },
      ];

      for (const h of handles) {
        if (Math.hypot(cx - h.x, cy - h.y) <= HIT_PX) {
          return { id: d.id, row: h.row, side: h.side };
        }
      }
    }

    return null;
  }

  private applyPositionResize(
    resize: { id: string; row: 'tp' | 'entry' | 'sl'; side: 'left' | 'right' },
    cx: number,
    cy: number,
    chartRef: any,
  ): void {
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale || !this._dragStartPoints || this._dragStartPoints.length < 3) return;

    const startP0 = this._dragStartPoints[0];
    const startP1 = this._dragStartPoints[1];
    const startP2 = this._dragStartPoints[2];

    let leftX = startP0.x;
    let rightX = startP1.x;
    let entryY = startP0.y;
    let tpY = startP1.y;
    let slY = startP2.y;

    const nextX = xScale.getValueForPixel(cx);
    const nextY = yScale.getValueForPixel(cy);

    if (resize.side === 'left') leftX = nextX;
    else rightX = nextX;

    if (resize.row === 'tp') tpY = nextY;
    else if (resize.row === 'entry') entryY = nextY;
    else slY = nextY;

    this.drawingTools.updateDrawingPoints(resize.id, [
      { ...startP0, x: leftX, y: entryY },
      { ...startP1, x: rightX, y: tpY },
      { ...startP2, x: rightX, y: slY },
    ]);

    const updated = this.drawingTools.drawingsValue.find(d => d.id === resize.id);
    if (updated) {
      this.syncPositionEditorFromDrawing(updated);
    }
  }

  private hitTestFibHandle(
    cx: number,
    cy: number,
    chartRef: any,
    specificId?: string,
  ): { id: string; pointIndex: number } | null {
    const HIT_PX = 10;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.drawingsValue) {
      if (specificId && d.id !== specificId) continue;
      if (d.type !== 'fib-retracement' && d.type !== 'fib-extension') continue;

      for (let i = 0; i < d.points.length; i++) {
        const px = xScale.getPixelForValue(d.points[i].x);
        const py = yScale.getPixelForValue(d.points[i].y);
        if (Math.hypot(cx - px, cy - py) <= HIT_PX) {
          return { id: d.id, pointIndex: i };
        }
      }
    }

    return null;
  }

  private hitTestFibBody(
    cx: number,
    cy: number,
    chartRef: any,
    specificId?: string,
  ): string | null {
    const HIT_PX = 10;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.drawingsValue) {
      if (specificId && d.id !== specificId) continue;
      if (d.type !== 'fib-retracement' && d.type !== 'fib-extension') continue;
      if (d.points.length < 2) continue;

      const px = d.points.map(p => xScale.getPixelForValue(p.x));
      const py = d.points.map(p => yScale.getPixelForValue(p.y));
      const left = Math.min(...px) - HIT_PX;
      const right = Math.max(...px) + HIT_PX;
      const top = Math.min(...py) - HIT_PX;
      const bottom = Math.max(...py) + HIT_PX;

      if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
        return d.id;
      }
    }

    return null;
  }

  private applyFibResize(
    resize: { id: string; pointIndex: number },
    cx: number,
    cy: number,
    chartRef: any,
  ): void {
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale || !this._dragStartPoints) return;

    const nextX = xScale.getValueForPixel(cx);
    const nextY = yScale.getValueForPixel(cy);
    const nextPoints = this._dragStartPoints.map((p, i) =>
      i === resize.pointIndex ? { ...p, x: nextX, y: nextY } : { ...p },
    );

    this.drawingTools.updateDrawingPoints(resize.id, nextPoints);
  }

  onTouchStart(event: TouchEvent): void {
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      // Record touch start position for drawing; don't start pan/zoom/longpress
      const chartRef = this.chart?.chart as any;
      if (chartRef && event.touches.length === 1) {
        const rect = chartRef.canvas.getBoundingClientRect();
        const rawX = event.touches[0].clientX - rect.left;
        const rawY = event.touches[0].clientY - rect.top;
        this._touchStartRaw = { x: rawX, y: rawY };
        const snapped = this.snapToOhlc(rawX, rawY, chartRef);
        this.drawingTools.updateCursor(snapped.x, snapped.y);
        if (snapped.label) this.drawingTools.setSnapIndicator(snapped.x, snapped.y, snapped.label);
        else this.drawingTools.clearSnapIndicator();
        chartRef._isInteracting = false;
        chartRef.draw();
      }
      return;
    }
    // Drag existing horizontal line (single finger, no active draw tool)
    if (event.touches.length === 1) {
      const chartRefD = this.chart?.chart as any;
      if (chartRefD) {
        const rectD = chartRefD.canvas.getBoundingClientRect();
        const tx = event.touches[0].clientX - rectD.left;
        const ty = event.touches[0].clientY - rectD.top;
        const lineId = this.hitTestHorizontalLine(tx, ty, chartRefD)
                    ?? this.hitTestVerticalLine(tx, ty, chartRefD);
        if (lineId) {
          event.preventDefault();
          this._draggingLineId = lineId;
          this.drawingTools.draggingId = lineId;
          chartRefD.draw();
          return;
        }
        const fibHandle = this.hitTestFibHandle(tx, ty, chartRefD);
        if (fibHandle) {
          event.preventDefault();
          this.drawingTools.selectedDrawingId = fibHandle.id;
          this._activeFibResize = fibHandle;
          this._draggingLineId = fibHandle.id;
          this.drawingTools.draggingId = fibHandle.id;
          const fib = this.drawingTools.drawingsValue.find(d => d.id === fibHandle.id);
          this._dragStartPoints = fib ? fib.points.map(p => ({ ...p })) : null;
          chartRefD.draw();
          return;
        }
        const fibBodyId = this.hitTestFibBody(tx, ty, chartRefD);
        if (fibBodyId) {
          event.preventDefault();
          this.drawingTools.selectedDrawingId = fibBodyId;
          this._draggingLineId = fibBodyId;
          this.drawingTools.draggingId = fibBodyId;
          const fib = this.drawingTools.drawingsValue.find(d => d.id === fibBodyId);
          const xScaleB = chartRefD.scales?.x;
          const yScaleB = chartRefD.scales?.y;
          if (fib && xScaleB && yScaleB) {
            this._dragStartPoints = fib.points.map(p => ({ ...p }));
            this._dragStartDataPos = { x: xScaleB.getValueForPixel(tx), y: yScaleB.getValueForPixel(ty) };
          }
          chartRefD.draw();
          return;
        }
        // Check for box drag
        const boxId = this.hitTestBox(tx, ty, chartRefD);
        if (boxId) {
          const boxMeta = this.drawingTools.drawingsValue.find(d => d.id === boxId)!;
          const xScaleB = chartRefD.scales?.x;
          const yScaleB = chartRefD.scales?.y;
          if (boxMeta.type === 'long-position' || boxMeta.type === 'short-position') {
            const handle = this.hitTestPositionHandle(tx, ty, chartRefD, boxId);
            if (handle) {
              event.preventDefault();
              this.selectPositionDrawing(boxMeta);
              this._activePositionResize = handle;
              this._draggingLineId = boxId;
              this.drawingTools.draggingId = boxId;
              this._dragStartPoints = boxMeta.points.map(p => ({ ...p }));
              chartRefD.draw();
              this.cdr.detectChanges();
              return;
            }
            // Delay drag start for positions — long press opens the editor
            event.preventDefault();
            this._pendingPosId    = boxId;
            this._longPressStartX = tx;
            this._longPressStartY = ty;
            if (xScaleB && yScaleB) {
              this._dragStartDataPos = { x: xScaleB.getValueForPixel(tx), y: yScaleB.getValueForPixel(ty) };
              this._dragStartPoints  = boxMeta.points.map(p => ({ ...p }));
            }
            this._longPressTimer = setTimeout(() => {
              this._longPressTimer = null;
              this._pendingPosId   = null;
              this.selectPositionDrawing(boxMeta);
              (this.chart?.chart as any)?.draw();
              this.cdr.detectChanges();
            }, 500);
            chartRefD.draw();
            return;
          }
          // Regular boxes (box-green, box-red): start drag immediately
          event.preventDefault();
          this._draggingLineId = boxId;
          this.drawingTools.draggingId = boxId;
          if (xScaleB && yScaleB) {
            this._dragStartDataPos = { x: xScaleB.getValueForPixel(tx), y: yScaleB.getValueForPixel(ty) };
            this._dragStartPoints  = boxMeta.points.map(p => ({ ...p }));
          }
          chartRefD.draw();
          return;
        }
      }
    }
    this.interaction.onTouchStart(event, this.chart?.chart as any);
  }
  onTouchMove(event: TouchEvent): void {
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      const chartRef = this.chart?.chart as any;
      if (chartRef && event.touches.length === 1) {
        const rect = chartRef.canvas.getBoundingClientRect();
        const rawX = event.touches[0].clientX - rect.left;
        const rawY = event.touches[0].clientY - rect.top;
        const snapped = this.snapToOhlc(rawX, rawY, chartRef);
        this.drawingTools.updateCursor(snapped.x, snapped.y);
        if (snapped.label) this.drawingTools.setSnapIndicator(snapped.x, snapped.y, snapped.label);
        else this.drawingTools.clearSnapIndicator();
        chartRef._isInteracting = false;
        chartRef.draw();
      }
      return;
    }
    // Convert pending long-press to drag if finger moves enough
    if (this._pendingPosId && event.touches.length === 1) {
      event.preventDefault();
      const chartRefLP = this.chart?.chart as any;
      if (chartRefLP) {
        const rectLP = chartRefLP.canvas.getBoundingClientRect();
        const lx = event.touches[0].clientX - rectLP.left;
        const ly = event.touches[0].clientY - rectLP.top;
        const moved = Math.hypot(lx - (this._longPressStartX ?? lx), ly - (this._longPressStartY ?? ly));
        if (moved > 8) {
          clearTimeout(this._longPressTimer);
          this._longPressTimer = null;
          this._draggingLineId = this._pendingPosId;
          this.drawingTools.draggingId = this._pendingPosId;
          this._pendingPosId = null;
        }
      }
      return;
    }
    // Move dragged horizontal or vertical line
    if (this._draggingLineId && event.touches.length === 1) {
      event.preventDefault();
      const chartRefD = this.chart?.chart as any;
      if (chartRefD) {
        const rectD = chartRefD.canvas.getBoundingClientRect();
        const cx = event.touches[0].clientX - rectD.left;
        const cy = event.touches[0].clientY - rectD.top;
        if (this._activeFibResize) {
          this.applyFibResize(this._activeFibResize, cx, cy, chartRefD);
          chartRefD.draw();
          return;
        }
        if (this._activePositionResize) {
          this.applyPositionResize(this._activePositionResize, cx, cy, chartRefD);
          chartRefD.draw();
          this.cdr.detectChanges();
          return;
        }
        const dragged = this.drawingTools.drawingsValue.find(d => d.id === this._draggingLineId);
        if (
          dragged?.type === 'box-green' ||
          dragged?.type === 'box-red' ||
          dragged?.type === 'long-position' ||
          dragged?.type === 'short-position' ||
          dragged?.type === 'fib-retracement' ||
          dragged?.type === 'fib-extension'
        ) {
          const xScale = chartRefD.scales?.x;
          const yScale = chartRefD.scales?.y;
          if (xScale && yScale && this._dragStartDataPos && this._dragStartPoints) {
            const dx = xScale.getValueForPixel(cx) - this._dragStartDataPos.x;
            const dy = yScale.getValueForPixel(cy) - this._dragStartDataPos.y;
            this.drawingTools.moveDrawingDelta(this._draggingLineId, dx, dy, this._dragStartPoints);
            const updated = this.drawingTools.drawingsValue.find(d => d.id === this._draggingLineId);
            if (updated && (updated.type === 'long-position' || updated.type === 'short-position')) {
              this.syncPositionEditorFromDrawing(updated);
              this.cdr.detectChanges();
            }
            chartRefD.draw();
          }
        } else if (dragged?.type === 'vertical-line') {
          const xScale = chartRefD.scales?.x;
          if (xScale) {
            this.drawingTools.moveDrawingX(this._draggingLineId, xScale.getValueForPixel(cx));
            chartRefD.draw();
          }
        } else {
          const yScale = chartRefD.scales?.y;
          if (yScale) {
            this.drawingTools.moveDrawingY(this._draggingLineId, yScale.getValueForPixel(cy));
            chartRefD.draw();
          }
        }
      }
      return;
    }
    this.interaction.onTouchMove(event, this.chart?.chart as any);
  }
  onTouchEnd(event: TouchEvent): void {
    // End line / box drag
    if (this._draggingLineId) {
      this._draggingLineId = null;
      this.drawingTools.draggingId = null;
      this._dragStartDataPos = null;
      this._dragStartPoints  = null;
      this._activePositionResize = null;
      this._activeFibResize = null;
      return;
    }
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      const chartRef = this.chart?.chart as any;

      // Use the position from touchMove/touchStart (already snapped)
      const cursor = this.drawingTools.cursorPosition;
      let cx: number | null = cursor?.x ?? null;
      let cy: number | null = cursor?.y ?? null;

      // Fallback to the changedTouches position if cursor was never set
      if ((cx == null || cy == null) && event.changedTouches.length && chartRef) {
        const rect = chartRef.canvas.getBoundingClientRect();
        const rawX = event.changedTouches[0].clientX - rect.left;
        const rawY = event.changedTouches[0].clientY - rect.top;
        const snapped = this.snapToOhlc(rawX, rawY, chartRef);
        cx = snapped.x;
        cy = snapped.y;
      }

      if (chartRef && cx != null && cy != null) {
        const area = chartRef.chartArea;
        if (area && cx >= area.left && cx <= area.right && cy >= area.top && cy <= area.bottom) {
          const xScale = chartRef.scales?.x;
          const yScale = chartRef.scales?.y;
          if (xScale && yScale) {
            const dataX = xScale.getValueForPixel(cx);
            const dataY = yScale.getValueForPixel(cy);
            this.drawingTools.clearSnapIndicator();
            this.drawingTools.addPoint(dataX, dataY, chartRef);
            chartRef._isInteracting = false;
            chartRef.draw();
          }
        }
      }
      this._touchStartRaw = null;
      return;
    }
    // Clear any pending long-press (short tap, not a long press)
    const tappedPosId = this._pendingPosId;
    if (this._pendingPosId || this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
      this._pendingPosId   = null;
    }
    if (tappedPosId) {
      const d = this.drawingTools.drawingsValue.find(
        dr => dr.id === tappedPosId && (dr.type === 'long-position' || dr.type === 'short-position'),
      );
      if (d) {
        this.selectPositionDrawing(d);
        (this.chart?.chart as any)?.draw();
        this.cdr.detectChanges();
      }
      return;
    }
    // Dismiss edit sheet when tapping outside the selected position
    if (this.selectedPositionId && event.changedTouches.length === 1) {
      const chartRefT = this.chart?.chart as any;
      if (chartRefT) {
        const rectT = chartRefT.canvas.getBoundingClientRect();
        const tx = event.changedTouches[0].clientX - rectT.left;
        const ty = event.changedTouches[0].clientY - rectT.top;
        const hitId = this.hitTestBox(tx, ty, chartRefT);
        if (!hitId || hitId !== this.selectedPositionId) {
          this.dismissPositionEdit();
          chartRefT.draw();
          this.cdr.detectChanges();
        }
      }
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
        const snapped = this.snapToOhlc(cx, cy, chartRef);
        const area = chartRef.chartArea;
        if (area && snapped.x >= area.left && snapped.x <= area.right && snapped.y >= area.top && snapped.y <= area.bottom) {
          const xScale = chartRef.scales?.x;
          const yScale = chartRef.scales?.y;
          if (xScale && yScale) {
            const dataX = xScale.getValueForPixel(snapped.x);
            const dataY = yScale.getValueForPixel(snapped.y);
            this.drawingTools.clearSnapIndicator();
            this.drawingTools.addPoint(dataX, dataY, chartRef);
            chartRef._isInteracting = false;
            chartRef.draw();
          }
        }
      }
      return;
    }
    // Drag existing horizontal or vertical line
    {
      const chartRefD = this.chart?.chart as any;
      if (chartRefD) {
        const rectD = chartRefD.canvas.getBoundingClientRect();
        const mx = event.clientX - rectD.left;
        const my = event.clientY - rectD.top;
        const lineId = this.hitTestHorizontalLine(mx, my, chartRefD)
                    ?? this.hitTestVerticalLine(mx, my, chartRefD);
        if (lineId) {
          this._draggingLineId = lineId;
          this.drawingTools.draggingId = lineId;
          chartRefD.draw();
          return;
        }
        const fibHandle = this.hitTestFibHandle(mx, my, chartRefD);
        if (fibHandle) {
          this.drawingTools.selectedDrawingId = fibHandle.id;
          this._activeFibResize = fibHandle;
          this._draggingLineId = fibHandle.id;
          this.drawingTools.draggingId = fibHandle.id;
          const fib = this.drawingTools.drawingsValue.find(d => d.id === fibHandle.id);
          this._dragStartPoints = fib ? fib.points.map(p => ({ ...p })) : null;
          chartRefD.draw();
          return;
        }
        const fibBodyId = this.hitTestFibBody(mx, my, chartRefD);
        if (fibBodyId) {
          this.drawingTools.selectedDrawingId = fibBodyId;
          this._draggingLineId = fibBodyId;
          this.drawingTools.draggingId = fibBodyId;
          const fib = this.drawingTools.drawingsValue.find(d => d.id === fibBodyId);
          const xScale = chartRefD.scales?.x;
          const yScale = chartRefD.scales?.y;
          if (fib && xScale && yScale) {
            this._dragStartPoints = fib.points.map(p => ({ ...p }));
            this._dragStartDataPos = { x: xScale.getValueForPixel(mx), y: yScale.getValueForPixel(my) };
          }
          chartRefD.draw();
          return;
        }
        // Check for box drag
        const boxId = this.hitTestBox(mx, my, chartRefD);
        if (boxId) {
          const boxMeta = this.drawingTools.drawingsValue.find(d => d.id === boxId)!;
          if (boxMeta.type === 'long-position' || boxMeta.type === 'short-position') {
            this.selectPositionDrawing(boxMeta);
            this.cdr.detectChanges();
            const handle = this.hitTestPositionHandle(mx, my, chartRefD, boxId);
            if (handle) {
              this._activePositionResize = handle;
              this._draggingLineId = boxId;
              this.drawingTools.draggingId = boxId;
              this._dragStartPoints = boxMeta.points.map(p => ({ ...p }));
              chartRefD.draw();
              return;
            }
          }

          this._draggingLineId = boxId;
          this.drawingTools.draggingId = boxId;
          const xScale = chartRefD.scales?.x;
          const yScale = chartRefD.scales?.y;
          if (xScale && yScale) {
            this._dragStartDataPos = { x: xScale.getValueForPixel(mx), y: yScale.getValueForPixel(my) };
            this._dragStartPoints = boxMeta.points.map(p => ({ ...p }));
          }
          chartRefD.draw();
          return;
        }
      }
    }
    this.interaction.onMouseDown(event, this.chart?.chart as any);
  }
  onMouseMove(event: MouseEvent): void {
    if (this.drawingTools.activeToolValue) {
      const chartRef = this.chart?.chart as any;
      if (chartRef) {
        const rect = chartRef.canvas.getBoundingClientRect();
        const rawX = event.clientX - rect.left;
        const rawY = event.clientY - rect.top;
        const snapped = this.snapToOhlc(rawX, rawY, chartRef);
        this.drawingTools.updateCursor(snapped.x, snapped.y);
        if (snapped.label) this.drawingTools.setSnapIndicator(snapped.x, snapped.y, snapped.label);
        else this.drawingTools.clearSnapIndicator();
        chartRef._isInteracting = false;
        chartRef.draw();
      }
      return;
    }
    // Move dragged horizontal or vertical line
    if (this._draggingLineId) {
      const chartRefD = this.chart?.chart as any;
      if (chartRefD) {
        const rectD = chartRefD.canvas.getBoundingClientRect();
        const cx = event.clientX - rectD.left;
        const cy = event.clientY - rectD.top;
        if (this._activeFibResize) {
          this.applyFibResize(this._activeFibResize, cx, cy, chartRefD);
          chartRefD.draw();
          return;
        }
        if (this._activePositionResize) {
          this.applyPositionResize(this._activePositionResize, cx, cy, chartRefD);
          chartRefD.draw();
          this.cdr.detectChanges();
          return;
        }
        const dragged = this.drawingTools.drawingsValue.find(d => d.id === this._draggingLineId);
        if (
          dragged?.type === 'box-green' ||
          dragged?.type === 'box-red' ||
          dragged?.type === 'long-position' ||
          dragged?.type === 'short-position' ||
          dragged?.type === 'fib-retracement' ||
          dragged?.type === 'fib-extension'
        ) {
          const xScale = chartRefD.scales?.x;
          const yScale = chartRefD.scales?.y;
          if (xScale && yScale && this._dragStartDataPos && this._dragStartPoints) {
            const dx = xScale.getValueForPixel(cx) - this._dragStartDataPos.x;
            const dy = yScale.getValueForPixel(cy) - this._dragStartDataPos.y;
            this.drawingTools.moveDrawingDelta(this._draggingLineId, dx, dy, this._dragStartPoints);
            const updated = this.drawingTools.drawingsValue.find(d => d.id === this._draggingLineId);
            if (updated && (updated.type === 'long-position' || updated.type === 'short-position')) {
              this.syncPositionEditorFromDrawing(updated);
              this.cdr.detectChanges();
            }
            chartRefD.draw();
          }
        } else if (dragged?.type === 'vertical-line') {
          const xScale = chartRefD.scales?.x;
          if (xScale) {
            this.drawingTools.moveDrawingX(this._draggingLineId, xScale.getValueForPixel(cx));
            chartRefD.draw();
          }
        } else {
          const yScale = chartRefD.scales?.y;
          if (yScale) {
            this.drawingTools.moveDrawingY(this._draggingLineId, yScale.getValueForPixel(cy));
            chartRefD.draw();
          }
        }
      }
      return;
    }
    // Hover detection: show resize cursor when over a horizontal, vertical line or box
    {
      const chartRefH = this.chart?.chart as any;
      if (chartRefH) {
        const rectH = chartRefH.canvas.getBoundingClientRect();
        const mx = event.clientX - rectH.left;
        const my = event.clientY - rectH.top;
        const hHoriz = this.hitTestHorizontalLine(mx, my, chartRefH);
        const hVert  = !hHoriz ? this.hitTestVerticalLine(mx, my, chartRefH) : null;
        const hFibHandle = !hHoriz && !hVert ? this.hitTestFibHandle(mx, my, chartRefH) : null;
        const hFibBody = !hHoriz && !hVert && !hFibHandle ? this.hitTestFibBody(mx, my, chartRefH) : null;
        const hHandle = !hHoriz && !hVert && !hFibHandle && !hFibBody ? this.hitTestPositionHandle(mx, my, chartRefH) : null;
        const hBox   = !hHoriz && !hVert && !hFibHandle && !hFibBody && !hHandle ? this.hitTestBox(mx, my, chartRefH) : null;
        const hoverId = hHoriz ?? hVert ?? hFibHandle?.id ?? hFibBody ?? hHandle?.id ?? hBox;
        if (hoverId !== this.drawingTools.hoveredId) {
          this.drawingTools.hoveredId = hoverId;
          const cursor = hHoriz
            ? 'ns-resize'
            : hVert
              ? 'ew-resize'
              : hFibHandle
                ? 'move'
                : hFibBody
                  ? 'move'
              : hHandle
                ? (hHandle.row === 'entry'
                    ? 'ew-resize'
                    : ((hHandle.row === 'tp' && hHandle.side === 'left') || (hHandle.row === 'sl' && hHandle.side === 'right')
                        ? 'nwse-resize'
                        : 'nesw-resize'))
                : hBox
                  ? 'move'
                  : '';
          (chartRefH.canvas as HTMLCanvasElement).style.cursor = cursor;
          chartRefH.draw();
        }
      }
    }
    this.interaction.onMouseMove(event, this.chart?.chart as any);
  }
  onMouseUp(event: MouseEvent): void {
    if (this._draggingLineId) {
      this._draggingLineId = null;
      this.drawingTools.draggingId = null;
      this._dragStartDataPos = null;
      this._dragStartPoints  = null;
      this._activePositionResize = null;
      this._activeFibResize = null;
      return;
    }
    if (this.drawingTools.activeToolValue) return;
    this.interaction.onMouseUp(event, this.chart?.chart as any);
  }
  onMouseLeave(event: MouseEvent): void {
    if (this._draggingLineId) {
      this._draggingLineId = null;
      this.drawingTools.draggingId = null;
      this._dragStartDataPos = null;
      this._dragStartPoints  = null;
      this._activePositionResize = null;
      this._activeFibResize = null;
    }
    if (this.drawingTools.hoveredId) {
      this.drawingTools.hoveredId = null;
      const chartRefL = this.chart?.chart as any;
      if (chartRefL) {
        (chartRefL.canvas as HTMLCanvasElement).style.cursor = '';
        chartRefL.draw();
      }
    }
    if (this.drawingTools.activeToolValue) {
      this.drawingTools.clearCursor();
      this.drawingTools.clearSnapIndicator();
      const chartRef = this.chart?.chart as any;
      if (chartRef) {
        chartRef._isInteracting = false;
        chartRef.draw();
      }
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

    // Filter boxes to only those whose price zone overlaps with the current
    // candle range (+/- 20% buffer). This prevents 1D boxes far above/below
    // the current price from stretching the Y-axis on shorter timeframes.
    let filteredBoxes = this.boxes || [];
    if (this.baseData && this.baseData.length) {
      const highs = this.baseData.map((c: any) => c.h ?? 0);
      const lows = this.baseData.map((c: any) => c.l ?? Infinity);
      const dataMin = Math.min(...lows);
      const dataMax = Math.max(...highs);
      const buffer = (dataMax - dataMin) * 0.20;
      const rangeMin = dataMin - buffer;
      const rangeMax = dataMax + buffer;
      filteredBoxes = filteredBoxes.filter((b: any) => {
        const zoneMin = Number(b.ZoneMin ?? b.zone_min ?? b.MinZone ?? b.min_zone ?? b.minZone ?? NaN);
        const zoneMax = Number(b.ZoneMax ?? b.zone_max ?? b.MaxZone ?? b.max_zone ?? b.maxZone ?? NaN);
        if (isNaN(zoneMin) || isNaN(zoneMax)) return true; // keep if values unknown
        // Keep box only if it overlaps with [rangeMin, rangeMax]
        return zoneMax >= rangeMin && zoneMin <= rangeMax;
      });
    }

    const overlays = buildBoxDatasets({
      boxes: filteredBoxes,
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
    this.saveCurrentChartState();
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
    this.saveCurrentChartState();
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
    this.saveCurrentChartState();
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
    this.saveCurrentChartState();
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

  /**
   * Snaps pixel (cx, cy) to the nearest OHLC point of the nearest VISIBLE candle
   * when magnet mode is active. Returns snapped pixel coords + optional snap label.
   * Strong mode: snaps within 80px X / 60px Y.
   * Weak mode:   snaps within 35px X / 25px Y.
   */
  private snapToOhlc(
    cx: number,
    cy: number,
    chartRef: any,
  ): { x: number; y: number; label: string | null } {
    const mode = this.drawingTools.magnetMode;
    if (mode === 'off') return { x: cx, y: cy, label: null };

    const xScale = chartRef.scales?.x;
    const yScale = chartRef.scales?.y;
    if (!xScale || !yScale) return { x: cx, y: cy, label: null };

    // Use the actual chart data (not Angular binding) and find the candlestick dataset
    const candleDs = (chartRef.data?.datasets as any[])?.find((d: any) => d.type === 'candlestick');
    const data = (candleDs?.data || chartRef.data?.datasets?.[0]?.data || []) as Array<{
      x: number; o: number; h: number; l: number; c: number;
    }>;
    if (!data.length) return { x: cx, y: cy, label: null };

    // Pixel snap radii
    const snapXPx = mode === 'strong' ? 80 : 35;
    const snapYPx = mode === 'strong' ? 60 : 25;

    // Only search visible candles (between xScale.min and xScale.max) for performance
    const minTime = xScale.min;
    const maxTime = xScale.max;
    const searchData = data.filter((d: any) => d.x >= minTime && d.x <= maxTime);
    if (!searchData.length) return { x: cx, y: cy, label: null };

    // Find nearest candle by X pixel distance
    let nearestCandle: (typeof searchData)[0] | null = null;
    let nearestXDist = Infinity;
    for (const candle of searchData) {
      const dist = Math.abs(xScale.getPixelForValue(candle.x) - cx);
      if (dist < nearestXDist) { nearestXDist = dist; nearestCandle = candle; }
    }
    if (!nearestCandle || nearestXDist > snapXPx) return { x: cx, y: cy, label: null };

    // For fib tools snap only to High/Low (swing points) — TradingView behaviour.
    // For other tools snap to all OHLC.
    const isFibTool =
      this.drawingTools.activeToolValue === 'fib-retracement' ||
      this.drawingTools.activeToolValue === 'fib-extension';

    const midPy = yScale.getPixelForValue((nearestCandle.h + nearestCandle.l) / 2);
    let ohlc: Array<{ price: number; label: string }>;
    if (isFibTool) {
      // Prefer the extremity closest to cursor — if above midpoint snap to High, else to Low
      ohlc = cy <= midPy
        ? [{ price: nearestCandle.h, label: 'H' }, { price: nearestCandle.l, label: 'L' }]
        : [{ price: nearestCandle.l, label: 'L' }, { price: nearestCandle.h, label: 'H' }];
    } else {
      ohlc = [
        { price: nearestCandle.h, label: 'H' },
        { price: nearestCandle.l, label: 'L' },
        { price: nearestCandle.o, label: 'O' },
        { price: nearestCandle.c, label: 'C' },
      ];
    }

    let snapEntry = ohlc[0];
    let nearestYDist = Infinity;
    for (const entry of ohlc) {
      const dist = Math.abs(yScale.getPixelForValue(entry.price) - cy);
      if (dist < nearestYDist) { nearestYDist = dist; snapEntry = entry; }
    }

    const snapYRadius = isFibTool ? snapYPx * 1.5 : snapYPx; // wider snap zone for fibs
    if (nearestYDist > snapYRadius) return { x: cx, y: cy, label: null };

    return {
      x: xScale.getPixelForValue(nearestCandle.x),
      y: yScale.getPixelForValue(snapEntry.price),
      label: snapEntry.label,
    };
  }

  get drawingHint(): string {
    const tool = this.drawingTools.activeToolValue;
    const pending = this.drawingTools.pendingDrawingPoints.length;
    const tap = 'Tik';
    const tapLower = 'tik op';
    switch (tool) {
      case 'horizontal-line': return `${tap} om horizontale lijn te plaatsen`;
      case 'vertical-line':   return `${tap} om verticale lijn te plaatsen`;
      case 'fib-retracement':
        return pending === 0 ? `Punt 1/2 — ${tapLower} het laagpunt` : `Punt 2/2 — ${tapLower} het hoogtepunt`;
      case 'fib-extension':
        if (pending === 0) return `Punt 1/3 — ${tapLower} startpunt (A)`;
        if (pending === 1) return `Punt 2/3 — ${tapLower} eindpunt (B)`;
        return `Punt 3/3 — ${tapLower} de pullback (C)`;
      default: return '';
    }
  }

  /** Step dot array for the drawing hint progress indicator. */
  get drawingStepRange(): number[] {
    const tool = this.drawingTools.activeToolValue;
    if (tool === 'fib-extension')  return [0, 1, 2];
    if (tool === 'fib-retracement') return [0, 1];
    return [0];
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

  // ------------------------------------------------------------------
  // Chart State persistence (drawings + settings)
  // ------------------------------------------------------------------

  /** Build a snapshot of current chart settings. */
  private buildSettingsSnapshot() {
    return {
      showBoxes: this.showBoxes,
      showKeyZones: this.showKeyZones,
      showOrders: this.showOrders,
      showIndicators: this.showIndicators,
      showMarketCipher: this.showMarketCipher,
      showDivergences: this.showDivergences,
      boxMode: this.boxMode,
    };
  }

  /** Persist current drawings + settings to the backend (fire-and-forget). */
  saveCurrentChartState(): void {
    const symbol = this.selectedSymbol?.SymbolName;
    if (!symbol || !this.selectedTimeframe) return;
    const state: ChartStateDto = {
      exchangeId: 0, // filled server-side via token / waitForExchangeId$
      symbol,
      timeframe: this.selectedTimeframe,
      drawings: this.drawingTools.drawingsValue,
      settings: this.buildSettingsSnapshot(),
    };
    this.marketService
      .saveChartState(state)
      .pipe(take(1))
      .subscribe({ error: (e) => console.warn('[ChartState] save error', e) });
  }

  /**
   * Load persisted chart state for the current symbol + timeframe, then
   * restore drawings and visual settings from the response.
   */
  loadChartStateForCurrentContext(): void {
    const symbol = this.selectedSymbol?.SymbolName;
    if (!symbol || !this.selectedTimeframe) return;
    this.marketService
      .loadChartState(symbol, this.selectedTimeframe)
      .pipe(take(1))
      .subscribe({
        next: (state) => {
          if (!state) return;
          this._restoringChartState = true;
          try {
            // Restore drawings
            if (Array.isArray(state.drawings)) {
              this.drawingTools.setDrawings(state.drawings);
            }
            // Restore settings toggles
            const s = state.settings;
            if (s) {
              if (s.showBoxes !== undefined) this.showBoxes = s.showBoxes;
              if (s.showKeyZones !== undefined) this.showKeyZones = s.showKeyZones;
              if (s.showOrders !== undefined) this.showOrders = s.showOrders;
              if (s.showIndicators !== undefined) this.showIndicators = s.showIndicators;
              if (s.showMarketCipher !== undefined) this.showMarketCipher = s.showMarketCipher;
              if (s.showDivergences !== undefined) this.showDivergences = s.showDivergences;
              if (s.boxMode !== undefined) this.boxMode = s.boxMode;
            }
          } finally {
            this._restoringChartState = false;
          }
          this.cdr.markForCheck();
        },
        error: (e) => console.warn('[ChartState] load error', e),
      });
  }
}
