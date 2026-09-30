/**
 * Shared implementation of the Chart.js candlestick chart pages
 * (/chart, /web-chart, /chart-v3, /market-cipher-b-chart).
 *
 * Route components extend this class and supply their own @Component metadata
 * (template, styles, providers). Per-route behaviour is expressed through the
 * protected flags and hook methods in the "Subclass hooks" section below.
 */
import {
  Directive,
  OnInit,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  inject,
  NgZone,
  ChangeDetectorRef,
  Type,
} from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { Chart as ChartJS } from 'chart.js';
import './chart-setup';
import {
  ChartInteractionService,
  GestureKind,
} from './services/chart-interaction.service';
import { DrawingToolsService } from './services/drawing-tools.service';
import { createDrawingToolsPlugin } from './services/drawing-tools.plugin';
import { formatPriceChange, buildBoxDatasets } from './utils/chart-utils';
import {
  aggregateToLiveCandle,
  applyLiveCandleToBaseData,
  InternalCandle,
  isBinanceExchange,
  isDominanceSymbol,
} from './utils/custom-timeframe-live';
import { ChartIndicatorsService } from './services/chart-indicators.service';
import { ChartBoxesService } from './services/chart-boxes.service';
import { ChartLayoutService } from './services/chart-layout.service';
import { ChartPerformanceService } from './services/chart-performance.service';
import { ChartService } from '../../modules/shared/services/http/chart.service';
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
  MonoTypeOperatorFunction,
} from 'rxjs';
import { ChartStateDto } from 'src/app/modules/shared/models/chart/chart-state.dto';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { OrderModel } from 'src/app/modules/shared/models/orders/order.dto';
import { KeyZonesModel } from 'src/app/modules/shared/models/chart/keyZones.dto';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { ChartPriceTickerService } from './services/chart-price-ticker.service';
import { LiveCandleUpdate } from './models/live-candle-update';
import { ExchangeCandleStreamService } from './services/exchange-candle-stream.service';
import { ExchangeStreamFactory } from './services/exchange-stream.factory';
import { mergeLiveCandle } from './utils/merge-live-candles';
import {
  getTimeframeBucketStart,
  normalizeTimeframe,
  timeframeToMilliseconds,
} from './utils/timeframe-bucketing';
import { debugLog } from 'src/app/helpers/debug-log';

/** A component rendered below the main chart (e.g. the Market Cipher B panel). */
export interface ChartAuxPanel {
  component: Type<unknown>;
  inputs: Record<string, unknown>;
}

@Directive()
export abstract class ChartBaseComponent implements OnInit, AfterViewInit, OnDestroy {
  exchanges: Exchange[] = [];
  selectedExchange = new Exchange();
  loading = false;
  /**
   * Called when the exchange is changed from the dropdown.
   * Dispatches NGRX action to update exchange and clears selected symbol.
   */
  onExchangeChange(exchange: Exchange): void {
    debugLog('Exchange changed to:', exchange);
    // Stop the previous exchange's stream/ticker before anything reloads, so
    // its ticks cannot merge into the new exchange's candles while loading.
    this.beginSelectionChange();
    this._settingsService.setSelectedExchange(exchange);
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
    { label: '3m', value: '3m' },
    { label: '6m', value: '6m' },
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
          callback: (val: any, index: number, ticks: Array<{ value: number }>) =>
            this.formatTimeTick(val, index, ticks),
          color: '#787b86',
          maxTicksLimit: 10,
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 14,
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
  /**
   * Emits on every exchange/symbol/timeframe change (beginSelectionChange).
   * Every selection-driven HTTP chain (candles, boxes, orders, key zones,
   * indicators, divergences, market cipher, chart state) is piped through
   * untilSelectionChange(), so a slow response for an older selection is
   * unsubscribed before it can overwrite state of the newer one.
   */
  private readonly selectionChanged$ = new Subject<void>();
  /** Context (see contextKey) whose boxes/orders/key zones are currently loaded; null = none/in flight. */
  private _loadedBoxesKey: string | null = null;
  private _loadedOrdersKey: string | null = null;
  private _loadedKeyZonesKey: string | null = null;
  private resizeObserver?: ResizeObserver;
  private containerSized = false;
  // Prevent duplicate network calls on rapid/duplicate symbol change events
  private lastRequestedSymbol: string | null = null;
  private exchangeStreamSubscription: any = null;
  private activeExchangeStream: ExchangeCandleStreamService | null = null;
  /** Set in ngOnDestroy; async callbacks (RAF, HTTP) must not start streams afterwards. */
  protected destroyed = false;
  /**
   * Incremented whenever live streams are torn down. Each stream/ticker captures
   * the generation it was started in and ignores ticks once it is outdated.
   */
  private _liveGeneration = 0;
  /**
   * Incremented on every exchange/symbol/timeframe change. Load chains capture
   * it and only start a live stream if no newer selection change happened.
   */
  private _selectionGeneration = 0;

  // ── Custom timeframe (6m / 12m / 24m) live-candle state ──────────────────
  /** UTC timestamp (ms) of the start of the currently tracked custom period */
  private _ctfPeriodStart = 0;

  // ── Live render coalescing (one redraw per animation frame) ──────────────
  private _liveRenderRaf: number | null = null;
  private _liveRenderChartDirty = false;
  private _liveRenderAuxDirty = false;
  private _liveRenderViewKey = '';

  private readonly marketService = inject(ChartService);
  private readonly _settingsService = inject(SettingsService);
  protected readonly interaction = inject(ChartInteractionService);
  private readonly boxesService = inject(ChartBoxesService);
  private readonly indicatorsService = inject(ChartIndicatorsService);
  protected readonly layout = inject(ChartLayoutService);
  private readonly performance = inject(ChartPerformanceService);
  private readonly keyZoneSettings = inject(KeyZoneSettingsService);
  private readonly exchangeStreamFactory = inject(ExchangeStreamFactory);
  private readonly chartPriceTicker = inject(ChartPriceTickerService);
  private chartPriceTickerSubscription: any = null;
  private liveTickerPrice: number | null = null;
  protected readonly ngZone = inject(NgZone);
  readonly drawingTools = inject(DrawingToolsService);
  private drawingPluginRegistered = false;
  private _resizeRafId: number | null = null;
  private _drawRafPending = false;
  private _lastKeyZoneXMin: number | null = null;
  private _lastKeyZoneXMax: number | null = null;
  private _ctrlSavedMagnetMode: 'off' | 'weak' | 'strong' | null = null;
  /** Raw (pre-snap) touch start pixel position — used for drag-distance check */
  private _touchStartRaw: { x: number; y: number } | null = null;
  private readonly MIN_TOUCH_DRAG_PX = 8;
  private readonly TOUCH_DRAW_MAGNET_Y_OFFSET_PX = 52;
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
  private _activeTrendResize: { id: string; pointIndex: number } | null = null;

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

  constructor(protected cdr: ChangeDetectorRef) {}

  // ── Subclass hooks ───────────────────────────────────────────────────────
  // Defaults are the shared behaviour; route components override only what
  // differs for them.

  /** Exchange preferred on a first visit (no exchange in the store yet); null = first API result. */
  protected readonly defaultExchangeName: string | null = null;

  /** Request boxes for the selected timeframe instead of the service default ('1d'). */
  protected readonly boxesUseSelectedTimeframe: boolean = false;

  /** Run scheduleInitializeChart() from inside loadCandles() (false when the caller fits the viewport). */
  protected readonly initializeChartOnCandleLoad: boolean = true;

  /** Extend key-zone lines into the x overscroll area instead of ending them at the last candle. */
  protected readonly keyZonesExtendIntoOverscroll: boolean = true;

  /** Optional component rendered below the main chart (outside fullscreen). */
  get auxPanel(): ChartAuxPanel | null {
    return null;
  }

  /** Called right after freshly loaded candles are stored in baseData. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onCandlesLoaded(_candles: InternalCandle[]): void {
    /* no-op by default */
  }

  /** Called after the viewport changed (initial fit, fitToData, end of pan/zoom gestures). */
  protected onViewportChanged(): void {
    /* no-op by default */
  }

