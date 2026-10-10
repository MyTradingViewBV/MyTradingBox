/**
 * Shared implementation of the Chart.js candlestick chart pages
 * (/mcb-chart and the simple /chart).
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
  LOCALE_ID,
} from '@angular/core';
import { formatNumber } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { BaseChartDirective } from 'ng2-charts';
import { Chart as ChartJS } from 'chart.js';
import './chart-setup';
import {
  ChartInteractionService,
  GestureKind,
} from './services/chart-interaction.service';
import { DrawingToolsService, isBoxType } from './services/drawing-tools.service';
import { createDrawingToolsPlugin } from './services/drawing-tools.plugin';
import { formatPriceChange, buildBoxDatasets } from './utils/chart-utils';
import { resolveSelectedSymbol } from './utils/default-symbol';
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
  Subscription,
} from 'rxjs';
import {
  CapitalFlowTier,
  ChartSettingsSnapshot,
  ChartStateDto,
} from 'src/app/modules/shared/models/chart/chart-state.dto';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { OrderModel } from 'src/app/modules/shared/models/orders/order.dto';
import { KeyZonesModel } from 'src/app/modules/shared/models/chart/keyZones.dto';
import { BoxModel } from 'src/app/modules/shared/models/chart/boxModel.dto';
import { Candle } from 'src/app/modules/shared/models/chart/candle.dto';
import { MarketCipherSignal } from 'src/app/modules/shared/models/chart/market-cipher-signal.dto';
import { DivergenceSignal } from 'src/app/modules/shared/models/chart/divergence-signal.dto';
import { CapitalFlowSignal } from './models/capital-flow-signal';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import {
  DEFAULT_KEY_ZONE_LAYERS,
  KEY_ZONE_LAYERS,
  KeyZoneLayer,
  KeyZoneLayerFlags,
  buildKeyZoneItems,
  keyZoneTimeframes,
} from './utils/key-zone-layers';
import { ChartPriceTickerService } from './services/chart-price-ticker.service';
import { LiveCandleUpdate } from './models/live-candle-update';
import { ExchangeCandleStreamService } from './services/exchange-candle-stream.service';
import { ExchangeStreamFactory } from './services/exchange-stream.factory';
import { mergeLiveCandle } from './utils/merge-live-candles';
import { DoubleTapDetector } from './utils/double-tap';
import {
  candleCloseCountdownMs,
  formatCandleCountdown,
  getTimeframeBucketStart,
  normalizeTimeframe,
  timeframeToMilliseconds,
} from './utils/timeframe-bucketing';
import { symbolIconSrc } from './pipes/symbol-icon-src.pipe';
import { keyZoneTimeframeFlag, keyZoneTimeframeLabel } from './pipes/key-zone-timeframe.pipes';
import { debugLog } from 'src/app/helpers/debug-log';
import {
  applyTimeTicks,
  applyValueTicks,
  decimalsForStep,
  formatTimeAxisLabel,
} from './utils/axis-ticks';
import {
  AxisTickScale,
  BoxOverlaySource,
  ChartBaseData,
  ChartBaseOptions,
  ChartBaseScales,
  ChartDatasetEntry,
  ChartRef,
  LegacyOrderFields,
} from './chart-base.types';

/** A component rendered below the main chart (e.g. the Market Cipher B panel). */
export interface ChartAuxPanel {
  component: Type<unknown>;
  inputs: Record<string, unknown>;
}

/** Settings-panel section with on/off toggles for parts of the aux panel. */
export interface ChartAuxPanelSettings {
  titleKey: string;
  items: Array<{ key: string; labelKey: string; color: string; enabled: boolean; disabled?: boolean; indent?: boolean }>;
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
  chartData: ChartBaseData = { datasets: [] };
  // Starts undefined (no initializer, as before); set by fetchBoxes / onBoxesToggle.
  boxes!: BoxModel[];
  // store base candle data for overlays
  baseData: InternalCandle[] = [];
  isFullscreen = false;
  // Orders
  showOrders = false;
  orders: OrderModel[] = [];

  // New: mode for boxes fetching: 'boxes' = current (v2), 'all' = getBoxes (v1)
  boxMode: 'boxes' | 'all' = 'boxes';

  // KeyZones toggle and storage
  showKeyZones = true; // default on
  keyZones: KeyZonesModel | null = null;
  /** Which key-zone layers (levels, nPOC, order blocks, ...) are drawn. */
  keyZoneLayers: KeyZoneLayerFlags = { ...DEFAULT_KEY_ZONE_LAYERS };
  readonly keyZoneLayerOptions = KEY_ZONE_LAYERS;

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
  /** Remaining time of the active candle ("02:14"), under the price in the axis label. */
  candleCountdown = '';
  private _countdownTimer: ReturnType<typeof setInterval> | null = null;
  priceChange = 0;
  priceChangeFormatted = '';
  sellPrice = 0;
  buyPrice = 0;
  spread = 0;