  /** Called after the chart canvas was resized and redrawn. */
  protected onChartResized(): void {
    /* no-op by default */
  }

  /** Candles used as the x-extent of key-zone lines. */
  protected keyZoneCandles(): Array<{ x: number }> | undefined {
    return this.chartData.datasets[0]?.data as Array<{ x: number }> | undefined;
  }

  /**
   * Runs after candles for a new timeframe were loaded; must call `then`
   * (stream reconnect, signal reloads, state restore) once the viewport is set.
   */
  protected afterTimeframeCandlesLoaded(then: () => void): void {
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
    then();
  }

  /** Update header price / change after baseData received a live candle. */
  protected applyLivePriceFromLastCandle(): void {
    const last = this.baseData[this.baseData.length - 1];
    const prev = this.baseData[this.baseData.length - 2];
    if (!last) return;
    this.setCandleDisplayPrice(last.c);
    this.priceChange = prev ? last.c - prev.c : 0;
    this.priceChangeFormatted = formatPriceChange(this.priceChange, prev?.c || 0);
  }

  /**
   * Extra per-frame live render work, run when a live update flagged the aux
   * panel dirty (candle closed / new bar). Return true to force change detection.
   */
  protected flushLiveRenderAux(): boolean {
    return false;
  }

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
  private formatTimeTick(
    val: any,
    index: number = 0,
    ticks?: Array<{ value: number }>,
  ): string {
    if (val == null) return '';

    try {
      // Keeps '1M' (month) distinct from '1m' (minute).
      const timeframe = normalizeTimeframe(this.selectedTimeframe || '1h');
      const date = this.resolveTickDate(val);
      if (!date) return '';

      // Avoid repeated labels in the same visual bucket (common on mobile).
      if (index > 0 && ticks?.length) {
        const prevRaw = ticks[index - 1]?.value;
        const prevDate = this.resolveTickDate(prevRaw);
        if (
          prevDate &&
          this.timeBucketKey(prevDate, timeframe) ===
            this.timeBucketKey(date, timeframe)
        ) {
          return '';
        }
      }

      return this.buildTimeTickLabel(date, timeframe);
    } catch {
      return '';
    }
  }

  private resolveTickDate(rawTick: any): Date | null {
    const asNumber = Number(rawTick);
    const exactCandle = this.baseData?.find((c: any) => Number(c?.x) === asNumber);
    const nearestCandle =
      exactCandle ||
      this.baseData?.find((c: any) => Math.abs(Number(c?.x) - asNumber) < 1000);
    const candidate = nearestCandle?.timeStr ?? rawTick;
    const d = candidate instanceof Date ? candidate : new Date(candidate);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  private timeBucketKey(date: Date, timeframe: string): string {
    if (timeframe.endsWith('m') || timeframe.endsWith('h')) {
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
    }
    if (timeframe.endsWith('d') || timeframe.endsWith('w')) {
      return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    }
    return `${date.getFullYear()}-${date.getMonth()}`;
  }

  private buildTimeTickLabel(date: Date, timeframe: string): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const dd = date.getDate();
    const mon = months[date.getMonth()];

    if (timeframe.endsWith('m') || timeframe.endsWith('h')) {
      const isBoundary = hh === '00' && min === '00';
      return isBoundary ? `${dd} ${mon}` : `${hh}:${min}`;
    }

    if (timeframe.endsWith('w')) {
      return dd <= 7 ? `${mon} '${String(date.getFullYear()).slice(-2)}` : `${dd} ${mon}`;
    }

    if (timeframe.endsWith('d')) {
      return dd === 1 ? `${mon} '${String(date.getFullYear()).slice(-2)}` : `${dd} ${mon}`;
    }

    return `${mon} '${String(date.getFullYear()).slice(-2)}`;
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

  getCurrentPriceLineLeft(): number {
    const chartRef: any = this.chart?.chart;
    try {
      const xScale = chartRef?.scales?.x;
      const lastCandle = this.baseData[this.baseData.length - 1];
      if (!xScale || !lastCandle) return 0;
      return Math.max(0, xScale.getPixelForValue(lastCandle.x));
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
    // Establish device-aware render profile before chart interaction starts.
    this.performance.initialize();

    // Chain: load exchanges then read selected exchange from store; fallback to first exchange if none set.
    this.marketService
      .getExchanges()
      .pipe(
        tap((exchanges) => {
          this.exchanges = exchanges || [];
          debugLog('Loaded exchanges:', this.exchanges);
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
                this._settingsService.setSelectedExchange(match as Exchange);
              }
            } else {
              // Store had an exchange but it did not exist in freshly loaded list; fall back to first
              if (this.exchanges.length) {
                this.selectedExchange = this.exchanges[0] as Exchange;
                this._settingsService.setSelectedExchange(this.selectedExchange);
              } else {
                this.selectedExchange = exchange; // keep original
              }
            }
            debugLog('Selected exchange (resolved):', this.selectedExchange);
          } else if (this.exchanges.length) {
            // Prefer the route's default exchange for a first visit, retaining the
            // first API result as a fallback.
            const preferred = this.defaultExchangeName;
            const selectedExchange =
              (preferred
                ? this.exchanges.find((exchange) => exchange.Name === preferred)
                : undefined) ?? this.exchanges[0];
            this.selectedExchange = selectedExchange;
            this._settingsService.setSelectedExchange(selectedExchange);
            debugLog(
              'No exchange in store; dispatched default exchange:',
              selectedExchange,
            );
          }
        }),

        takeUntil(this.destroy$),
      )
      .subscribe({ error: (e) => console.warn('Exchange init error', e) });

    // Apply the selected timeframe from the NgRx settings store (in-memory).
    try {
      this._settingsService
        .getSelectedTimeframe()
        .pipe(takeUntil(this.destroy$))
        .subscribe((tf) => {
          if (tf) {
            // Validate that the timeframe exists in our app timeframe list.
            // Do NOT map to the Binance interval here — that mapping is only
            // used internally by setupExchangeStream. Storing the exchange
            // interval (e.g. '30m') would corrupt what '24m' buttons match.
            const knownAppTimeframe = this.timeframes.some(
              (t) => t.value === tf,
            );
            if (knownAppTimeframe) {
              this.selectedTimeframe = tf;
            } else {
              // Unknown timeframe; fallback to '1h'
              console.warn('[Chart] Unknown stored timeframe:', tf, '- falling back to 1h');
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
    this.destroyed = true;
    this.stopLiveStreams();
    if (this._resizeRafId !== null) {
      cancelAnimationFrame(this._resizeRafId);
      this._resizeRafId = null;
    }
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
          if (this._resizeRafId !== null) cancelAnimationFrame(this._resizeRafId);
          this._resizeRafId = requestAnimationFrame(() => {
            this._resizeRafId = null;
            if (this.destroyed) return;
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
              this.onChartResized();
            }
          });
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
          const kzChartRef = this.chart?.chart as any;
          const kzXMin = kzChartRef?.scales?.x?.min ?? null;
          const kzXMax = kzChartRef?.scales?.x?.max ?? null;
          const kzRange = (kzXMax ?? 0) - (kzXMin ?? 0);
          const kzThreshold = kzRange * 0.005;
          if (
            this._lastKeyZoneXMin === null ||
            Math.abs((kzXMin ?? 0) - this._lastKeyZoneXMin) > kzThreshold ||
            Math.abs((kzXMax ?? 0) - (this._lastKeyZoneXMax ?? 0)) > kzThreshold
          ) {
            this._lastKeyZoneXMin = kzXMin;
            this._lastKeyZoneXMax = kzXMax;
            this.addKeyZoneDatasets();
          }
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
      } catch {
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
      } catch {
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
          } catch {}
          try {
            if (typeof saved.xMax === 'number')
              chartRef.scales.x.max = saved.xMax;
          } catch {}
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
          } catch {}
          try {
            if (typeof saved.yMax === 'number')
              chartRef.scales.y.max = saved.yMax;
          } catch {}
        }
      } catch {
        // ignore
      }
      try {
        chartRef.update('none');
      } catch {
        try {
          this.chart?.update();
        } catch {}
      }
    } else {
      try {
        this.chart?.update();
      } catch {
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
        } catch {
          /* ignore */
        }
      }
    } catch {
      // ignore errors
    }
  }

  loadSymbolsAndBoxes(): void {
    const selectionGeneration = this._selectionGeneration;
    this.marketService
      .getSymbols()
      .pipe(
        tap((symbols: any[]) => {
          this.availableSymbols = symbols || [];
          debugLog('symbols:', symbols);
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
          debugLog('?? Loading candles for:', symbolName);
          return this.loadCandles(symbolName).pipe(
            tap(() => debugLog('[Chart] loadCandles completed for:', symbolName)),
            switchMap(() => {
              debugLog('[Chart] Starting forkJoin for boxes/orders, showOrders=', this.showOrders);
              return forkJoin({
                boxes: this.fetchBoxes(symbolName).pipe(
                  tap(result => debugLog('[Chart] fetchBoxes result:', result)),
                  take(1) // Ensure observable completes after emitting
                ),
                orders: this.showOrders ? this.fetchOrders(symbolName).pipe(
                  tap(result => debugLog('[Chart] fetchOrders result:', result)),
                  take(1) // Ensure observable completes after emitting
                ) : of([]).pipe(
                  tap(() => debugLog('[Chart] orders skipped (showOrders=false)')),
                  take(1) // Ensure this completes
                ),
              }).pipe(
                tap(result => debugLog('[Chart] forkJoin completed with result:', result))
              );
            }),
          );
        }),
        // A newer exchange/symbol/timeframe change cancels this whole chain
        // (symbols, candles, boxes, orders) before it can overwrite newer data.
        this.untilSelectionChange(),
        finalize(() => this.finishSelectionLoad(selectionGeneration)),
      )
      .subscribe({
        next: (result) => {
          // Start live stream after initial load completes
          debugLog('[Chart] ✅ loadSymbolsAndBoxes .subscribe().next() FIRED with result:', result);
          if (!this.isCurrentSelection(selectionGeneration)) return;
          this.finishSelectionLoad(selectionGeneration);
          // Re-schedule chart initialisation now that loading=false and the chart
          // instance is guaranteed to be available (covers 12m/24m refresh case
          // where the tap's scheduleInitializeChart ran before scales were ready).
          if (this.baseData?.length) {
            this.scheduleInitializeChart(this.baseData);
          }
          this.setupExchangeStream();
          // Exchange change / initial load: key zones, Market Cipher and
          // divergences still belong to the previous exchange (or were never
          // loaded), so reload every enabled overlay for the new context.
          this.refreshContextOverlays(this.selectedSymbolName);
          this.reloadSignalOverlays();
          // Restore persisted drawings & settings from backend
          this.loadChartStateForCurrentContext();
        },
        error: (err) => {
          console.warn('[Chart] ❌ loadSymbolsAndBoxes error:', err);
        },
        complete: () => debugLog('[Chart] loadSymbolsAndBoxes subscribe completed'),
      });
  }

  // Called when user switches mode in UI
  onBoxModeChange(mode: 'boxes' | 'all'): void {
    const previous = this.boxMode;
    this.boxMode = mode;

    // Ensure boxes are visible when switching mode
    this.showBoxes = true;

    if (this.selectedSymbol && this.selectedSymbol.SymbolName) {
      debugLog(
        `Box mode changed from ${previous} to ${mode} — fetching boxes for ${this.selectedSymbol.SymbolName}`,
      );

      this.fetchBoxes(this.selectedSymbol.SymbolName)
        .pipe(this.untilSelectionChange())
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

  onBoxModeToggle(): void {
    this.onBoxModeChange(this.boxMode === 'boxes' ? 'all' : 'boxes');
  }

  // New: fetch boxes using selected mode
  fetchBoxes(symbolName: string): Observable<any[]> {
    if (!symbolName) return of([]);

    // Clear existing boxes immediately
    this.boxes = [];
    this._loadedBoxesKey = null;
    const boxesKey = this.boxesContextKey(symbolName);

    // Remove existing box datasets immediately
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isBox,
      );
    });

    debugLog(`fetchBoxes(start): mode=${this.boxMode} symbol=${symbolName}`);

    const boxes$ = this.boxesUseSelectedTimeframe
      ? this.boxesService.getBoxes(symbolName, this.boxMode, this.selectedTimeframe)
      : this.boxesService.getBoxes(symbolName, this.boxMode);
    return boxes$.pipe(
      tap((filtered) => {
        debugLog(
          `fetchBoxes(received): ${filtered?.length || 0} boxes for mode=${this.boxMode}`,
        );
        this.boxes = filtered || [];
        this._loadedBoxesKey = boxesKey;

        // Always render if we have both baseData and boxes, regardless of showBoxes flag
        // The mode change implies user wants to see the result
        if (this.baseData && this.baseData.length && this.boxes.length) {
          debugLog(
            `fetchBoxes: calling addBoxesDatasets with ${this.boxes.length} boxes`,
          );
          this.addBoxesDatasets();
        } else {
          debugLog(
            `fetchBoxes: skipping render - baseData=${!!this.baseData?.length}, boxes=${this.boxes.length}`,
          );
        }
      }),
    );
  }

  onBoxesToggle(): void {
    debugLog('?? onBoxesToggle triggered. showBoxes =', this.showBoxes);
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
        .pipe(this.untilSelectionChange())
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
      // Stop the previous symbol's stream/ticker and cancel its in-flight loads
      // before the new candles load.
      const selectionGeneration = this.beginSelectionChange();
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
              keyZones: this.showKeyZones
                ? this.fetchKeyZones(capturedSymbolName).pipe(take(1))
                : of(null),
            }),
          ),
          // A newer exchange/symbol/timeframe change cancels this chain.
          this.untilSelectionChange(),
          finalize(() => {
            // Always clear the guard/spinner when the chain ends — errors and
            // cancellation included — unless a newer request owns them.
            if (this.lastRequestedSymbol === capturedSymbolName) {
              this.lastRequestedSymbol = null;
            }
            this.finishSelectionLoad(selectionGeneration);
          }),
        )
        .subscribe({
          next: () => {
            if (!this.isCurrentSelection(selectionGeneration)) return;
            // On iOS Safari, axis ranges sometimes stick between symbol switches.
            // Force a fit to data after datasets are updated to refresh x/y ranges.
            this.refitChartToData();
            // Double-tap on the next macrotask so Chart.js internal state is settled
            setTimeout(() => {
              if (this.isCurrentSelection(selectionGeneration)) {
                this.refitChartToData();
              }
            }, 0);
            this.setupExchangeStream();

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

  /** Replace the options/scales references (forces ng2-charts to re-read them) and fit to data. */
  private refitChartToData(): void {
    try {
      const prev = this.chartOptions || {};
      const prevScales = (prev as any).scales || {};
      this.chartOptions = { ...prev, scales: { ...prevScales } };
    } catch {}
    try {
      this.fitToData();
    } catch {}
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
        } catch {}
        try {
          if (chartRef.scales.y && chartRef.scales.y.options) {
            delete chartRef.scales.y.options.min;
            delete chartRef.scales.y.options.max;
          }
        } catch {}
        try {
          if (chartRef.scales.indicator && chartRef.scales.indicator.options) {
            delete chartRef.scales.indicator.options.min;
            delete chartRef.scales.indicator.options.max;
          }
        } catch {}
      }

      try {
        chartRef?.update?.('none');
      } catch {
        /* ignore */
      }
    } catch {
      // ignore any errors in cleanup
    }
  }

  onTimeframeChange(timeframe: string): void {
    // Stop the previous timeframe's stream before selectedTimeframe changes, so
    // e.g. 4h ticks can never be merged into freshly loaded 1h candles.
    const selectionGeneration = this.beginSelectionChange();
    this.selectedTimeframe = timeframe;
    // Store the selection in NgRx. The selected timeframe is in-memory only:
    // state-persistence.meta-reducer.ts (the single localStorage layer) does
    // not persist it.
    try {
      this._settingsService.dispatchAppAction(
        SettingsActions.setSelectedTimeframe({ timeframe }),
      );
    } catch {}
    const symbolName = this.selectedSymbol?.SymbolName;
    // Clear stale axis ranges so the new timeframe gets a fresh viewport
    this.clearScaleRanges();
    this.loading = true;
    this.cdr.markForCheck();
    if (!symbolName) {
      // The initial symbol resolution (loadSymbolsAndBoxes) was still in flight
      // and has just been cancelled: restart it for the new timeframe.
      this.loadSymbolsAndBoxes();
      return;
    }
    // beginSelectionChange() above cancelled any previous in-flight load, so a
    // slow 12m response cannot overwrite a freshly-requested 24m dataset.
    this.loadCandles(symbolName)
      .pipe(
        this.untilSelectionChange(),
        finalize(() => this.finishSelectionLoad(selectionGeneration)),
      )
      .subscribe({
        next: () => {
          if (!this.isCurrentSelection(selectionGeneration)) return;
          this.finishSelectionLoad(selectionGeneration);
          // Overlays whose load was cancelled by this change (or that depend on
          // the timeframe) are reloaded; others stay as they are.
          this.refreshContextOverlays(symbolName);
          this.afterTimeframeCandlesLoaded(() => {
            // Skip when destroyed or superseded by a newer selection change
            // (that change's own load chain restarts the stream).
            if (!this.isCurrentSelection(selectionGeneration)) return;
            this.setupExchangeStream();

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
          });
        },
        error: (e) => {
          console.warn('loadCandles error', e);
        },
      });
  }

  /**
   * After a timeframe change, reload the symbol-scoped overlays that are not
   * loaded for the current context: boxes (timeframe-scoped on /chart), and
   * orders / key zones when enabled. Covers overlays whose previous load was
   * cancelled by the selection change.
   */
  private refreshContextOverlays(symbolName: string): void {
    const loads: Observable<unknown>[] = [];
    if (this._loadedBoxesKey !== this.boxesContextKey(symbolName)) {
      loads.push(this.fetchBoxes(symbolName).pipe(take(1)));
    }
    if (this.showOrders && this._loadedOrdersKey !== this.contextKey(symbolName)) {
      loads.push(this.fetchOrders(symbolName).pipe(take(1)));
    }
    if (this.showKeyZones && this._loadedKeyZonesKey !== this.contextKey(symbolName)) {
      loads.push(this.fetchKeyZones(symbolName).pipe(take(1)));
    }
    if (!loads.length) return;
    forkJoin(loads)
      .pipe(this.untilSelectionChange())
      .subscribe({
        error: (e) => console.warn('overlay refresh error', e),
      });
  }

  /** Reload the enabled signal overlays (Market Cipher, divergences) for the current selection. */
  private reloadSignalOverlays(): void {
    if (this.showMarketCipher) {
      this.loadMarketCipherSignals();
    }
    if (this.showDivergences) {
      this.loadDivergences();
    }
  }

  //
  // ?? Load chart data and update price info
  //
  loadCandles(symbol: string): Observable<any[]> {
    if (!symbol?.trim()) {
      return of([]);
    }

    // Reset retry counter so every fresh load gets a clean slate of retries.
    this._initTries = 0;
    const fetchTimeframe = this.selectedTimeframe;
    debugLog('[Chart] loadCandles:', { symbol, fetchTimeframe });

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
          debugLog('[Chart] API returned', mapped.length, 'candles for', fetchTimeframe);
          return mapped;
        }),
        tap((mapped: any[]) => {
          if (!mapped.length) {
            console.warn('[Chart] No candle data received for', symbol, fetchTimeframe);
            return;
          }
          // store base data for overlays
          this.baseData = mapped;
          this.onCandlesLoaded(mapped);
          const latestCandle = mapped[mapped.length - 1];
          const previousCandle = mapped[mapped.length - 2];
          this.setCandleDisplayPrice(latestCandle.c);
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
                debugLog('[Chart] Re-render orders after candle load.');
              } catch (e) {
                console.warn('orders redraw error', e);
              }
            }
          }
          if (this.initializeChartOnCandleLoad) {
            this.scheduleInitializeChart(mapped);
          }

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
    if (this.destroyed) return;
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
    this.onViewportChanged();
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
  protected setYAxisStep(chartRef: any, yMin?: number, yMax?: number): void {
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

  private setupExchangeStream(): void {
    debugLog('[Chart] setupExchangeStream called at', new Date().toLocaleTimeString());
    debugLog('[Chart] State:', {
      exchange: this.selectedExchange?.Name,
      exchangeId: this.selectedExchange?.Id,
      symbol: this.selectedSymbol?.SymbolName,
      timeframe: this.selectedTimeframe,
      baseDataLength: this.baseData?.length
    });
    
    this.stopLiveStreams();
    if (this.destroyed) return;
    const generation = this._liveGeneration;

    // Dominance symbols have no exchange stream: use ByBit 1m polling instead
    if (isDominanceSymbol(this.selectedSymbol?.SymbolName || '')) {
      debugLog('[Chart] ✅ Starting dominance live stream (polling) for', this.selectedSymbol?.SymbolName);
      this.setupDominanceLiveStream(generation);
      return;
    }

    if (!this.selectedSymbol?.SymbolName || !this.selectedTimeframe) {
      debugLog('[Chart] setupExchangeStream BLOCKED: Missing symbol or timeframe', {
        symbol: this.selectedSymbol?.SymbolName,
        timeframe: this.selectedTimeframe
      });
      return;
    }

    if (!this.baseData?.length) {
      debugLog('[Chart] setupExchangeStream BLOCKED: baseData not ready, length:', this.baseData?.length);
      return;
    }

    const symbol = this.selectedSymbol.SymbolName.toUpperCase();
    // The trade-price ticker only exists for Binance; other exchanges update
    // the price badge from the candle stream.
    const exchangeId = this.selectedExchange?.Id ?? 1;
    if (isBinanceExchange(this.selectedExchange?.Name)) {
      this.startChartPriceTicker(symbol, generation);
    }

    this.activeExchangeStream = this.exchangeStreamFactory.create(exchangeId);
    // The stream service subscribes to the exchange's 1m kline feed and aggregates it
    // into the selected timeframe service-side (SymbolCandleAggregator), including custom
    // timeframes (3m/6m/12m/24m) and calendar buckets. It also seeds the in-progress bucket
    // from REST with generation/staleness guards, so no component-side aggregation is needed.
    const interval = normalizeTimeframe(this.selectedTimeframe);
    debugLog(`[Chart] ✅ Starting ${this.activeExchangeStream.exchangeName} stream: ${symbol} ${interval}`);

    this.exchangeStreamSubscription = this.activeExchangeStream
      .connectKlineStream(symbol, interval)
      .pipe(
        filter((u) => u.symbol === symbol && u.interval === interval),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: (update) => {
          // Defense-in-depth: drop ticks from an outdated stream or for a
          // selection that no longer matches (exchange/symbol/interval).
          if (!this.isCurrentLiveContext(generation, symbol, interval, exchangeId)) return;
          this.onLiveCandleUpdate(update);
        },
        error: (err) => console.error('[Chart] Exchange stream error', err),
      });
  }

  /**
   * Tear down every live data source (candle stream, dominance polling, price
   * ticker) and any pending live redraw. Call before loading candles for a
   * different exchange/symbol/timeframe; setupExchangeStream restarts them.
   */
  protected stopLiveStreams(): void {
    this._liveGeneration++;
    try {
      this.exchangeStreamSubscription?.unsubscribe();
    } catch {}
    this.exchangeStreamSubscription = null;
    try {
      this.activeExchangeStream?.disconnect();
    } catch {}
    this.activeExchangeStream = null;
    try {
      this.stopChartPriceTicker();
    } catch {}
    this.cancelLiveRender();
    this._ctfPeriodStart = 0;
  }

  /** Stop live streams for a selection change; returns the new selection generation. */
  private beginSelectionChange(): number {
    this.stopLiveStreams();
    const generation = ++this._selectionGeneration;
    // Cancel every in-flight load of the previous selection. Their finalize
    // handlers see the new generation and leave `loading` to the new request.
    this.selectionChanged$.next();
    return generation;
  }

  /**
   * Operator for selection-driven loads: unsubscribes on the next
   * exchange/symbol/timeframe change and on destroy.
   */
  protected untilSelectionChange<T>(): MonoTypeOperatorFunction<T> {
    return (source) =>
      source.pipe(takeUntil(this.selectionChanged$), takeUntil(this.destroy$));
  }

  /** True while no newer selection change happened and the component is alive. */
  protected isCurrentSelection(selectionGeneration: number): boolean {
    return !this.destroyed && selectionGeneration === this._selectionGeneration;
  }

  /**
   * End the loading spinner for a finished/cancelled/failed load chain — only
   * when it belongs to the latest selection (a newer request owns `loading`).
   */
  private finishSelectionLoad(selectionGeneration: number): void {
    if (!this.isCurrentSelection(selectionGeneration)) return;
    if (!this.loading) return;
    this.loading = false;
    this.cdr.markForCheck();
  }

  /** Identity of the data context for symbol-scoped overlays (boxes/orders/key zones). */
  private contextKey(symbolName: string, timeframeScoped = false): string {
    const exchangeId = this.selectedExchange?.Id ?? '';
    const symbol = (symbolName || '').toUpperCase();
    const tf = timeframeScoped ? normalizeTimeframe(this.selectedTimeframe) : '';
    return `${exchangeId}|${symbol}|${tf}`;
  }

  private boxesContextKey(symbolName: string): string {
    return `${this.boxMode}|${this.contextKey(symbolName, this.boxesUseSelectedTimeframe)}`;
  }

  /** True when a tick captured with these values still belongs to the current selection. */
  private isCurrentLiveContext(
    generation: number,
    symbol: string,
    interval?: string,
    exchangeId?: number,
  ): boolean {
    if (this.destroyed || generation !== this._liveGeneration) return false;
    if ((this.selectedSymbol?.SymbolName || '').toUpperCase() !== symbol) return false;
    if (interval !== undefined && normalizeTimeframe(this.selectedTimeframe) !== interval) return false;
    if (exchangeId !== undefined && (this.selectedExchange?.Id ?? 1) !== exchangeId) return false;
    return true;
  }

  private startChartPriceTicker(symbol: string, generation: number): void {
    const exchangeId = this.selectedExchange?.Id ?? 1;
    this.chartPriceTickerSubscription = this.chartPriceTicker
      .connect(symbol, this.selectedExchange?.Id)
      .subscribe((update) => {
        if (update.symbol !== symbol) return;
        if (!this.isCurrentLiveContext(generation, symbol, undefined, exchangeId)) return;
        // Ticker messages arrive outside the zone; only the price badge changes,
        // so coalesce into the per-frame live render instead of a zone round-trip.
        this.liveTickerPrice = update.price;
        this.currentPrice = update.price;
        this.scheduleLiveRender(false);
      });
  }

  private stopChartPriceTicker(): void {
    this.chartPriceTickerSubscription?.unsubscribe();
    this.chartPriceTickerSubscription = null;
    this.chartPriceTicker.disconnect();
    this.liveTickerPrice = null;
  }

  protected setCandleDisplayPrice(price: number): void {
    if (this.liveTickerPrice === null) this.currentPrice = price;
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
  private setupDominanceLiveStream(generation: number): void {
    if (!this.selectedSymbol?.SymbolName || !this.baseData?.length) return;

    const symbol = this.selectedSymbol.SymbolName.toUpperCase();
    const timeframe = normalizeTimeframe(this.selectedTimeframe);
    if (!timeframeToMilliseconds(timeframe)) return;

    // Reset period tracking
    this._ctfPeriodStart = 0;

    // Poll immediately, then every 90 seconds
    this.exchangeStreamSubscription = timer(0, 90_000).pipe(
      switchMap(() => {
        const nowMs = Date.now();
        // Calendar-aware (1w starts Monday UTC, 1M on the 1st).
        const periodStart = getTimeframeBucketStart(nowMs, timeframe);
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
        if (!this.isCurrentLiveContext(generation, symbol, timeframe)) return;
        this.ngZone.runOutsideAngular(() => {
          const inPeriod = candles.filter((c) => c.x >= periodStart);
          if (!inPeriod.length) return;

          const liveCandle = aggregateToLiveCandle(inPeriod, periodStart);

          // Period boundary crossed — reload full candle set from API then continue updating
          if (this._ctfPeriodStart > 0 && periodStart > this._ctfPeriodStart) {
            debugLog(`[Chart] Dominance period ended (${this.selectedTimeframe}), reloading candles...`);
            this._ctfPeriodStart = periodStart;
            this.loadCandles(symbol).pipe(take(1), this.untilSelectionChange()).subscribe();
            return;
          }

          this._ctfPeriodStart = periodStart;

          if (this.baseData?.length) {
            this.baseData = applyLiveCandleToBaseData(this.baseData, liveCandle);
          }
          this.applyLivePriceFromLastCandle();
          this.scheduleLiveRender();
        });
      },
      error: (err) => console.error('[Chart] Dominance live stream error', err),
    });
  }

  /**
   * Coalesce live-stream redraws: at most one chart.update('none') per animation
   * frame, and change detection only when a template-bound value changed.
   * Runs outside the Angular zone so websocket ticks never trigger app-wide CD.
   */
  private scheduleLiveRender(chartDirty = true, auxDirty = false): void {
    if (chartDirty) this._liveRenderChartDirty = true;
    if (auxDirty) this._liveRenderAuxDirty = true;
    if (this._liveRenderRaf !== null) return;
    this.ngZone.runOutsideAngular(() => {
      this._liveRenderRaf = requestAnimationFrame(() => this.flushLiveRender());
    });
  }

  private cancelLiveRender(): void {
    if (this._liveRenderRaf !== null) {
      cancelAnimationFrame(this._liveRenderRaf);
      this._liveRenderRaf = null;
    }
    this._liveRenderChartDirty = false;
    this._liveRenderAuxDirty = false;
  }

  private flushLiveRender(): void {
    this._liveRenderRaf = null;
    let forceCd = false;
    if (this._liveRenderChartDirty) {
      this._liveRenderChartDirty = false;
      const chartRef = this.chart?.chart as any;
      if (chartRef) {
        try {
          chartRef.data.datasets[0].data = this.baseData;
          // ultra-light update (no animation)
          chartRef.update('none');
        } catch (err) {
          console.warn('[Chart] Live update failed', err);
        }
      }
    }

    if (this._liveRenderAuxDirty) {
      this._liveRenderAuxDirty = false;
      forceCd = this.flushLiveRenderAux();
    }

    // Price badge text/position, current-price line and header change:
    // only re-render when one of them moved.
    const viewKey = [
      this.currentPrice,
      this.priceChangeFormatted,
      Math.round(this.getCurrentPricePixel()),
      Math.round(this.getCurrentPriceLineLeft()),
      this.baseData?.length ?? 0,
    ].join('|');
    if (forceCd || viewKey !== this._liveRenderViewKey) {
      this._liveRenderViewKey = viewKey;
      this.cdr.detectChanges();
    }
  }

  private onLiveCandleUpdate(liveUpdate: LiveCandleUpdate): void {
    if (!this.baseData?.length) return;

    // Stream callbacks already arrive outside the zone (socket opened via
    // runOutsideAngular); keep all per-tick work there.
    this.ngZone.runOutsideAngular(() => {
      const previousLength = this.baseData.length;
      const previousLastX = this.baseData[previousLength - 1]?.x ?? null;

      // Merge the live candle safely. The stream emits candles already bucketed
      // to the selected timeframe, so openTime can be used as-is.
      const merged = mergeLiveCandle(this.baseData, {
        openTime: liveUpdate.openTime,
        closeTime: liveUpdate.closeTime,
        open: liveUpdate.open,
        high: liveUpdate.high,
        low: liveUpdate.low,
        close: liveUpdate.close,
        volume: liveUpdate.volume,
        isClosed: liveUpdate.isClosed,
      }, {
        // Match the live bar to the last bar's bucket (calendar-correct for 1w / 1M).
        timeframe: this.selectedTimeframe,
      });

      // Only update if something actually changed
      if (merged === this.baseData) return;

      this.baseData = merged;
      this.applyLivePriceFromLastCandle();

      // Closed or newly opened bars also refresh the aux panel (e.g. MCB).
      const newBar =
        !!liveUpdate.isClosed ||
        previousLength !== this.baseData.length ||
        previousLastX !== (this.baseData[this.baseData.length - 1]?.x ?? null);
      this.scheduleLiveRender(true, newBar);
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

  /** Returns the id of a trend line within HIT_PX pixels of (cx, cy), or null */
  private hitTestTrendLine(cx: number, cy: number, chartRef: any): string | null {
    const HIT_PX = 8;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.drawingsValue) {
      if (d.type !== 'trend-line' || d.points.length < 2) continue;

      const x1 = xScale.getPixelForValue(d.points[0].x);
      const y1 = yScale.getPixelForValue(d.points[0].y);
      const x2 = xScale.getPixelForValue(d.points[1].x);
      const y2 = yScale.getPixelForValue(d.points[1].y);

      const dx = x2 - x1;
      const dy = y2 - y1;
      const lenSq = dx * dx + dy * dy;
      if (lenSq <= 0.0001) continue;

      const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / lenSq));
      const projX = x1 + t * dx;
      const projY = y1 + t * dy;
      const dist = Math.hypot(cx - projX, cy - projY);

      if (dist <= HIT_PX) return d.id;
    }

    return null;
  }

  /** Returns a trend-line endpoint handle if (cx, cy) is close enough, or null */
  private hitTestTrendHandle(
    cx: number,
    cy: number,
    chartRef: any,
    specificId?: string,
  ): { id: string; pointIndex: number } | null {
    const HIT_PX = 12;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.drawingsValue) {
      if (specificId && d.id !== specificId) continue;
      if (d.type !== 'trend-line' || d.points.length < 2) continue;

      for (let i = 0; i < 2; i++) {
        const px = xScale.getPixelForValue(d.points[i].x);
        const py = yScale.getPixelForValue(d.points[i].y);
        if (Math.hypot(cx - px, cy - py) <= HIT_PX) {
          return { id: d.id, pointIndex: i };
        }
      }
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
    const HIT_PX = 14;
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
    const HIT_PX = 14;
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

  private applyTrendResize(
    resize: { id: string; pointIndex: number },
    cx: number,
    cy: number,
    chartRef: any,
  ): void {
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale || !this._dragStartPoints || this._dragStartPoints.length < 2) return;

    const nextX = xScale.getValueForPixel(cx);
    const nextY = yScale.getValueForPixel(cy);
    const nextPoints = this._dragStartPoints.map((p, i) =>
      i === resize.pointIndex ? { ...p, x: nextX, y: nextY } : { ...p },
    );

    this.drawingTools.updateDrawingPoints(resize.id, nextPoints);
  }

  private getTouchDrawingAnchor(
    touch: Touch,
    chartRef: any,
  ): { x: number; y: number } {
    const rect = chartRef.canvas.getBoundingClientRect();
    const area = chartRef.chartArea;
    const rawX = touch.clientX - rect.left;
    const rawY = touch.clientY - rect.top;

    if (!this.drawingTools.activeToolValue || this.drawingTools.magnetMode === 'off' || !area) {
      return { x: rawX, y: rawY };
    }

    // Keep the very first anchor exactly where the user taps.
    if (this.drawingTools.pendingDrawingPoints.length === 0) {
      return { x: rawX, y: rawY };
    }

    // Keep the drawing anchor visibly above the finger while using magnet on touch devices.
    const offsetY = rawY - this.TOUCH_DRAW_MAGNET_Y_OFFSET_PX;
    const clampedY = Math.max(area.top + 2, Math.min(offsetY, area.bottom - 2));
    return { x: rawX, y: clampedY };
  }

  private finalizeDrawingDrag(persist: boolean): void {
    this._draggingLineId = null;
    this.drawingTools.draggingId = null;
    this._dragStartDataPos = null;
    this._dragStartPoints  = null;
    this._activePositionResize = null;
    this._activeFibResize = null;
    this._activeTrendResize = null;

    if (persist && !this._restoringChartState) {
      this.saveCurrentChartState();
    }
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
        const anchor = this.getTouchDrawingAnchor(event.touches[0], chartRef);
        this._touchStartRaw = { x: rawX, y: rawY };
        const snapped = this.snapToOhlc(anchor.x, anchor.y, chartRef);
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
        const trendHandle = this.hitTestTrendHandle(tx, ty, chartRefD);
        if (trendHandle) {
          event.preventDefault();
          this.drawingTools.selectedDrawingId = trendHandle.id;
          this._activeTrendResize = trendHandle;
          this._draggingLineId = trendHandle.id;
          this.drawingTools.draggingId = trendHandle.id;
          const trend = this.drawingTools.drawingsValue.find(d => d.id === trendHandle.id);
          this._dragStartPoints = trend ? trend.points.map(p => ({ ...p })) : null;
          chartRefD.draw();
          return;
        }
        const lineId = this.hitTestHorizontalLine(tx, ty, chartRefD)
                    ?? this.hitTestVerticalLine(tx, ty, chartRefD)
                    ?? this.hitTestTrendLine(tx, ty, chartRefD);
        if (lineId) {
          event.preventDefault();
          this._draggingLineId = lineId;
          this.drawingTools.draggingId = lineId;
          const draggedLine = this.drawingTools.drawingsValue.find(d => d.id === lineId);
          if (draggedLine?.type === 'trend-line') {
            const xScale = chartRefD.scales?.x;
            const yScale = chartRefD.scales?.y;
            if (xScale && yScale) {
              this._dragStartDataPos = { x: xScale.getValueForPixel(tx), y: yScale.getValueForPixel(ty) };
              this._dragStartPoints = draggedLine.points.map(p => ({ ...p }));
            }
          }
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
        const anchor = this.getTouchDrawingAnchor(event.touches[0], chartRef);
        const snapped = this.snapToOhlc(anchor.x, anchor.y, chartRef);
        this.drawingTools.updateCursor(snapped.x, snapped.y);
        if (snapped.label) this.drawingTools.setSnapIndicator(snapped.x, snapped.y, snapped.label);
        else this.drawingTools.clearSnapIndicator();
        chartRef._isInteracting = false;
        if (!this._drawRafPending) {
          this._drawRafPending = true;
          requestAnimationFrame(() => { this._drawRafPending = false; chartRef.draw(); });
        }
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
        if (this._activeTrendResize) {
          this.applyTrendResize(this._activeTrendResize, cx, cy, chartRefD);
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
          dragged?.type === 'fib-extension' ||
          dragged?.type === 'trend-line'
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
      this.finalizeDrawingDrag(true);
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
        const anchor = this.getTouchDrawingAnchor(event.changedTouches[0], chartRef);
        const snapped = this.snapToOhlc(anchor.x, anchor.y, chartRef);
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
    // Deselect selected fib when tapping outside it
    if (event.changedTouches.length === 1) {
      const chartRefT = this.chart?.chart as any;
      if (chartRefT) {
        const selectedId = this.drawingTools.selectedDrawingId;
        const selectedDrawing = selectedId
          ? this.drawingTools.drawingsValue.find(d => d.id === selectedId)
          : null;
        const isSelectedFib =
          selectedDrawing?.type === 'fib-retracement' ||
          selectedDrawing?.type === 'fib-extension';
        if (isSelectedFib) {
          const rectT = chartRefT.canvas.getBoundingClientRect();
          const tx = event.changedTouches[0].clientX - rectT.left;
          const ty = event.changedTouches[0].clientY - rectT.top;
          const hitHandle = this.hitTestFibHandle(tx, ty, chartRefT, selectedId!);
          const hitBody = !hitHandle ? this.hitTestFibBody(tx, ty, chartRefT, selectedId!) : null;
          if (!hitHandle && !hitBody) {
            this.drawingTools.selectedDrawingId = null;
            chartRefT.draw();
          }
        }
      }
    }
    this.interaction.onTouchEnd(event, this.chart?.chart as any);
    this.onViewportChanged(); // after pan
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
        const trendHandle = this.hitTestTrendHandle(mx, my, chartRefD);
        if (trendHandle) {
          this.drawingTools.selectedDrawingId = trendHandle.id;
          this._activeTrendResize = trendHandle;
          this._draggingLineId = trendHandle.id;
          this.drawingTools.draggingId = trendHandle.id;
          const trend = this.drawingTools.drawingsValue.find(d => d.id === trendHandle.id);
          this._dragStartPoints = trend ? trend.points.map(p => ({ ...p })) : null;
          chartRefD.draw();
          return;
        }
        const lineId = this.hitTestHorizontalLine(mx, my, chartRefD)
                    ?? this.hitTestVerticalLine(mx, my, chartRefD)
                    ?? this.hitTestTrendLine(mx, my, chartRefD);
        if (lineId) {
          this._draggingLineId = lineId;
          this.drawingTools.draggingId = lineId;
          const draggedLine = this.drawingTools.drawingsValue.find(d => d.id === lineId);
          if (draggedLine?.type === 'trend-line') {
            const xScale = chartRefD.scales?.x;
            const yScale = chartRefD.scales?.y;
            if (xScale && yScale) {
              this._dragStartDataPos = { x: xScale.getValueForPixel(mx), y: yScale.getValueForPixel(my) };
              this._dragStartPoints = draggedLine.points.map(p => ({ ...p }));
            }
          }
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

        const selectedId = this.drawingTools.selectedDrawingId;
        const selectedDrawing = selectedId
          ? this.drawingTools.drawingsValue.find(d => d.id === selectedId)
          : null;
        const isSelectedFib =
          selectedDrawing?.type === 'fib-retracement' ||
          selectedDrawing?.type === 'fib-extension';
        if (isSelectedFib) {
          this.drawingTools.selectedDrawingId = null;
          chartRefD.draw();
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
        if (!this._drawRafPending) {
          this._drawRafPending = true;
          requestAnimationFrame(() => { this._drawRafPending = false; chartRef.draw(); });
        }
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
        if (this._activeTrendResize) {
          this.applyTrendResize(this._activeTrendResize, cx, cy, chartRefD);
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
          dragged?.type === 'fib-extension' ||
          dragged?.type === 'trend-line'
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
        const hTrendHandle = !hHoriz && !hVert ? this.hitTestTrendHandle(mx, my, chartRefH) : null;
        const hTrend = !hHoriz && !hVert && !hTrendHandle ? this.hitTestTrendLine(mx, my, chartRefH) : null;
        const hFibHandle = !hHoriz && !hVert && !hTrendHandle && !hTrend ? this.hitTestFibHandle(mx, my, chartRefH) : null;
        const hFibBody = !hHoriz && !hVert && !hTrendHandle && !hTrend && !hFibHandle ? this.hitTestFibBody(mx, my, chartRefH) : null;
        const hHandle = !hHoriz && !hVert && !hTrendHandle && !hTrend && !hFibHandle && !hFibBody ? this.hitTestPositionHandle(mx, my, chartRefH) : null;
        const hBox   = !hHoriz && !hVert && !hTrendHandle && !hTrend && !hFibHandle && !hFibBody && !hHandle ? this.hitTestBox(mx, my, chartRefH) : null;
        const hoverId = hHoriz ?? hVert ?? hTrendHandle?.id ?? hTrend ?? hFibHandle?.id ?? hFibBody ?? hHandle?.id ?? hBox;
        if (hoverId !== this.drawingTools.hoveredId) {
          this.drawingTools.hoveredId = hoverId;
          const cursor = hHoriz
            ? 'ns-resize'
            : hVert
              ? 'ew-resize'
              : hTrendHandle
                ? 'pointer'
              : hTrend
                ? 'move'
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
      this.finalizeDrawingDrag(true);
      return;
    }
    if (this.drawingTools.activeToolValue) return;
    this.interaction.onMouseUp(event, this.chart?.chart as any);
    this.onViewportChanged(); // after pan
  }
  onMouseLeave(): void {
    if (this._draggingLineId) {
      this.finalizeDrawingDrag(true);
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
    this.onViewportChanged();
  }

  onChartDblClick(): void {
    if (!this.chart?.chart) return;
    const chartRef = this.chart.chart as any;
    this.interaction.autoFitYScale(chartRef);
    this.setYAxisStep(chartRef);
    chartRef.update('none');
    this.interaction.syncIndicatorAxis(chartRef);
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

    debugLog(
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
      this.fetchKeyZones(this.selectedSymbol.SymbolName)
        .pipe(this.untilSelectionChange())
        .subscribe({
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
    this._loadedKeyZonesKey = null;
    const keyZonesKey = this.contextKey(symbolName);
    // remove existing key zone datasets from chart immediately (use isKeyZone flag)
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isKeyZone,
      );
    });

    debugLog(`fetchKeyZones: symbol=${symbolName}`);

    // KeyZones endpoint returns an object with VolumeProfiles and FibLevels
    return this.marketService.getKeyZones(symbolName).pipe(
      tap((kz: any) => {
        if (!kz) return;
        debugLog('fetchKeyZones result', kz);
        this.keyZones = kz;
        this._loadedKeyZonesKey = keyZonesKey;
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
    const kzSelfRef = this.chart?.chart as any;
    this._lastKeyZoneXMin = kzSelfRef?.scales?.x?.min ?? null;
    this._lastKeyZoneXMax = kzSelfRef?.scales?.x?.max ?? null;
    const mainDs = this.keyZoneCandles();

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
    // Optionally extend key zone lines to the overscroll bound used by boxes/interaction
    let xMax = mainDs[mainDs.length - 1].x;
    if (this.keyZonesExtendIntoOverscroll) {
      try {
        const overscrollMax =
          this.extendedDataRange?.max ??
          (this.interaction as any)?.extendedDataRange?.max;
        if (Number.isFinite(overscrollMax) && overscrollMax > xMax) {
          xMax = overscrollMax;
        }
      } catch {}
    }

    // Determine current visible Y range to hide lines outside chart view
    const { yMinVisible, yMaxVisible } = this.getVisibleYRange();

    const lines: any[] = [];

    // VolumeProfiles -> POC, VAH, VAL
    const vps = this.keyZones.VolumeProfiles || [];
    vps.forEach((vp: any) => {
      const tfRaw = vp.Timeframe || vp.timeframe || '';
      const tf = normalizeTimeframe(tfRaw);
      if (!this.isTimeframeVisible(tf)) return;
      const poc = this.toFiniteNumber(vp.Poc ?? vp.poc);
      if (poc != null) {
        if (!this.isPriceNearVisibleRange(poc, yMinVisible, yMaxVisible)) return;
        lines.push({
          type: 'line' as const,
          label: `${tfRaw} POC`,
          data: [
            { x: xMin, y: poc },
            { x: xMax, y: poc },
          ],
          borderColor: 'rgba(57,255,20,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tfRaw} POC`,
          keyColor: 'rgba(57,255,20,0.9)',
        });
      }
      const vah = this.toFiniteNumber(vp.Vah ?? vp.vah);
      if (vah != null) {
        if (!this.isPriceNearVisibleRange(vah, yMinVisible, yMaxVisible)) return;
        lines.push({
          type: 'line' as const,
          label: `${tfRaw} VAH`,
          data: [
            { x: xMin, y: vah },
            { x: xMax, y: vah },
          ],
          borderColor: 'rgba(200,0,200,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tfRaw} VAH`,
          keyColor: 'rgba(200,0,200,0.9)',
        });
      }
      const val = this.toFiniteNumber(vp.Val ?? vp.val);
      if (val != null) {
        if (!this.isPriceNearVisibleRange(val, yMinVisible, yMaxVisible)) return;
        lines.push({
          type: 'line' as const,
          label: `${tfRaw} VAL`,
          data: [
            { x: xMin, y: val },
            { x: xMax, y: val },
          ],
          borderColor: 'rgba(200,200,0,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tfRaw} VAL`,
          keyColor: 'rgba(200,200,0,0.9)',
        });
      }
    });

    // FibLevels -> label with timeframe,type,level and gold for 0.618
    const fibs = this.keyZones.FibLevels || [];
    fibs.forEach((f: any) => {
      const tfRaw = f.Timeframe || f.timeframe || '';
      const tf = normalizeTimeframe(tfRaw);
      if (!this.isTimeframeVisible(tf)) return;
      const type = f.Type || f.type || '';
      const level = this.toFiniteNumber(f.Level ?? f.level);
      const price = this.toFiniteNumber(f.Price ?? f.price);
      if (price == null) return;
      if (!this.isPriceNearVisibleRange(price, yMinVisible, yMaxVisible)) return;

      const levelStr = level != null ? `${level}` : '';
      const label = `${tfRaw} ${type} ${levelStr}`.trim();
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
        debugLog('[Chart] Added order line datasets:', lines.length);
      } catch {}
    });

    debugLog(
      'addKeyZoneDatasets: added',
      lines.length,
      'key zone lines, total datasets=',
      this.chartData.datasets.length,
    );
  }

  private isTimeframeVisible(tf: string): boolean {
    const settings = this.keyZoneSettings.getSettings();
    if (!normalizeTimeframe(tf)) return false;
    if (!settings.enabled) return false;
    return this.keyZoneTimeframeFlag(settings.timeframes, tf);
  }

  /**
   * Per-timeframe key-zone toggle lookup. The key-zone store keys flags by the
   * shared normalized timeframe ('1M' month stays distinct from '1m' minute)
   * and is in-memory only, so no legacy lowercase keys can exist.
   */
  private keyZoneTimeframeFlag(flags: { [tf: string]: boolean }, tf: string): boolean {
    const key = normalizeTimeframe(tf);
    return !!key && !!flags[key];
  }

  /**
   * Display label for a key-zone timeframe in the settings panel: minutes stay
   * lowercase ('3m'), hours/days/weeks upper-case ('4H', '1W') and the month
   * is '1M' — so month and minute never render as the same label.
   */
  keyZoneTimeframeLabel(tf: string): string {
    const key = normalizeTimeframe(tf);
    if (key === '1M' || key.endsWith('m')) return key;
    return key.toUpperCase();
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

  private isPriceNearVisibleRange(
    price: number,
    yMin: number,
    yMax: number,
  ): boolean {
    if (!Number.isFinite(price)) return false;
    if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return true;

    const min = Math.min(yMin, yMax);
    const max = Math.max(yMin, yMax);
    const range = Math.max(1, max - min);

    // Keep nearby support/resistance lines visible while excluding far-away levels
    // that would clutter intraday charts (e.g. 12m/24m).
    const margin = Math.max(range * 0.2, this.currentPrice ? this.currentPrice * 0.003 : 0);

    return price >= min - margin && price <= max + margin;
  }

  // Expose timeframe UI helpers for chart settings panel
  get availableTimeframes(): string[] {
    return this.keyZoneSettings.getAvailableTimeframes();
  }
  get allTimeframesEnabled(): boolean {
    return this.keyZoneSettings.isAllTimeframesEnabled();
  }
  timeframeEnabled(tf: string): boolean {
    return this.keyZoneTimeframeFlag(this.keyZoneSettings.getSettings().timeframes, tf);
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

  // Wrapper methods for template event handlers (to avoid type casting in templates)
  toggleAllTimeframes(enabled: boolean): void {
    this.keyZoneSettings.setAllTimeframesEnabled(enabled);
    if (this.showKeyZones && this.keyZones) {
      this.addKeyZoneDatasets();
    }
  }

  toggleTimeframe(tf: string, enabled: boolean): void {
    this.keyZoneSettings.setTimeframeEnabled(tf, enabled);
    if (this.showKeyZones && this.keyZones) {
      this.addKeyZoneDatasets();
    }
  }

  private toFiniteNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
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
      debugLog(
        '[Chart] Rendering cached orders immediately:',
        this.orders.length,
      );
      this.addOrderDatasets();
    }

    // Then fetch fresh orders from the server
    if (this.selectedSymbol?.SymbolName) {
      this.fetchOrders(this.selectedSymbol.SymbolName)
        .pipe(this.untilSelectionChange())
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

    this._loadedOrdersKey = null;
    const ordersKey = this.contextKey(symbolName);

    // Remove existing order datasets to prepare for fresh render
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isOrder,
      );
    });

    return this.marketService.getTradeOrders(symbolName).pipe(
      tap((arr: any[]) => {
        this._loadedOrdersKey = ordersKey;
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
        debugLog(
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
    debugLog('Market Cipher toggled:', this.showMarketCipher);
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
      .pipe(this.untilSelectionChange())
      .subscribe({
        next: (signals: any[]) => {
          debugLog('Market Cipher signals received:', signals);
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
      .pipe(this.untilSelectionChange())
      .subscribe({
        next: (data: any[]) => {
          debugLog('Divergences received:', data);
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
      } catch {
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
      .pipe(this.untilSelectionChange())
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

  // Show all supported timeframes for all symbols
  get visibleTimeframes(): Array<{ label: string; value: string }> {
    return this.timeframes;
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
      case 'trend-line':
        return pending === 0 ? `Punt 1/2 — ${tapLower} startpunt` : `Punt 2/2 — ${tapLower} eindpunt`;
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
    if (tool === 'fib-retracement' || tool === 'trend-line') return [0, 1];
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

  // Wrapper methods for template event handlers (to avoid type casting in templates)
  toggleTier(
    tier: 'bronze' | 'silver' | 'gold' | 'platinum',
    enabled: boolean,
  ): void {
    this.interaction.setCapitalFlowFilter({ [tier]: enabled } as any);
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
    // Never write back state while it is being restored from the backend.
    if (this._restoringChartState) return;
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
      // A newer selection loads its own state; never restore an older one's drawings.
      .pipe(take(1), this.untilSelectionChange())
      .subscribe({
        next: (state) => {
          this._restoringChartState = true;
          try {
            if (!state) {
              // No saved state for this symbol/exchange/user context.
              // Clear drawings so previous symbol drawings are not carried over.
              this.drawingTools.setDrawings([]);
              return;
            }
            // Restore drawings
            if (Array.isArray(state.drawings)) {
              this.drawingTools.setDrawings(state.drawings);
            }
            // Restore settings toggles, then run the matching toggle handler for
            // each one that changed so its overlay is actually loaded or removed.
            const s = state.settings;
            if (s) {
              const before = this.buildSettingsSnapshot();
              if (s.showBoxes !== undefined) this.showBoxes = s.showBoxes;
              if (s.showKeyZones !== undefined) this.showKeyZones = s.showKeyZones;
              if (s.showOrders !== undefined) this.showOrders = s.showOrders;
              if (s.showIndicators !== undefined) this.showIndicators = s.showIndicators;
              if (s.showMarketCipher !== undefined) this.showMarketCipher = s.showMarketCipher;
              if (s.showDivergences !== undefined) this.showDivergences = s.showDivergences;
              if (s.boxMode !== undefined) this.boxMode = s.boxMode;
              if (
                before.showBoxes !== this.showBoxes ||
                (this.showBoxes && before.boxMode !== this.boxMode)
              ) {
                this.onBoxesToggle();
              }
              if (before.showKeyZones !== this.showKeyZones) this.onToggleKeyZones();
              if (before.showOrders !== this.showOrders) this.onOrdersToggle();
              if (before.showIndicators !== this.showIndicators) this.onToggleIndicators();
              if (before.showMarketCipher !== this.showMarketCipher) this.onToggleMarketCipher();
              if (before.showDivergences !== this.showDivergences) this.onToggleDivergences();
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