  timeframes = [
    { label: '1m', value: '1m' },
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
  indicatorSignals: CapitalFlowSignal[] = [];

  // Market Cipher toggle and storage
  showMarketCipher = false;
  marketCipherSignals: MarketCipherSignal[] = [];
  private _marketCipherKey = '';

  // Divergences toggle and storage
  showDivergences = false;
  divergences: DivergenceSignal[] = [];
  private _divergencesKey = '';
  /** Candle range (first/last x) the cached divergences were fetched for. */
  private _divergencesRange: { from: number; lastX: number } | null = null;
  private _signalRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly SIGNAL_REFRESH_DELAY_MS = 20_000;

  chartOptions: ChartBaseOptions = {
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
        // No candlestick edge padding: the shared TimeScale owns the plot-edge
        // times (scales.x.min/max), so every pane maps a timestamp to the same x.
        offset: false,
        grid: {
          color: 'rgba(42,46,57,0.6)',
          drawBorder: false,
        },
        // Ticks on round time boundaries, recomputed from the live range on
        // every layout pass so labels stay put and evenly spaced while panning.
        afterBuildTicks: (scale: AxisTickScale) => applyTimeTicks(scale, this.candleDurationMs()),
        ticks: {
          source: 'auto',
          callback: (val: number | string) => this.formatTimeTick(val),
          color: '#787b86',
          maxRotation: 0,
          autoSkip: false,
          font: { size: 11 },
          padding: 4,
        },
      },
      y: {
        position: 'right',
        beginAtZero: false,
        // Nice price steps from the live range (replaces a precomputed stepSize
        // that lagged one render behind pan/zoom).
        afterBuildTicks: (scale: AxisTickScale) => applyValueTicks(scale),
        grid: {
          color: 'rgba(42,46,57,0.6)',
          borderColor: 'transparent',
          drawBorder: false,
        },
        ticks: {
          color: '#787b86',
          callback: (
            val: number | string,
            index: number,
            ticks: Array<{ value: number }>,
          ) => this.formatPriceTick(val, index, ticks),
          autoSkip: false,
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
  private readonly axisDoubleTap = new DoubleTapDetector();
  private containerSized = false;
  // Prevent duplicate network calls on rapid/duplicate symbol change events
  private lastRequestedSymbol: string | null = null;
  private exchangeStreamSubscription: Subscription | null = null;
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
  /** Candles appended by live ticks since the last flush (realtime follow shifts the view by exactly these). */
  private _pendingLiveBars = 0;

  private readonly marketService = inject(ChartService);
  private readonly _settingsService = inject(SettingsService);
  /** Web (desktop) layout: chart toolbar sits above the chart like TradingView; phones keep it below. */
  readonly isWebLayout = toSignal(
    this._settingsService.getEffectiveUiMode().pipe(map((mode) => mode === 'web')),
    { initialValue: false },
  );
  protected readonly interaction = inject(ChartInteractionService);
  private readonly boxesService = inject(ChartBoxesService);
  private readonly indicatorsService = inject(ChartIndicatorsService);
  protected readonly layout = inject(ChartLayoutService);
  private readonly performance = inject(ChartPerformanceService);
  private readonly keyZoneSettings = inject(KeyZoneSettingsService);
  private readonly exchangeStreamFactory = inject(ExchangeStreamFactory);
  private readonly chartPriceTicker = inject(ChartPriceTickerService);
  private chartPriceTickerSubscription: Subscription | null = null;
  private liveTickerPrice: number | null = null;
  protected readonly ngZone = inject(NgZone);
  private readonly titleService = inject(Title);
  private readonly locale = inject(LOCALE_ID);
  /** Browser tab title before this chart page took it over; restored in ngOnDestroy. */
  private readonly defaultDocumentTitle = this.titleService.getTitle();
  readonly drawingTools = inject(DrawingToolsService);
  private drawingPluginRegistered = false;
  private _resizeRafId: number | null = null;
  private _drawRafPending = false;
  private _ctrlSavedMagnetMode: 'off' | 'weak' | 'strong' | null = null;
  /** Raw (pre-snap) touch start pixel position — used for drag-distance check */
  private _touchStartRaw: { x: number; y: number } | null = null;
  private readonly MIN_TOUCH_DRAG_PX = 8;
  private readonly TOUCH_DRAW_MAGNET_Y_OFFSET_PX = 52;
  /** Pen: minimum pointer travel (px) before another stroke point is recorded. */
  private readonly PEN_MIN_STEP_PX = 2;
  /** Pen: pixel position of the last recorded stroke point. */
  private _penLastPx: { x: number; y: number } | null = null;
  /** Id of an existing horizontal line being dragged to a new price level */
  private _draggingLineId: string | null = null;
  /** Data-space position of the pointer at the moment a box drag started */
  private _dragStartDataPos: { x: number; y: number } | null = null;
  /** Snapshot of the dragged box's points at drag-start (prevents drift) */
  private _dragStartPoints: import('./services/drawing-tools.service').DrawingPoint[] | null = null;
  /**
   * The running mouse press (viewport position + farthest travel from it so far), for presses this component
   * ends itself (drawing tool / drawing drag): they count for dblclick-after-drag like a chart press.
   */
  private _mousePress: { x: number; y: number; maxTravel: number } | null = null;
  /** Suppress drawing auto-save while restoring drawings from the backend */
  private _restoringChartState = false;

  // ── Position edit panel state ────────────────────────────────────
  selectedPositionId: string | null = null;
  editEntry: number | null = null;
  editTP: number | null = null;
  editSL: number | null = null;
  editMode: 'price' | 'pct' = 'price';
  editTPPct: number | null = null;
  editSLPct: number | null = null;
  private _longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private _pendingPosId: string | null = null;
  private _longPressStartX: number | null = null;
  private _longPressStartY: number | null = null;
  private _activePositionResize: { id: string; row: 'tp' | 'entry' | 'sl'; side: 'left' | 'right' } | null = null;
  private _activeFibResize: { id: string; pointIndex: number } | null = null;
  private _activeTrendResize: { id: string; pointIndex: number } | null = null;
  /** Rectangle corner being dragged: the corner takes x from points[xIdx] and y from points[yIdx]. */
  private _activeRectResize: { id: string; xIdx: number; yIdx: number } | null = null;

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
    this.chart?.chart?.draw();
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
    this.chart?.chart?.draw();
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

  /** Restore and store the settings-panel selections on this device (false = page keeps its own defaults). */
  protected readonly usesDeviceChartSettings: boolean = true;

  /** Optional component rendered below the main chart (also in fullscreen). */
  get auxPanel(): ChartAuxPanel | null {
    return null;
  }

  /** Toggles for the aux panel shown in the settings panel; null = no section. */
  get auxPanelSettings(): ChartAuxPanelSettings | null {
    return null;
  }

  /** Apply one aux panel toggle (the base stores the selections afterwards). */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected applyAuxPanelSetting(_key: string, _enabled: boolean): void {
    /* no-op by default */
  }

  /** Aux panel settings stored with the device settings snapshot. */
  protected auxPanelSettingsSnapshot(): Partial<ChartSettingsSnapshot> {
    return {};
  }

  /** Restore aux panel settings from the settings stored on this device. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected restoreAuxPanelSettings(_settings: Partial<ChartSettingsSnapshot>): void {
    /* no-op by default */
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
    // Force chartOptions object reference change + default view like onSymbolChange
    try {
      const prev = this.chartOptions || ({} as ChartBaseOptions);
      const prevScales = prev.scales || ({} as ChartBaseScales);
      this.chartOptions = { ...prev, scales: { ...prevScales } };
    } catch {}
    try {
      this.zoomToRecent();
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
  // (templates use the pure `symbolIconSrc` pipe on `selectedSymbol?.Icon`)
  getSymbolIcon(): string | null {
    return symbolIconSrc(this.selectedSymbol?.Icon);
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

  // Price tick labels: 2 decimals, more when the tick step needs them so
  // adjacent labels never read the same (e.g. 1.2345 with a 0.001 step).
  private formatPriceTick(
    val: number | string,
    index?: number,
    ticks?: Array<{ value: number }>,
  ): string {
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);
    let stepValue = 0;
    if (Array.isArray(ticks) && ticks.length >= 2) {
      stepValue = Math.abs(Number(ticks[1]?.value) - Number(ticks[0]?.value));
    }
    if (!(stepValue > 0)) {
      // Single tick: fall back to the value's own magnitude.
      const abs = Math.abs(num);
      stepValue = abs >= 1 || abs === 0 ? 0.01 : Math.pow(10, Math.floor(Math.log10(abs)) - 2);
    }
    return num.toFixed(decimalsForStep(stepValue));
  }

  /** One candle's duration, so the time axis never labels below candle resolution. */
  private candleDurationMs(): number {
    return timeframeToMilliseconds(this.selectedTimeframe || '1h');
  }

  /** Time tick label from the tick's own timestamp (local time, like the crosshair). */
  private formatTimeTick(val: number | string | null | undefined): string {
    if (val == null) return '';
    const ms = Number(val);
    if (!Number.isFinite(ms)) return '';
    // Daily and longer candles: show dates only.
    return formatTimeAxisLabel(ms, this.candleDurationMs() >= 86_400_000);
  }

  // Expose interaction state (service holds runtime values after refactor)
  get isInteracting(): boolean {
    return this.interaction.isInteracting;
  }
  get gestureType(): GestureKind | null {
    return this.interaction.gestureType;
  }

  /**
   * Live candle countdown under the price label: one tick per second (outside
   * Angular), the time until the current bucket of the selected timeframe
   * closes. Change detection runs only when the shown text changed.
   */
  private startCandleCountdown(): void {
    if (this._countdownTimer) return;
    this.ngZone.runOutsideAngular(() => {
      this._countdownTimer = setInterval(() => {
        if (this.destroyed) return;
        const ms = candleCloseCountdownMs(Date.now(), this.selectedTimeframe);
        const text = ms == null ? '' : formatCandleCountdown(ms);
        if (text === this.candleCountdown) return;
        this.candleCountdown = text;
        // The label is hidden without a price: skip the render until one shows.
        if (this.currentPrice) this.cdr.detectChanges();
      }, 1000);
    });
  }

  // Compute pixel position for current price to place badge on y-axis
  getCurrentPricePixel(): number {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    try {
      const yScale = chartRef?.scales?.y;
      if (!yScale || !Number.isFinite(this.currentPrice)) return 0;
      return yScale.getPixelForValue(this.currentPrice);
    } catch {
      return 0;
    }
  }

  getCurrentPriceLineLeft(): number {
    const chartRef = this.chart?.chart as ChartRef | undefined;
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
    // A time-axis drag released outside the chart ends via a document listener: refresh dependent panes.
    this.interaction.onTimeAxisScaleEnd = this.onTimeAxisScaleEnd;
    // Same for a pan released outside the chart.
    this.interaction.onPanEnd = this.onTimeAxisScaleEnd;
    this.subscribeLiveFollowRequests();
    // Before the first load, so it only fetches the overlays that are switched on.
    this.restoreDeviceChartSettings();

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
            const match = this.exchanges.find((ex) => {
              if (
                exchange &&
                exchange.Id != null &&
                ex.Id === exchange.Id
              )
                return true;
              if (
                exchange &&
                exchange.Name &&
                ex.Name === exchange.Name
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
                (d) => !d.isKeyZone,
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
              (d) => !d.isIndicator,
            );
            this.chartData.datasets =
              this.chartData.datasets.concat(newDatasets as ChartDatasetEntry[]);
          });
          try {
            const chartRef = this.chart?.chart as ChartRef | undefined;
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

  private readonly onTimeAxisScaleEnd = (): void => this.onViewportChanged();

  /**
   * Global realtime-follow commands from the settings store (`setAllChartsLiveFollow`): true = this
   * chart goes to realtime and follows, false = it stops following (viewport untouched). State in,
   * no DOM coupling: every mounted chart could subscribe like this (today one chart per page).
   */
  private subscribeLiveFollowRequests(): void {
    try {
      this.interaction.liveFollowRequests$
        .pipe(takeUntil(this.destroy$))
        .subscribe((enabled) => {
          if (enabled) this.goToRealtime();
          else this.interaction.detachLiveFollow();
        });
    } catch {}
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.titleService.setTitle(this.defaultDocumentTitle);
    if (this.interaction.onTimeAxisScaleEnd === this.onTimeAxisScaleEnd) this.interaction.onTimeAxisScaleEnd = undefined;
    if (this.interaction.onPanEnd === this.onTimeAxisScaleEnd) this.interaction.onPanEnd = undefined;
    // The service is app-wide: no gesture, long-press or pinned touch crosshair of this page may survive into the
    // next chart page (the router destroys this page before it creates the next one).
    this.interaction.cancelAllGestures();
    if (this._longPressTimer) {
      clearTimeout(this._longPressTimer);
      this._longPressTimer = null;
    }
    this.stopLiveStreams();
    if (this._signalRefreshTimer) {
      clearTimeout(this._signalRefreshTimer);
      this._signalRefreshTimer = null;
    }
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
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
    this.startCandleCountdown();
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
            const chartRef = this.chart?.chart as ChartRef | undefined;
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
              // The TimeScale re-anchored the x-range for the new width (Chart.js
              // resize hook); keep it when ng2-charts re-reads chartOptions.
              if (this.hasFiniteXRange(chartRef)) this.storeViewportInOptions(chartRef);
              this.onChartResized();
            }
          });
        });
        this.resizeObserver.observe(host);
      } catch {}
    }

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
        const chartRef = this.chart?.chart as ChartRef | undefined;
        if (chartRef) chartRef.draw();
      }
      // Delete / Backspace removes the selected drawing (not while typing in a field)
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && this.drawingTools.selectedDrawingId) {
        const id = this.drawingTools.selectedDrawingId;
        if (id === this.selectedPositionId) this.dismissPositionEdit();
        this.drawingTools.removeDrawing(id);
        this.drawingTools.selectedDrawingId = null;
        e.preventDefault();
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
      const chartRef = this.chart?.chart as ChartRef | undefined;
      if (chartRef) chartRef.draw();
    });
  }

  safeUpdateDatasets(modifier: () => void, preserveScales = true): void {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    let saved: { xMin?: number; xMax?: number; yMin?: number; yMax?: number } | null = null;
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
        this.chartOptions = this.chartOptions || ({} as ChartBaseOptions);
        this.chartOptions.scales = this.chartOptions.scales || ({} as ChartBaseScales);
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
          scales: { ...(this.chartOptions.scales || ({} as ChartBaseScales)) },
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
  syncIndicatorAxis(chartRef: ChartRef | null | undefined): void {
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
          indScale.min = yMin as number; // finite: checked above
          indScale.max = yMax as number;
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
        tap((symbols) => {
          this.availableSymbols = symbols || [];
          debugLog('symbols:', symbols);
        }),
        switchMap((symbols) =>
          this._settingsService.getSelectedSymbol().pipe(
            // Read the initially selected symbol once; avoid reacting to later store updates
            take(1),
            map((stored) => {
              // Stored symbol when this exchange lists it (full object from the fetched list),
              // otherwise BTC — never the first (alphabetical) symbol or the previous exchange's symbol
              const { symbol, isStoredMatch } = resolveSelectedSymbol(
                (symbols || []) as SymbolModel[],
                stored as SymbolModel | null,
              );
              const chosen: SymbolModel = symbol ?? new SymbolModel();
              if (!isStoredMatch && chosen.SymbolName !== stored?.SymbolName) {
                this._settingsService.dispatchAppAction(
                  SettingsActions.setSelectedSymbol({ symbol: chosen }),
                );
              }
              return chosen;
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
          // Restore persisted drawings from backend
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
    this.persistChartSettings();
  }

  onBoxModeToggle(): void {
    this.onBoxModeChange(this.boxMode === 'boxes' ? 'all' : 'boxes');
  }

  // New: fetch boxes using selected mode
  fetchBoxes(symbolName: string): Observable<BoxModel[]> {
    if (!symbolName) return of([]);

    // Clear existing boxes immediately
    this.boxes = [];
    this._loadedBoxesKey = null;
    const boxesKey = this.boxesContextKey(symbolName);

    // Remove existing box datasets immediately
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d) => !d.isBox,
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

        // Render only while boxes are switched on (a mode change switches them on first)
        if (this.showBoxes && this.baseData && this.baseData.length && this.boxes.length) {
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
          (d) => !d.isBox,
        );
      });
    } else if (this.selectedSymbol && this.selectedSymbol.SymbolName) {
      this.fetchBoxes(this.selectedSymbol.SymbolName)
        .pipe(this.untilSelectionChange())
        .subscribe({
          error: (e) => console.warn('fetchBoxes error', e),
        });
    }
    this.persistChartSettings();
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
            // Re-apply the default view after datasets are updated to refresh x/y ranges.
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
            // Restore persisted drawings from backend for new symbol
            this.loadChartStateForCurrentContext();
          },
          error: (e) => {
            console.warn('onSymbolChange chain error', e);
          },
        });
    }
  }

  /** Replace the options/scales references (forces ng2-charts to re-read them) and show the default view. */
  private refitChartToData(): void {
    try {
      const prev = this.chartOptions || ({} as ChartBaseOptions);
      const prevScales = prev.scales || ({} as ChartBaseScales);
      this.chartOptions = { ...prev, scales: { ...prevScales } };
    } catch {}
    try {
      this.zoomToRecent();
    } catch {}
  }

  // Clear any stored/forced axis min/max ranges so next data load auto-fits
  clearScaleRanges(): void {
    try {
      // Clear stored chartOptions ranges
      if (!this.chartOptions) this.chartOptions = {} as ChartBaseOptions;
      if (!this.chartOptions.scales) this.chartOptions.scales = {} as ChartBaseScales;
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
      delete this.chartOptions.scales.indicator?.min;
      delete this.chartOptions.scales.indicator?.max;

      // Also clear runtime chart instance ranges if available
      const chartRef = this.chart?.chart as ChartRef | undefined;
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
            // Restore persisted drawings from backend for new timeframe.
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
  protected reloadSignalOverlays(): void {
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
  loadCandles(symbol: string): Observable<InternalCandle[]> {
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
      const chartRef = this.chart?.chart as ChartRef | undefined;
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
        map((candles: Candle[]) => {
          // Parse candle timestamps as UTC regardless of device timezone.
          // Strings without a timezone suffix (e.g. "2026-03-15T14:00:00") are
          // treated as LOCAL time by new Date(), which shifts candles by the UTC
          // offset and creates visible gaps. Appending 'Z' forces UTC parsing.
          const toUtcMs = (s: string): number =>
            new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z').getTime();
          const mapped = (candles || []).map((c) => ({
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
        tap((mapped: InternalCandle[]) => {
          if (!mapped.length) {
            console.warn('[Chart] No candle data received for', symbol, fetchTimeframe);
            return;
          }
          // store base data for overlays
          this.baseData = mapped;
          this._pendingLiveBars = 0;
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
            (window as Window & { __chartExtendedMax?: number }).__chartExtendedMax = this.extendedDataRange.max;
          } catch {}
          const allHighs = mapped.map((c) => c.h);
          const allLows = mapped.map((c) => c.l);
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
            const chartRef = this.chart?.chart as ChartRef | undefined;
            if (chartRef) {
              chartRef.data.datasets = this.chartData.datasets;
            }
          } catch {}
          if (this.boxes && this.boxes.length && this.showBoxes) {
            this.addBoxesDatasets();
          }
          // Key zones are symbol-scoped (not refetched on a timeframe change), so
          // redraw them from cache after the dataset reset above.
          if (this.showKeyZones && this.keyZones) {
            this.addKeyZoneDatasets();
          }
          // The dataset reset above dropped divergence / Market Cipher lines; redraw them
          // from cache (e.g. dominance period reload) against the new candles.
          if (this.showDivergences || this.showMarketCipher) {
            this.safeUpdateDatasets(() => {
              this.applyDivergenceDatasets();
              this.applyMarketCipherDatasets();
            });
          }
          if (!this.showIndicators) {
            this.safeUpdateDatasets(() => {
              this.chartData.datasets = this.chartData.datasets.filter(
                (d) => !d.isIndicator,
              );
            });
          }
          // Nieuwe fix: als orders al geladen zijn (bij navigatie van andere pagina) maar lijnen niet getekend zijn
          // omdat baseData eerder ontbrak, render ze nu.
          if (this.showOrders && this.orders && this.orders.length) {
            const hasOrderLines = (this.chartData.datasets || []).some(
              (d) => d.isOrder,
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
          // Put the default view in the options before the first render of the new
          // candles, so a timeframe switch never flashes the full range first.
          this.presetRecentRange(mapped);
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
              (d) => d.isIndicator,
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
  scheduleInitializeChart(data: InternalCandle[]): void {
    if (this.destroyed) return;
    const chartRef = this.chart?.chart as ChartRef | undefined;
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

  initializeChart(data: InternalCandle[]): void {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    if (!chartRef) return;
    // Default view (TradingView): latest candles, current candle on the right, price fitted.
    this.interaction.zoomToRecent(chartRef, data);
    this.storeViewportInOptions(chartRef);
    this.onViewportChanged();
  }

  /** Default view range for `candles` into chartOptions only (the chart instance keeps its old data until ng2-charts updates). */
  private presetRecentRange(candles: InternalCandle[]): void {
    const area = (this.chart?.chart as ChartRef | undefined)?.chartArea;
    const range = this.interaction.recentRange(candles, area ? area.right - area.left : 0);
    if (!range) return;
    this.interaction.yAutoScale = true;
    // The default view follows the live edge.
    this.interaction.resetLiveFollow();
    this.chartOptions = this.chartOptions ?? ({} as ChartBaseOptions);
    this.chartOptions.scales = this.chartOptions.scales ?? ({} as ChartBaseScales);
    this.chartOptions.scales.x = { ...(this.chartOptions.scales.x ?? {}), min: range.xMin, max: range.xMax };
    this.chartOptions.scales.y = { ...(this.chartOptions.scales.y ?? {}), min: range.yMin, max: range.yMax };
  }

  private hasFiniteXRange(chartRef: ChartRef): boolean {
    const x = chartRef?.scales?.x?.options;
    return Number.isFinite(x?.min) && Number.isFinite(x?.max);
  }

  /**
   * Write the live x/y range into chartOptions so Angular change detection does NOT
   * overwrite it with the previous timeframe's scale the next time ng2-charts
   * re-reads chartOptions (e.g. after addBoxesDatasets).
   */
  private storeViewportInOptions(chartRef: ChartRef): void {
    const x = chartRef?.scales?.x?.options;
    const y = chartRef?.scales?.y?.options;
    if (!x || !y) return;
    try {
      this.chartOptions = this.chartOptions ?? ({} as ChartBaseOptions);
      this.chartOptions.scales = this.chartOptions.scales ?? ({} as ChartBaseScales);
      this.chartOptions.scales.x = { ...(this.chartOptions.scales.x ?? {}), min: x.min, max: x.max };
      this.chartOptions.scales.y = { ...(this.chartOptions.scales.y ?? {}), min: y.min, max: y.max };
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
    // Every exchange / symbol / timeframe change starts at the live edge, following it.
    this.interaction.resetLiveFollow();
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
    this.updateDocumentTitle();
  }

  /** Browser tab title: selected coin, live price and timeframe, e.g. "BTCUSDT 62,345.12 · 1h | MyTradingBox". */
  private updateDocumentTitle(): void {
    if (this.destroyed) return;
    const symbol = this.selectedSymbol?.SymbolName;
    if (!symbol) return;
    const price = Number.isFinite(this.currentPrice) && this.currentPrice
      ? ` ${formatNumber(this.currentPrice, this.locale, '1.2-8')}`
      : '';
    const title = `${symbol}${price} · ${this.selectedTimeframe} | ${this.defaultDocumentTitle}`;
    if (title !== this.titleService.getTitle()) this.titleService.setTitle(title);
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
          map((candles: Candle[]) => {
            const toUtcMs = (s: string): number =>
              new Date(/[Zz]$|[+\-]\d{2}:\d{2}$/.test(s) ? s : s + 'Z').getTime();
            return {
              periodStart,
              candles: (candles || []).map((c) => ({
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
      filter((result): result is NonNullable<typeof result> => result !== null),
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
            const previousLength = this.baseData.length;
            this.baseData = applyLiveCandleToBaseData(this.baseData, liveCandle);
            if (this.baseData.length > previousLength) this._pendingLiveBars += this.baseData.length - previousLength;
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
    this._pendingLiveBars = 0;
  }

  private flushLiveRender(): void {
    this._liveRenderRaf = null;
    let forceCd = false;
    if (this._liveRenderChartDirty) {
      this._liveRenderChartDirty = false;
      const chartRef = this.chart?.chart as ChartRef | undefined;
      if (chartRef) {
        try {
          chartRef.data.datasets[0].data = this.baseData;
          // Realtime follow: new bars move the x range by exactly their count while 'following' (never on a tick of the
          // open candle). Main chart only: the update below projects it onto the linked panes in this same frame.
          const newBars = this._pendingLiveBars;
          this._pendingLiveBars = 0;
          if (newBars > 0) {
            this.interaction.followLiveBars(chartRef, this.baseData, newBars);
            // The overscroll range grew with the data: box overlays built from now on reach the newest candles.
            try {
              (window as Window & { __chartExtendedMax?: number }).__chartExtendedMax = this.interaction.extendedDataRange.max;
            } catch {}
          }
          // Price auto scale follows a live candle that leaves the Y range (not during a gesture, not after a manual scale).
          this.interaction.refitYForLiveCandle(chartRef);
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
    this.updateDocumentTitle();
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

      this.baseData = merged as InternalCandle[];
      if (merged.length > previousLength) this._pendingLiveBars += merged.length - previousLength;
      this.applyLivePriceFromLastCandle();

      // Closed or newly opened bars also refresh the aux panel (e.g. MCB).
      const newBar =
        !!liveUpdate.isClosed ||
        previousLength !== this.baseData.length ||
        previousLastX !== (this.baseData[this.baseData.length - 1]?.x ?? null);
      this.scheduleLiveRender(true, newBar);
      if (previousLastX !== (this.baseData[this.baseData.length - 1]?.x ?? null)) {
        this.scheduleSignalOverlayRefresh();
      }
    });
  }

  /**
   * A new bar opened: the bot writes divergences / MCB signals for the bar that just
   * closed, so refetch them shortly after (gives the bot time to store them).
   */
  private scheduleSignalOverlayRefresh(): void {
    if (!this.showDivergences && !this.showMarketCipher) return;
    if (this._signalRefreshTimer) clearTimeout(this._signalRefreshTimer);
    const generation = this._selectionGeneration;
    this._signalRefreshTimer = setTimeout(() => {
      this._signalRefreshTimer = null;
      if (!this.isCurrentSelection(generation)) return;
      this.ngZone.run(() => this.reloadSignalOverlays());
    }, ChartBaseComponent.SIGNAL_REFRESH_DELAY_MS);
  }

  // Touch handlers
  // Delegated interaction handlers

  /** Returns the id of a horizontal line within HIT_PX pixels of (cx, cy), or null */
  private hitTestHorizontalLine(cx: number, cy: number, chartRef: ChartRef): string | null {
    const HIT_PX = 8;
    const yScale = chartRef?.scales?.y;
    if (!yScale) return null;
    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
      if (d.type !== 'horizontal-line') continue;
      if (Math.abs(cy - yScale.getPixelForValue(d.points[0].y)) <= HIT_PX) return d.id;
    }
    return null;
  }

  /** Returns the id of a vertical line within HIT_PX pixels of (cx, cy), or null */
  private hitTestVerticalLine(cx: number, cy: number, chartRef: ChartRef): string | null {
    const HIT_PX = 8;
    const xScale = chartRef?.scales?.x;
    if (!xScale) return null;
    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
      if (d.type !== 'vertical-line') continue;
      if (Math.abs(cx - xScale.getPixelForValue(d.points[0].x)) <= HIT_PX) return d.id;
    }
    return null;
  }

  /** Returns the id of a trend line within HIT_PX pixels of (cx, cy), or null */
  private hitTestTrendLine(cx: number, cy: number, chartRef: ChartRef): string | null {
    const HIT_PX = 8;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
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

    // Pen strokes: distance to the nearest segment of the polyline
    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
      if (d.type !== 'pen' || d.points.length < 2) continue;
      let px = xScale.getPixelForValue(d.points[0].x);
      let py = yScale.getPixelForValue(d.points[0].y);
      for (let i = 1; i < d.points.length; i++) {
        const nx = xScale.getPixelForValue(d.points[i].x);
        const ny = yScale.getPixelForValue(d.points[i].y);
        const sx = nx - px;
        const sy = ny - py;
        const lenSq = sx * sx + sy * sy;
        const t = lenSq <= 0.0001 ? 0 : Math.max(0, Math.min(1, ((cx - px) * sx + (cy - py) * sy) / lenSq));
        if (Math.hypot(cx - (px + t * sx), cy - (py + t * sy)) <= HIT_PX) return d.id;
        px = nx;
        py = ny;
      }
    }

    return null;
  }

  /** Pen: data-space point for a canvas pixel, clamped to the plot area. */
  private penDataPoint(px: number, py: number, chartRef: ChartRef): { x: number; y: number } | null {
    const area = chartRef.chartArea;
    const xScale = chartRef.scales?.x;
    const yScale = chartRef.scales?.y;
    if (!area || !xScale || !yScale) return null;
    const cx = Math.max(area.left, Math.min(px, area.right));
    const cy = Math.max(area.top, Math.min(py, area.bottom));
    return { x: xScale.getValueForPixel(cx), y: yScale.getValueForPixel(cy) };
  }

  /** Pen: start a stroke when the pointer goes down inside the plot area. */
  private penPointerDown(px: number, py: number, chartRef: ChartRef): void {
    const area = chartRef.chartArea;
    if (!area || px < area.left || px > area.right || py < area.top || py > area.bottom) return;
    const p = this.penDataPoint(px, py, chartRef);
    if (!p) return;
    this.drawingTools.startPenStroke(p.x, p.y);
    this._penLastPx = { x: px, y: py };
    chartRef._isInteracting = false;
    chartRef.draw();
  }

  /** Pen: add a point to the stroke in progress. */
  private penPointerMove(px: number, py: number, chartRef: ChartRef): void {
    if (!this.drawingTools.isPenStroking) return;
    const last = this._penLastPx;
    if (last && Math.hypot(px - last.x, py - last.y) < this.PEN_MIN_STEP_PX) return;
    const p = this.penDataPoint(px, py, chartRef);
    if (!p) return;
    this.drawingTools.extendPenStroke(p.x, p.y);
    this._penLastPx = { x: px, y: py };
    chartRef._isInteracting = false;
    if (!this._drawRafPending) {
      this._drawRafPending = true;
      requestAnimationFrame(() => { this._drawRafPending = false; chartRef.draw(); });
    }
  }

  /** Pen: commit the stroke in progress (pen stays active for the next stroke). */
  private penPointerUp(chartRef: ChartRef | undefined): void {
    this._penLastPx = null;
    if (!this.drawingTools.isPenStroking) return;
    this.drawingTools.finishPenStroke();
    chartRef?.draw();
  }

  /** Returns a trend-line endpoint handle if (cx, cy) is close enough, or null */
  private hitTestTrendHandle(
    cx: number,
    cy: number,
    chartRef: ChartRef,
    specificId?: string,
  ): { id: string; pointIndex: number } | null {
    const HIT_PX = 12;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
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
  private hitTestBox(cx: number, cy: number, chartRef: ChartRef): string | null {
    const HIT_PX = 6;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;
    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
      const isBox = isBoxType(d.type);
      const isPos = d.type === 'long-position' || d.type === 'short-position';
      if (!isBox && !isPos) continue;
      if (d.points.length < 2) continue;
      const allX = d.points.map((p) => xScale.getPixelForValue(p.x));
      const allY = d.points.map((p) => yScale.getPixelForValue(p.y));
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
    chartRef: ChartRef,
    specificId?: string,
  ): { id: string; row: 'tp' | 'entry' | 'sl'; side: 'left' | 'right' } | null {
    const HIT_PX = 10;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
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
    chartRef: ChartRef,
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
    chartRef: ChartRef,
    specificId?: string,
  ): { id: string; pointIndex: number } | null {
    const HIT_PX = 14;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
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
    chartRef: ChartRef,
    specificId?: string,
  ): string | null {
    const HIT_PX = 14;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.paneDrawings('price')) {
      if (this.drawingTools.isLocked(d)) continue;
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

  /**
   * Id of a locked drawing under (cx, cy). Locked drawings are skipped by the drag hit-tests above;
   * this only lets a click select one (so it can be unlocked) while the press still pans the chart.
   */
  private hitTestLockedDrawing(cx: number, cy: number, chartRef: ChartRef): string | null {
    const HIT_PX = 8;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    const drawings = this.drawingTools.paneDrawings('price');
    for (let i = drawings.length - 1; i >= 0; i--) {
      const d = drawings[i];
      if (!this.drawingTools.isLocked(d) || !d.points.length) continue;
      const xs = d.points.map(p => xScale.getPixelForValue(p.x));
      const ys = d.points.map(p => yScale.getPixelForValue(p.y));
      if (d.type === 'horizontal-line') {
        if (Math.abs(cy - ys[0]) <= HIT_PX) return d.id;
      } else if (d.type === 'vertical-line') {
        if (Math.abs(cx - xs[0]) <= HIT_PX) return d.id;
      } else if (
        cx >= Math.min(...xs) - HIT_PX && cx <= Math.max(...xs) + HIT_PX &&
        cy >= Math.min(...ys) - HIT_PX && cy <= Math.max(...ys) + HIT_PX
      ) {
        return d.id;
      }
    }
    return null;
  }

  /** Returns a rectangle corner handle if (cx, cy) is close enough, or null */
  private hitTestRectHandle(
    cx: number,
    cy: number,
    chartRef: ChartRef,
  ): { id: string; xIdx: number; yIdx: number; cursor: string } | null {
    const HIT_PX = 10;
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale) return null;

    for (const d of this.drawingTools.paneDrawings('price')) {
      if (d.type !== 'rectangle' || d.points.length < 2 || this.drawingTools.isLocked(d)) continue;
      // Corners: (p0.x,p0.y) (p1.x,p1.y) (p0.x,p1.y) (p1.x,p0.y)
      for (const [xIdx, yIdx] of [[0, 0], [1, 1], [0, 1], [1, 0]]) {
        const px = xScale.getPixelForValue(d.points[xIdx].x);
        const py = yScale.getPixelForValue(d.points[yIdx].y);
        if (Math.hypot(cx - px, cy - py) > HIT_PX) continue;
        // Diagonal cursor pointing at the opposite corner
        const ox = xScale.getPixelForValue(d.points[1 - xIdx].x);
        const oy = yScale.getPixelForValue(d.points[1 - yIdx].y);
        const cursor = (px - ox) * (py - oy) >= 0 ? 'nwse-resize' : 'nesw-resize';
        return { id: d.id, xIdx, yIdx, cursor };
      }
    }
    return null;
  }

  private applyRectResize(
    resize: { id: string; xIdx: number; yIdx: number },
    cx: number,
    cy: number,
    chartRef: ChartRef,
  ): void {
    const xScale = chartRef?.scales?.x;
    const yScale = chartRef?.scales?.y;
    if (!xScale || !yScale || !this._dragStartPoints || this._dragStartPoints.length < 2) return;

    const nextPoints = this._dragStartPoints.map(p => ({ ...p }));
    nextPoints[resize.xIdx].x = xScale.getValueForPixel(cx);
    nextPoints[resize.yIdx].y = yScale.getValueForPixel(cy);
    this.drawingTools.updateDrawingPoints(resize.id, nextPoints);
  }

  /** Start dragging a rectangle corner; returns true when a handle was hit. */
  private startRectResize(cx: number, cy: number, chartRef: ChartRef): boolean {
    const handle = this.hitTestRectHandle(cx, cy, chartRef);
    if (!handle) return false;
    const rect = this.drawingTools.drawingsValue.find(d => d.id === handle.id);
    this.drawingTools.selectedDrawingId = handle.id;
    this._activeRectResize = handle;
    this._draggingLineId = handle.id;
    this.drawingTools.draggingId = handle.id;
    this._dragStartPoints = rect ? rect.points.map(p => ({ ...p })) : null;
    chartRef.draw();
    return true;
  }

  /**
   * Press on the chart (no drawing tool) that hit no movable drawing: select a locked drawing under
   * the pointer so it can be unlocked (the press still pans), or else clear the selection.
   */
  private selectLockedOrClear(cx: number, cy: number, chartRef: ChartRef): void {
    const lockedId = this.hitTestLockedDrawing(cx, cy, chartRef);
    const current = this.drawingTools.selectedDrawingId;
    if (lockedId) {
      if (current !== lockedId) {
        this.drawingTools.selectedDrawingId = lockedId;
        chartRef.draw();
      }
      return;
    }
    if (current && current !== this.selectedPositionId) {
      this.drawingTools.selectedDrawingId = null;
      chartRef.draw();
    }
  }

  private applyFibResize(
    resize: { id: string; pointIndex: number },
    cx: number,
    cy: number,
    chartRef: ChartRef,
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
    chartRef: ChartRef,
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
    chartRef: ChartRef,
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
    this._activeRectResize = null;

    if (persist && !this._restoringChartState) {
      this.saveCurrentChartState();
    }
  }

  onTouchStart(event: TouchEvent): void {
    if (this.drawingTools.activeToolValue === 'pen') {
      event.preventDefault();
      const chartRef = this.chart?.chart as ChartRef | undefined;
      if (chartRef && event.touches.length === 1) {
        const rect = chartRef.canvas.getBoundingClientRect();
        this.penPointerDown(event.touches[0].clientX - rect.left, event.touches[0].clientY - rect.top, chartRef);
      } else {
        this.penPointerUp(chartRef);
      }
      return;
    }
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      // Record touch start position for drawing; don't start pan/zoom/longpress
      const chartRef = this.chart?.chart as ChartRef | undefined;
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
      const chartRefD = this.chart?.chart as ChartRef | undefined;
      if (chartRefD) {
        const rectD = chartRefD.canvas.getBoundingClientRect();
        const tx = event.touches[0].clientX - rectD.left;
        const ty = event.touches[0].clientY - rectD.top;
        if (this.startRectResize(tx, ty, chartRefD)) {
          event.preventDefault();
          return;
        }
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
          this.drawingTools.selectedDrawingId = lineId;
          this._draggingLineId = lineId;
          this.drawingTools.draggingId = lineId;
          const draggedLine = this.drawingTools.drawingsValue.find(d => d.id === lineId);
          if (draggedLine?.type === 'trend-line' || draggedLine?.type === 'pen') {
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
              this.chart?.chart?.draw();
              this.cdr.detectChanges();
            }, 500);
            chartRefD.draw();
            return;
          }
          // Regular boxes (rectangle, box-green, box-red): start drag immediately
          event.preventDefault();
          this.drawingTools.selectedDrawingId = boxId;
          this._draggingLineId = boxId;
          this.drawingTools.draggingId = boxId;
          if (xScaleB && yScaleB) {
            this._dragStartDataPos = { x: xScaleB.getValueForPixel(tx), y: yScaleB.getValueForPixel(ty) };
            this._dragStartPoints  = boxMeta.points.map(p => ({ ...p }));
          }
          chartRefD.draw();
          return;
        }
        this.selectLockedOrClear(tx, ty, chartRefD);
      }
    }
    this.interaction.onTouchStart(event, (this.chart?.chart as ChartRef | undefined)!);
  }
  onTouchMove(event: TouchEvent): void {
    if (this.drawingTools.activeToolValue === 'pen') {
      event.preventDefault();
      const chartRef = this.chart?.chart as ChartRef | undefined;
      if (chartRef && event.touches.length === 1) {
        const rect = chartRef.canvas.getBoundingClientRect();
        this.penPointerMove(event.touches[0].clientX - rect.left, event.touches[0].clientY - rect.top, chartRef);
      }
      return;
    }
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      const chartRef = this.chart?.chart as ChartRef | undefined;
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
      const chartRefLP = this.chart?.chart as ChartRef | undefined;
      if (chartRefLP) {
        const rectLP = chartRefLP.canvas.getBoundingClientRect();
        const lx = event.touches[0].clientX - rectLP.left;
        const ly = event.touches[0].clientY - rectLP.top;
        const moved = Math.hypot(lx - (this._longPressStartX ?? lx), ly - (this._longPressStartY ?? ly));
        if (moved > 8) {
          clearTimeout(this._longPressTimer ?? undefined);
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
      const chartRefD = this.chart?.chart as ChartRef | undefined;
      if (chartRefD) {
        const rectD = chartRefD.canvas.getBoundingClientRect();
        const cx = event.touches[0].clientX - rectD.left;
        const cy = event.touches[0].clientY - rectD.top;
        if (this._activeFibResize) {
          this.applyFibResize(this._activeFibResize, cx, cy, chartRefD);
          chartRefD.draw();
          return;
        }
        if (this._activeRectResize) {
          this.applyRectResize(this._activeRectResize, cx, cy, chartRefD);
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
          isBoxType(dragged?.type ?? null) ||
          dragged?.type === 'long-position' ||
          dragged?.type === 'short-position' ||
          dragged?.type === 'fib-retracement' ||
          dragged?.type === 'fib-extension' ||
          dragged?.type === 'trend-line' ||
          dragged?.type === 'pen'
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
    this.interaction.onTouchMove(event, (this.chart?.chart as ChartRef | undefined)!);
  }
  onTouchEnd(event: TouchEvent): void {
    // End line / box drag
    if (this._draggingLineId) {
      this.finalizeDrawingDrag(true);
      return;
    }
    if (this.drawingTools.activeToolValue === 'pen') {
      event.preventDefault();
      this.penPointerUp(this.chart?.chart as ChartRef | undefined);
      return;
    }
    if (this.drawingTools.activeToolValue) {
      event.preventDefault();
      const chartRef = this.chart?.chart as ChartRef | undefined;

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
      clearTimeout(this._longPressTimer ?? undefined);
      this._longPressTimer = null;
      this._pendingPosId   = null;
    }
    if (tappedPosId) {
      const d = this.drawingTools.drawingsValue.find(
        dr => dr.id === tappedPosId && (dr.type === 'long-position' || dr.type === 'short-position'),
      );
      if (d) {
        this.selectPositionDrawing(d);
        this.chart?.chart?.draw();
        this.cdr.detectChanges();
      }
      return;
    }
    // Dismiss edit sheet when tapping outside the selected position
    if (this.selectedPositionId && event.changedTouches.length === 1) {
      const chartRefT = this.chart?.chart as ChartRef | undefined;
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
      const chartRefT = this.chart?.chart as ChartRef | undefined;
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
    const chartRefE = this.chart?.chart as ChartRef | undefined;
    const tap = this.interaction.onTouchEnd(event, chartRefE!);
    // iOS fires no dblclick (touchstart is prevented), so detect a double-tap on the axes here.
    // A gesture between two taps breaks the pair (like a drag before a double click).
    if (!tap) this.axisDoubleTap.reset();
    if (tap && this.axisDoubleTap.tap(tap.x, tap.y)) {
      const axis = this.interaction.axisAt(chartRefE, tap.x, tap.y);
      if (axis) {
        this.resetAxisScale(axis);
        return;
      }
    }
    this.onViewportChanged(); // after pan
  }
  /**
   * touchcancel (the browser took the touches): end whatever the touch drove (drawing drag, pending position
   * long-press, pan / pinch / axis scale) like a release, never as a tap.
   */
  onTouchCancel(): void {
    this.penPointerUp(this.chart?.chart as ChartRef | undefined);
    if (this._draggingLineId) this.finalizeDrawingDrag(true);
    if (this._pendingPosId || this._longPressTimer) {
      clearTimeout(this._longPressTimer ?? undefined);
      this._longPressTimer = null;
      this._pendingPosId = null;
    }
    this._touchStartRaw = null;
    this.axisDoubleTap.reset();
    this.interaction.onTouchCancel((this.chart?.chart as ChartRef | undefined)!);
    this.onViewportChanged();
  }
  onMouseDown(event: MouseEvent): void {
    this._mousePress = { x: event.clientX, y: event.clientY, maxTravel: 0 };
    if (this.drawingTools.activeToolValue === 'pen') {
      const chartRef = this.chart?.chart as ChartRef | undefined;
      if (chartRef && event.button === 0) {
        const rect = chartRef.canvas.getBoundingClientRect();
        this.penPointerDown(event.clientX - rect.left, event.clientY - rect.top, chartRef);
      }
      return;
    }
    if (this.drawingTools.activeToolValue) {
      // Handle drawing click
      const chartRef = this.chart?.chart as ChartRef | undefined;
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
      const chartRefD = this.chart?.chart as ChartRef | undefined;
      if (chartRefD) {
        const rectD = chartRefD.canvas.getBoundingClientRect();
        const mx = event.clientX - rectD.left;
        const my = event.clientY - rectD.top;
        if (this.startRectResize(mx, my, chartRefD)) return;
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
          this.drawingTools.selectedDrawingId = lineId;
          this._draggingLineId = lineId;
          this.drawingTools.draggingId = lineId;
          const draggedLine = this.drawingTools.drawingsValue.find(d => d.id === lineId);
          if (draggedLine?.type === 'trend-line' || draggedLine?.type === 'pen') {
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

          if (isBoxType(boxMeta.type)) this.drawingTools.selectedDrawingId = boxId;
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

        this.selectLockedOrClear(mx, my, chartRefD);
      }
    }
    this.interaction.onMouseDown(event, (this.chart?.chart as ChartRef | undefined)!);
  }
  onMouseMove(event: MouseEvent): void {
    this.trackMousePressTravel(event);
    if (this.drawingTools.activeToolValue === 'pen') {
      const chartRef = this.chart?.chart as ChartRef | undefined;
      if (chartRef) {
        const rect = chartRef.canvas.getBoundingClientRect();
        this.penPointerMove(event.clientX - rect.left, event.clientY - rect.top, chartRef);
      }
      return;
    }
    if (this.drawingTools.activeToolValue) {
      const chartRef = this.chart?.chart as ChartRef | undefined;
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
      const chartRefD = this.chart?.chart as ChartRef | undefined;
      if (chartRefD) {
        const rectD = chartRefD.canvas.getBoundingClientRect();
        const cx = event.clientX - rectD.left;
        const cy = event.clientY - rectD.top;
        if (this._activeFibResize) {
          this.applyFibResize(this._activeFibResize, cx, cy, chartRefD);
          chartRefD.draw();
          return;
        }
        if (this._activeRectResize) {
          this.applyRectResize(this._activeRectResize, cx, cy, chartRefD);
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
          isBoxType(dragged?.type ?? null) ||
          dragged?.type === 'long-position' ||
          dragged?.type === 'short-position' ||
          dragged?.type === 'fib-retracement' ||
          dragged?.type === 'fib-extension' ||
          dragged?.type === 'trend-line' ||
          dragged?.type === 'pen'
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
      const chartRefH = this.chart?.chart as ChartRef | undefined;
      if (chartRefH) {
        const rectH = chartRefH.canvas.getBoundingClientRect();
        const mx = event.clientX - rectH.left;
        const my = event.clientY - rectH.top;
        const hRectHandle = this.hitTestRectHandle(mx, my, chartRefH);
        const hHoriz = !hRectHandle ? this.hitTestHorizontalLine(mx, my, chartRefH) : null;
        const hVert  = !hRectHandle && !hHoriz ? this.hitTestVerticalLine(mx, my, chartRefH) : null;
        const hTrendHandle = !hHoriz && !hVert ? this.hitTestTrendHandle(mx, my, chartRefH) : null;
        const hTrend = !hHoriz && !hVert && !hTrendHandle ? this.hitTestTrendLine(mx, my, chartRefH) : null;
        const hFibHandle = !hHoriz && !hVert && !hTrendHandle && !hTrend ? this.hitTestFibHandle(mx, my, chartRefH) : null;
        const hFibBody = !hHoriz && !hVert && !hTrendHandle && !hTrend && !hFibHandle ? this.hitTestFibBody(mx, my, chartRefH) : null;
        const hHandle = !hHoriz && !hVert && !hTrendHandle && !hTrend && !hFibHandle && !hFibBody ? this.hitTestPositionHandle(mx, my, chartRefH) : null;
        const hBox   = !hHoriz && !hVert && !hTrendHandle && !hTrend && !hFibHandle && !hFibBody && !hHandle ? this.hitTestBox(mx, my, chartRefH) : null;
        const hoverId = hRectHandle?.id ?? hHoriz ?? hVert ?? hTrendHandle?.id ?? hTrend ?? hFibHandle?.id ?? hFibBody ?? hHandle?.id ?? hBox;
        if (hoverId !== this.drawingTools.hoveredId) {
          this.drawingTools.hoveredId = hoverId;
          const cursor = hRectHandle
            ? hRectHandle.cursor
            : hHoriz
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
        // Resize cursor over the price/time axis (drag there scales, like TradingView)
        if (!hoverId && !this.interaction.gestureType) {
          const axis = this.interaction.axisAt(chartRefH, event.clientX, event.clientY);
          const axisCursor = axis === 'y' ? 'ns-resize' : axis === 'x' ? 'ew-resize' : '';
          const canvasEl = chartRefH.canvas as HTMLCanvasElement;
          if (canvasEl.style.cursor !== axisCursor) canvasEl.style.cursor = axisCursor;
        }
      }
    }
    this.interaction.onMouseMove(event, (this.chart?.chart as ChartRef | undefined)!);
  }
  onMouseUp(event: MouseEvent): void {
    this.penPointerUp(this.chart?.chart as ChartRef | undefined);
    if (this._draggingLineId) {
      this.finalizeDrawingDrag(true);
      this.recordComponentPress(event);
      return;
    }
    if (this.drawingTools.activeToolValue) {
      this.recordComponentPress(event);
      return;
    }
    this._mousePress = null;
    this.interaction.onMouseUp(event, (this.chart?.chart as ChartRef | undefined)!);
    this.onViewportChanged(); // after pan
  }
  onMouseLeave(): void {
    this.penPointerUp(this.chart?.chart as ChartRef | undefined);
    if (this._draggingLineId) {
      this.finalizeDrawingDrag(true);
    }
    if (this.drawingTools.hoveredId) {
      this.drawingTools.hoveredId = null;
      const chartRefL = this.chart?.chart as ChartRef | undefined;
      if (chartRefL) {
        (chartRefL.canvas as HTMLCanvasElement).style.cursor = '';
        chartRefL.draw();
      }
    }
    if (this.drawingTools.activeToolValue) {
      this.drawingTools.clearCursor();
      this.drawingTools.clearSnapIndicator();
      const chartRef = this.chart?.chart as ChartRef | undefined;
      if (chartRef) {
        chartRef._isInteracting = false;
        chartRef.draw();
      }
      return;
    }
    this.interaction.onMouseLeave((this.chart?.chart as ChartRef | undefined)!);
  }
  /** A press this component ended itself (drawing drag / drawing tool) counts for dblclick-after-drag like a chart press. */
  private recordComponentPress(event: MouseEvent): void {
    this.trackMousePressTravel(event);
    const travel = this._mousePress?.maxTravel ?? 0;
    this._mousePress = null;
    this.interaction.recordComponentPress(travel);
  }
  private trackMousePressTravel(event: MouseEvent): void {
    const press = this._mousePress;
    if (!press) return;
    const travel = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (travel > press.maxTravel) press.maxTravel = travel;
  }
  /** `paneCursorX`: cursor x across a linked pane's plot (default: the cursor on the main chart). */
  onWheel(event: WheelEvent, paneCursorX?: number | null): void {
    this.interaction.onWheel(event, (this.chart?.chart as ChartRef | undefined)!, paneCursorX);
  }

  // Helper method to detect if touch is in axis area
  isTouchInAxisArea(
    touchPoint: { x: number; y: number },
    chartRef: ChartRef | null | undefined,
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
    this.zoomToRecent();
  }

  /** Default view (TradingView): latest candles with the current candle on the right, price fitted. */
  zoomToRecent(): void {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    if (!chartRef?.scales?.x?.options || !chartRef?.scales?.y?.options) return;
    this.interaction.zoomToRecent(chartRef);
    this.storeViewportInOptions(chartRef);
    this.onViewportChanged();
  }
  fitToData(): void {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    this.interaction.fitToData(chartRef!);
    try {
      chartRef?.update?.('none');
    } catch {}
    this.onViewportChanged();
  }

  /**
   * Double-click: price axis = price auto scale fitted to the visible candles, time axis = horizontal
   * scale reset (Y mode untouched); on the plot the chart view never changes (fullscreen toggle only).
   */
  onContainerDblClick(event: MouseEvent): void {
    // One of the two clicks was a drag (pan / axis scale): no double click, nothing is reset.
    if (this.interaction.doubleClickFollowsDrag) return;
    const axis = this.interaction.axisAt(this.chart?.chart as ChartRef | undefined, event.clientX, event.clientY);
    if (axis) {
      this.resetAxisScale(axis);
      return;
    }
    this.toggleFullscreen();
  }

  /** Axis double-click / double-tap: 'y' = price auto fit to the visible candles, 'x' = time scale reset. */
  resetAxisScale(axis: 'x' | 'y'): void {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    if (!chartRef?.scales?.x || !chartRef?.scales?.y) return;
    if (axis === 'x') {
      this.resetTimeScale(); // also stores the viewport and notifies
      return;
    }
    this.interaction.resetPriceScale(chartRef);
    this.storeViewportInOptions(chartRef);
    this.onViewportChanged();
  }

  /** Time-axis double-click / double-tap (also from the MCB pane's time axis): bar spacing back to default, Y mode untouched. */
  resetTimeScale(): void {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    if (!chartRef?.scales?.x || !chartRef?.scales?.y) return;
    if (!this.interaction.resetTimeScale(chartRef)) return;
    this.storeViewportInOptions(chartRef);
    this.onViewportChanged();
  }

  /**
   * "Return to live": newest candle back at the right edge with the configured right offset, current bar
   * spacing kept, Y mode untouched, realtime follow on.
   */
  goToRealtime(): void {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    if (!chartRef?.scales?.x || !chartRef?.scales?.y) return;
    if (!this.interaction.goToRealtime(chartRef)) return;
    this.storeViewportInOptions(chartRef);
    this.onViewportChanged();
  }

  /**
   * The "Return to live" control is shown while the view is detached from the live edge. Reads the
   * service's live-follow signal, so the template updates when a pan (or a global command) changes it.
   */
  get showReturnToLive(): boolean {
    return this.interaction.liveFollowStateSignal() === 'detached' && !!this.baseData?.length;
  }

  /** "Return to live" position: bottom-right corner of the main plot, next to the time and price axes. */
  get returnToLivePosition(): { right: number; bottom: number } {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    const area = chartRef?.chartArea;
    const gap = 8;
    if (!chartRef || !area || !(chartRef.width > 0) || !(chartRef.height > 0)) return { right: gap, bottom: gap };
    return {
      right: Math.max(0, chartRef.width - area.right) + gap,
      bottom: Math.max(0, chartRef.height - area.bottom) + gap,
    };
  }

  /** Axis double-click / double-tap: jump to the latest candle, price fitted. */
  zoomToLatestCandle(): void {
    const chartRef = this.chart?.chart as ChartRef | undefined;
    if (!chartRef?.scales?.x || !chartRef?.scales?.y) return;
    this.interaction.zoomToLatest(chartRef);
    this.storeViewportInOptions(chartRef);
    this.onViewportChanged();
  }

  // (resolveBoxColors moved to chart-utils.ts)

  addBoxesDatasets(): void {
    const mainDs = this.chartData.datasets[0]?.data as Array<{ x: number }>;
    if (!mainDs || mainDs.length < 2) return;
    // remove existing box datasets first
    this.chartData.datasets = this.chartData.datasets.filter(
      (d) => !d.isBox,
    );

    // Filter boxes to only those whose price zone overlaps with the current
    // candle range (+/- 20% buffer). This prevents 1D boxes far above/below
    // the current price from stretching the Y-axis on shorter timeframes.
    let filteredBoxes = this.boxes || [];
    if (this.baseData && this.baseData.length) {
      const highs = this.baseData.map((c) => c.h ?? 0);
      const lows = this.baseData.map((c) => c.l ?? Infinity);
      const dataMin = Math.min(...lows);
      const dataMax = Math.max(...highs);
      const buffer = (dataMax - dataMin) * 0.20;
      const rangeMin = dataMin - buffer;
      const rangeMax = dataMax + buffer;
      filteredBoxes = filteredBoxes.filter((b: BoxOverlaySource) => {
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
          (d) => !d.isKeyZone,
        );
      });
    }
    this.persistChartSettings();
  }

  // New method to fetch key zones
  fetchKeyZones(symbolName: string): Observable<KeyZonesModel | null> {
    if (!symbolName) return of(null);

    // clear any existing key zone state immediately so UI updates
    this.keyZones = null;
    this._loadedKeyZonesKey = null;
    const keyZonesKey = this.contextKey(symbolName);
    // remove existing key zone datasets from chart immediately (use isKeyZone flag)
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d) => !d.isKeyZone,
      );
    });

    debugLog(`fetchKeyZones: symbol=${symbolName}`);

    // KeyZones endpoint returns levels, naked POCs, fixed range volume
    // profiles, order blocks, liquidity levels and fib levels
    return this.marketService.getKeyZones(symbolName).pipe(
      tap((kz) => {
        if (!kz) return;
        debugLog('fetchKeyZones result', kz);
        this.keyZones = kz;
        this._loadedKeyZonesKey = keyZonesKey;
        // Discover available timeframes from API response and update settings service
        const tfs = keyZoneTimeframes(kz);
        if (tfs.length) this.keyZoneSettings.setAvailableTimeframes(tfs);
        if (!this.showKeyZones) return;
        this.addKeyZoneDatasets();
      }),
    );
  }

  /** Rebuild the key-zone carrier dataset drawn by keyZonePainterPlugin. */
  addKeyZoneDatasets(): void {
    if (!this.keyZones) return;
    const settings = this.keyZoneSettings.getSettings();
    const items = settings.enabled
      ? buildKeyZoneItems(this.keyZones, this.keyZoneLayers, (tf) => this.isTimeframeVisible(tf))
      : [];
    // One dataset without points: it never affects the scales, the plugin
    // clips to the visible range on every frame (no rebuild on pan/zoom).
    const carrier: ChartDatasetEntry = {
      type: 'line' as const,
      label: 'Key zones',
      data: [],
      pointRadius: 0,
      borderWidth: 0,
      isKeyZone: true,
      keyZoneItems: items,
    };
    this.safeUpdateDatasets(() => {
      const rest = this.chartData.datasets.filter((d) => !d.isKeyZone);
      this.chartData.datasets = items.length ? rest.concat([carrier]) : rest;
    });
    debugLog('addKeyZoneDatasets: items', items.length);
  }

  toggleKeyZoneLayer(layer: KeyZoneLayer, enabled: boolean): void {
    this.keyZoneLayers = { ...this.keyZoneLayers, [layer]: enabled };
    if (this.showKeyZones && this.keyZones) this.addKeyZoneDatasets();
    this.persistChartSettings();
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
    return keyZoneTimeframeFlag(flags, tf);
  }

  /**
   * Display label for a key-zone timeframe in the settings panel: minutes stay
   * lowercase ('3m'), hours/days/weeks upper-case ('4H', '1W') and the month
   * is '1M' — so month and minute never render as the same label.
   */
  keyZoneTimeframeLabel(tf: string): string {
    return keyZoneTimeframeLabel(tf);
  }

  // Expose timeframe UI helpers for chart settings panel
  get availableTimeframes(): string[] {
    return this.keyZoneSettings.getAvailableTimeframes();
  }
  get allTimeframesEnabled(): boolean {
    return this.keyZoneSettings.isAllTimeframesEnabled();
  }
  /**
   * Current per-timeframe key-zone flags for the settings panel's pure
   * `keyZoneTimeframeEnabled` pipe. The service replaces this object on every
   * change, so its identity changes exactly when a flag changes.
   */
  get keyZoneTimeframeFlags(): Readonly<Record<string, boolean>> {
    return this.keyZoneSettings.getTimeframeFlags();
  }
  timeframeEnabled(tf: string): boolean {
    return this.keyZoneTimeframeFlag(this.keyZoneSettings.getSettings().timeframes, tf);
  }
  // Key-zone timeframe toggles are stored on this device via the key-zone slice.
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
    this.persistChartSettings();
    if (!this.showOrders) {
      this.orders = [];
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d) => !d.isOrder,
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
      (d) => !d.isOrder,
    );
    const xMin = mainDs[0].x;
    const xMax = mainDs[mainDs.length - 1].x;
    const lines: ChartDatasetEntry[] = [];
    this.orders.forEach((o: OrderModel & LegacyOrderFields) => {
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

  fetchOrders(symbolName: string): Observable<OrderModel[]> {
    if (!symbolName) return of([]);

    // Don't clear orders immediately - keep them for instant render above
    // this.orders = [];

    this._loadedOrdersKey = null;
    const ordersKey = this.contextKey(symbolName);

    // Remove existing order datasets to prepare for fresh render
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d) => !d.isOrder,
      );
    });

    return this.marketService.getTradeOrders(symbolName).pipe(
      tap((arr) => {
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
          (d) => !d.isMarketCipher,
        );
      });
      this.marketCipherSignals = [];
    }
    this.persistChartSettings();
  }

  private loadMarketCipherSignals(): void {
    if (!this.selectedSymbol?.SymbolName || !this.selectedTimeframe) {
      console.warn('Market Cipher: Missing symbol or timeframe');
      return;
    }
    const key = this.contextKey(this.selectedSymbol.SymbolName, true);

    this.indicatorsService
      .fetchMarketCipherSignals({
        symbolName: this.selectedSymbol.SymbolName,
        timeframe: this.selectedTimeframe,
        showMarketCipher: this.showMarketCipher,
      })
      .pipe(this.untilSelectionChange())
      .subscribe({
        next: (signals) => {
          debugLog('Market Cipher signals received:', signals);
          this.marketCipherSignals = signals;
          this._marketCipherKey = key;
          this.safeUpdateDatasets(() => this.applyMarketCipherDatasets());
        },
        error: (err) => {
          console.error('Error loading Market Cipher signals:', err);
        },
      });
  }

  onToggleDivergences(): void {
    if (this.showDivergences) {
      this.showDivergencesFromCacheOrLoad();
    } else {
      // Keep the fetched divergences so toggling on again needs no refetch
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d) => !d.isDivergence,
        );
      });
    }
    this.persistChartSettings();
  }

  /** Toggled back on without a new bar or other candles: reuse the cached fetch. */
  protected showDivergencesFromCacheOrLoad(): void {
    if (this.divergencesCacheFresh()) {
      this.safeUpdateDatasets(() => this.applyDivergenceDatasets());
    } else {
      this.loadDivergences();
    }
  }

  private divergencesCacheFresh(): boolean {
    const range = this._divergencesRange;
    if (!range || !this.baseData?.length) return false;
    if (this._divergencesKey !== this.contextKey(this.selectedSymbol?.SymbolName ?? '', true)) return false;
    return this.baseData[0].x >= range.from && this.baseData[this.baseData.length - 1].x === range.lastX;
  }

  private loadDivergences(): void {
    if (!this.selectedSymbol?.SymbolName || !this.selectedTimeframe) {
      console.warn('Divergences: Missing symbol or timeframe');
      return;
    }
    const key = this.contextKey(this.selectedSymbol.SymbolName, true);
    const from = this.baseData?.length ? this.baseData[0].x : undefined;
    const lastX = this.baseData?.length ? this.baseData[this.baseData.length - 1].x : undefined;

    this.indicatorsService
      .fetchDivergences({
        symbolName: this.selectedSymbol.SymbolName,
        timeframe: this.selectedTimeframe,
        showDivergences: this.showDivergences,
        from,
      })
      .pipe(this.untilSelectionChange())
      .subscribe({
        next: (data) => {
          debugLog('Divergences received:', data);
          this.divergences = data;
          this._divergencesKey = key;
          this._divergencesRange =
            from != null && lastX != null ? { from, lastX } : null;
          this.safeUpdateDatasets(() => this.applyDivergenceDatasets());
        },
        error: (err) => {
          console.error('Error loading Divergences:', err);
        },
      });
  }

  /** Replace Market Cipher datasets with ones built from the cached signals (current context only). */
  private applyMarketCipherDatasets(): void {
    this.chartData.datasets = this.chartData.datasets.filter(
      (d) => !d.isMarketCipher,
    );
    if (!this.showMarketCipher || !this.baseData?.length) return;
    if (this._marketCipherKey !== this.contextKey(this.selectedSymbol?.SymbolName ?? '', true)) return;
    this.chartData.datasets.push(
      ...(this.indicatorsService.buildMarketCipherDatasets({
        rawSignals: this.marketCipherSignals,
        baseData: this.baseData,
      }) as ChartDatasetEntry[]),
    );
  }

  /** Replace divergence lines/dots with ones built from the cached divergences (current context only). */
  protected applyDivergenceDatasets(): void {
    this.chartData.datasets = this.chartData.datasets.filter(
      (d) => !d.isDivergence,
    );
    if (!this.showDivergences || !this.baseData?.length) return;
    if (this._divergencesKey !== this.contextKey(this.selectedSymbol?.SymbolName ?? '', true)) return;
    this.chartData.datasets.push(
      ...(this.indicatorsService.buildDivergenceDatasets({
        divergences: this.divergences,
        baseData: this.baseData,
      }) as ChartDatasetEntry[]),
    );
  }

  onToggleIndicators(): void {
    // ngModel already updates `showIndicators` from the checkbox input.
    // Respect the current model value and act accordingly (do not flip it again).
    this.persistChartSettings();
    if (!this.showIndicators) {
      // remove indicator datasets ONLY, do NOT reset chartData/datasets
      // Do not preserve prior scales (they may be expanded due to indicator axis sync); allow autoFit afterwards.
      const chartRef = this.chart?.chart as ChartRef | undefined;
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
          (d) => !d.isIndicator,
        );
        this.ensureCandleWidth();
      }, false);
      this.interaction.updateCandleWidth(chartRef!);

      // After removing indicator datasets, re-fit Y scale to visible candles so candles keep correct height
      try {
        const chartRef = this.chart?.chart as ChartRef | undefined;
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
          // recalc y-scale based on visible candles (new data: back to auto scale)
          this.interaction.autoFitYScale(chartRef, true);
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
  }

  // Fetch Capital Flow signals from backend and add datasets
  // Fetching is in ChartIndicatorsService; this orchestrates dataset addition & axis sync
  private loadCapitalFlowSignals(): void {
    if (!this.showIndicators || !this.selectedSymbol?.SymbolName) return;
    // clear existing indicator datasets
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d) => !d.isIndicator,
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
              this.chartData.datasets.concat(newDatasets as ChartDatasetEntry[]);
          });
          try {
            this.interaction.updateCandleWidth((this.chart?.chart as ChartRef | undefined)!);
          } catch {}
          // refit y-scale ignoring indicator datasets
          try {
            const chartRef = this.chart?.chart as ChartRef | undefined;
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
    orderId: OrderModel['Id'],
    dash: number[] = [],
  ): ChartDatasetEntry {
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
      (d) => d['type'] === 'candlestick',
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
    const chartRef = this.chart?.chart as ChartRef | undefined;
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
    chartRef: ChartRef,
  ): { x: number; y: number; label: string | null } {
    const mode = this.drawingTools.magnetMode;
    if (mode === 'off') return { x: cx, y: cy, label: null };

    const xScale = chartRef.scales?.x;
    const yScale = chartRef.scales?.y;
    if (!xScale || !yScale) return { x: cx, y: cy, label: null };

    // Use the actual chart data (not Angular binding) and find the candlestick dataset
    const candleDs = chartRef.data?.datasets?.find((d) => d.type === 'candlestick');
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
    const searchData = data.filter((d) => d.x >= minTime && d.x <= maxTime);
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
      case 'pen':             return 'Houd ingedrukt en sleep om te tekenen';
      case 'rectangle':
        return pending === 0 ? `Punt 1/2 — ${tapLower} eerste hoek` : `Punt 2/2 — ${tapLower} tegenoverliggende hoek`;
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
    if (tool === 'fib-retracement' || tool === 'trend-line' || tool === 'rectangle') return [0, 1];
    return [0];
  }

  toggleTier(tier: CapitalFlowTier, enabled: boolean): void {
    this.interaction.setCapitalFlowFilter({ [tier]: enabled });
    this.persistChartSettings();
  }

  toggleAuxPanelSetting(key: string, enabled: boolean): void {
    this.applyAuxPanelSetting(key, enabled);
    this.cdr.markForCheck();
    this.persistChartSettings();
  }

  // Expose current filter to template
  get capitalFlowFilter(): Record<CapitalFlowTier, boolean> {
    return this.interaction.capitalFlowFilter;
  }

  // ------------------------------------------------------------------
  // Settings-panel selections (stored on this device)
  // ------------------------------------------------------------------

  /** Build a snapshot of current chart settings. */
  private buildSettingsSnapshot(): ChartSettingsSnapshot {
    return {
      ...this.auxPanelSettingsSnapshot(),
      showBoxes: this.showBoxes,
      showKeyZones: this.showKeyZones,
      keyZoneLayers: { ...this.keyZoneLayers },
      showOrders: this.showOrders,
      showIndicators: this.showIndicators,
      showMarketCipher: this.showMarketCipher,
      showDivergences: this.showDivergences,
      boxMode: this.boxMode,
    };
  }

  /**
   * Store the current selections on this device. Merged into the stored ones,
   * so another page's aux panel settings (e.g. settings.mcb) are kept.
   */
  protected persistChartSettings(): void {
    if (!this.usesDeviceChartSettings) return;
    this._settingsService.dispatchAppAction(
      SettingsActions.patchChartSettings({
        settings: {
          ...this.buildSettingsSnapshot(),
          capitalFlowTiers: { ...this.interaction.capitalFlowFilter },
        },
      }),
    );
  }

  /** Apply the selections stored on this device; absent ones keep the defaults. */
  private restoreDeviceChartSettings(): void {
    if (!this.usesDeviceChartSettings) return;
    this._settingsService
      .getChartSettings()
      .pipe(take(1))
      .subscribe((s) => {
        if (s.showBoxes !== undefined) this.showBoxes = s.showBoxes;
        if (s.showKeyZones !== undefined) this.showKeyZones = s.showKeyZones;
        if (s.showOrders !== undefined) this.showOrders = s.showOrders;
        if (s.showIndicators !== undefined) this.showIndicators = s.showIndicators;
        if (s.showMarketCipher !== undefined) this.showMarketCipher = s.showMarketCipher;
        if (s.showDivergences !== undefined) this.showDivergences = s.showDivergences;
        if (s.boxMode !== undefined) this.boxMode = s.boxMode;
        if (s.keyZoneLayers) {
          this.keyZoneLayers = { ...DEFAULT_KEY_ZONE_LAYERS, ...s.keyZoneLayers };
        }
        if (s.capitalFlowTiers) this.interaction.setCapitalFlowFilter(s.capitalFlowTiers);
        this.restoreAuxPanelSettings(s);
      });
  }

  // ------------------------------------------------------------------
  // Chart State persistence (drawings, backend)
  // ------------------------------------------------------------------

  /** Persist current drawings to the backend (fire-and-forget). */
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
      // Still sent for API compatibility; selections are restored from the device.
      settings: this.buildSettingsSnapshot(),
    };
    this.marketService
      .saveChartState(state)
      .pipe(take(1))
      .subscribe({ error: (e) => console.warn('[ChartState] save error', e) });
  }

  /**
   * Load persisted chart state for the current symbol + timeframe and restore
   * its drawings. Settings stored in it are ignored: the settings-panel
   * selections live on this device (see restoreDeviceChartSettings).
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
            // No saved state: clear drawings so previous symbol drawings are not carried over.
            this.drawingTools.setDrawings(Array.isArray(state?.drawings) ? state.drawings : []);
          } finally {
            this._restoringChartState = false;
          }
          this.cdr.markForCheck();
        },
        error: (e) => console.warn('[ChartState] load error', e),
      });
  }
}

