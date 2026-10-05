/* Interaction logic extracted from ChartComponent.
   Handles touch, mouse, wheel gestures and scale adjustments.
   The component injects this service and forwards events.
*/
 
import { Injectable, OnDestroy, Signal, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { BehaviorSubject, EMPTY, Observable, Subscription, distinctUntilChanged, map, skip } from 'rxjs';
import { settingsFeature } from 'src/app/store/settings/settings.reducer';
import { ChartLayoutService } from './chart-layout.service';
import { ChartPerformanceService } from './chart-performance.service';
import { ChartLinkedScaleService } from './chart-linked-scale.service';
import { crosshairPixelX } from './chart-plugins';
import {
  averageCandleGap,
  clampBarSpacing,
  DEFAULT_BAR_SPACING,
  Y_AUTO_MARGIN_BOTTOM,
  Y_AUTO_MARGIN_TOP,
  LIVE_FOLLOW_THRESHOLD_BARS,
  sanitizeBarSpacing,
  TIME_AXIS_SCALE_SENSITIVITY,
  PRICE_AXIS_SCALE_SENSITIVITY,
  MIN_PRICE_RANGE_EPSILON_REL,
  MIN_PRICE_RANGE_EPSILON_ABS,
  MAX_PRICE_ZOOM_OUT,
  TimeScale,
  WHEEL_LINE_PX,
  WHEEL_MAX_DELTA_PX,
  WHEEL_PINCH_FACTOR,
  WHEEL_PINCH_MAX_DELTA,
  WHEEL_ZOOM_SENSITIVITY,
} from '../scales/time-scale';

export type GestureKind = 'pan' | 'zoom-x' | 'zoom-y' | 'pinch' | null;

/**
 * Realtime viewport following. 'following': a new bar shifts the view by exactly the appended bars
 * (right offset in bars, spacing and Y kept). 'detached': new bars only join the dataset.
 * Detached by a pan away from the live edge; back to 'following' by panning back, goToRealtime,
 * the default view and every selection (exchange / symbol / timeframe) change.
 */
export type LiveFollowState = 'following' | 'detached';

export interface CandleLike { x: number; h?: number; l?: number; }

interface ChartTicksLike {
  stepSize?: number;
  autoSkip?: boolean;
  maxTicksLimit?: number;
  autoSkipPadding?: number;
}

interface ChartScaleOptionsLike {
  min?: number;
  max?: number;
  ticks?: ChartTicksLike;
}

interface ChartScaleLike {
  min: number;
  max: number;
  options: ChartScaleOptionsLike;
  getPixelForValue?(value: number): number;
  getValueForPixel?(pixel: number): number;
}

interface ChartDatasetLike {
  type?: string;
  data?: Array<CandleLike & { y?: number; Price?: number }>;
  isOrder?: boolean;
  barPercentage?: number;
  categoryPercentage?: number;
  maxBarThickness?: number;
  [key: string]: unknown;
}

/** Pane the crosshair pointer is physically in: the main chart or a linked panel. */
export type CrosshairSource = 'main' | 'pane';

interface ChartRefLike {
  canvas: { getBoundingClientRect(): DOMRect };
  chartArea?: { left: number; right: number; top: number; bottom: number };
  scales: { x: ChartScaleLike; y: ChartScaleLike; indicator?: ChartScaleLike; [key: string]: ChartScaleLike | undefined };
  data: { datasets: ChartDatasetLike[] };
  config?: { options?: { scales?: Record<string, ChartScaleOptionsLike> } };
  width: number;
  height: number;
  update(mode?: string): void;
  draw(): void;
  _isInteracting?: boolean;
  _crosshairX?: number | null;
  _crosshairY?: number | null;
  /** Shared (snapped) crosshair time: every pane maps it through its own x scale. */
  _crosshairTime?: number | null;
}

/**
 * Price range after dragging the price axis by `dy` px (positive = down) from the press state:
 * span = startSpan * exp(dy * PRICE_AXIS_SCALE_SENSITIVITY) (drag up zooms in, down zooms out), clamped to a
 * valid span, with `anchorPrice` kept at `anchorFraction` down the plot (priceToY(anchor) unchanged).
 * Pure function of the start state and the total dy; always finite with max > min.
 */
export function solveAnchoredPriceRange(
  start: { startMin: number; startMax: number; anchorPrice: number; anchorFraction: number },
  dy: number,
): { min: number; max: number } {
  const startSpan = start.startMax - start.startMin;
  const minSpan = Math.min(
    startSpan,
    Math.max(MIN_PRICE_RANGE_EPSILON_ABS, MIN_PRICE_RANGE_EPSILON_REL * Math.abs(start.anchorPrice)),
  );
  const maxSpan = Math.min(startSpan * MAX_PRICE_ZOOM_OUT, Number.MAX_VALUE / 4);
  const raw = startSpan * Math.exp(dy * PRICE_AXIS_SCALE_SENSITIVITY);
  const span = Number.isFinite(raw) ? Math.min(maxSpan, Math.max(minSpan, raw)) : dy > 0 ? maxSpan : minSpan;
  if (span === startSpan) return { min: start.startMin, max: start.startMax };
  return {
    min: start.anchorPrice - (1 - start.anchorFraction) * span,
    max: start.anchorPrice + start.anchorFraction * span,
  };
}

@Injectable({ providedIn: 'root' })
export class ChartInteractionService implements OnDestroy {
  readonly MIN_CANDLES_VISIBLE = 10;
  /** Candle spacing (px) of the default view, like TradingView's initial zoom. */
  readonly DEFAULT_BAR_SPACING_PX = DEFAULT_BAR_SPACING;
  /** Empty bars after the current candle in the default view. */
  readonly RIGHT_PADDING_BARS = 3;
  readonly PAN_SENSITIVITY = 1.0;

  /** Optional so the service also works without a store (unit tests); then the defaults apply. */
  private readonly store = inject(Store, { optional: true });
  private readonly storeSubscription = new Subscription();
  /** Detach threshold (bars) from the settings store; LIVE_FOLLOW_THRESHOLD_BARS by default. */
  private liveFollowThresholdBars = LIVE_FOLLOW_THRESHOLD_BARS;

  /**
   * Global realtime-follow commands (settings store `setAllChartsLiveFollow`): emits `enabled` for
   * every command dispatched after the subscription (never the state present at subscribe time).
   * Cold and per subscriber, so several charts could each subscribe and react; today the one active
   * chart page (ChartBaseComponent) does.
   */
  readonly liveFollowRequests$: Observable<boolean> = this.store
    ? this.store.select(settingsFeature.selectAllChartsLiveFollow).pipe(
      distinctUntilChanged((a, b) => a?.requestId === b?.requestId),
      skip(1),
      map((request) => !!request?.enabled),
    )
    : EMPTY;

  constructor(
    private layoutService: ChartLayoutService,
    private performance: ChartPerformanceService,
    private linkedScale: ChartLinkedScaleService,
  ) {
    // A container resize must not move the time range past the pan limits.
    this.linkedScale.xRangeLimits = () => this.extendedDataRange;
    if (this.store) {
      this.storeSubscription.add(
        this.store.select(settingsFeature.selectLiveFollowThresholdBars).subscribe((bars) => {
          this.liveFollowThresholdBars = Number.isFinite(bars) && bars >= 0 ? bars : LIVE_FOLLOW_THRESHOLD_BARS;
        }),
      );
    }
  }

  // runtime interaction state
  isInteracting = false;
  gestureType: GestureKind = null;
  touchStart: { x: number; y: number; time: number } | null = null;
  mouseStart: { x: number; y: number; time: number } | null = null;

  // Crosshair state: persisted = crosshair is frozen on screen after release
  private crosshairPersisted = false;
  /** Pointer position of the shown crosshair: `pointerTime` is precise, `snappedTime` the nearest candle (what is drawn). */
  private crosshairPointerTime: number | null = null;
  private crosshairSnappedTime: number | null = null;
  private crosshairSource: CrosshairSource | null = null;
  /** The mouse left the chart while a gesture still captured it: hide the crosshair when that gesture ends. */
  private crosshairLeftDuringGesture = false;
  // Long-press timer to activate crosshair (only way to show it)
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressChartRef: ChartRefLike | null = null;
  private crosshairDrawChart: ChartRefLike | null = null;
  // Original start position (mouseStart gets mutated during drag)
  private mouseStartOrigin: { x: number; y: number } | null = null;
  lastTouches: TouchList | null = null;
  fullDataRange: { min: number; max: number } = { min: 0, max: 0 };
  extendedDataRange: { min: number; max: number } = { min: 0, max: 0 };
  initialYRange: { min: number; max: number } = { min: 0, max: 0 };
  /**
   * TradingView auto scale: false once the user scales the price axis by hand,
   * so time zoom no longer re-fits y. Double-click / reset / new data restores it.
   */
  yAutoScale = true;
  /**
   * Price-axis drag in progress (manual y scale): the range is always solved from this start
   * state and the TOTAL dy, so the price under the press point stays under it.
   */
  private priceAxisDrag: {
    chartRef: ChartRefLike;
    startClientY: number;
    /** Pointer y of the previous update (an identical repeat is skipped). */
    lastClientY: number;
    /** Rendered y range at the press. */
    startMin: number;
    startMax: number;
    anchorPrice: number;
    /** Press position down the plot, 0 = top edge, 1 = bottom edge. */
    anchorFraction: number;
    documentCapture: boolean;
  } | null = null;

  /**
   * Time-axis drag in progress: everything is computed from this start state
   * (never incrementally), so the time under the press position stays put.
   */
  private timeAxisDrag: {
    chartRef: ChartRefLike;
    startClientX: number;
    startBarSpacing: number;
    /** Visible time span at the press (reference for the span at any spacing). */
    startSpan: number;
    anchorTime: number;
    /** Anchor position across the plot, 0 = left edge, 1 = right edge. */
    anchorFraction: number;
    documentCapture: boolean;
  } | null = null;
  /**
   * Pan in progress: the x range is always computed from this start state and the TOTAL
   * pointer dx (never incrementally), so equal dx gives an equal range whatever the moves in between.
   */
  private pan: {
    chartRef: ChartRefLike;
    startClientX: number;
    /** Pointer x of the previous update (an identical repeat is skipped). */
    lastClientX: number;
    /** Visible time range at the press. */
    startMin: number;
    startMax: number;
    /** Plot width the dx is measured against. */
    plotWidth: number;
    /** Previous pointer y (the vertical drag pan stays incremental), null for pans without y. */
    lastClientY: number | null;
    documentCapture: boolean;
  } | null = null;
  /** Realtime-follow state as a signal: templates reading it update even when it changes outside the zone (live path). */
  private readonly liveFollow = signal<LiveFollowState>('following');
  /** Read-only live-follow state for templates (e.g. the "Return to live" control). */
  readonly liveFollowStateSignal: Signal<LiveFollowState> = this.liveFollow.asReadonly();
  /** Pinch in progress, computed from this start state (never incrementally). */
  private pinch: { chartRef: ChartRefLike; startDistance: number; startBarSpacing: number; startSpan: number; anchorTime: number } | null = null;
  /** Fired after a time-axis drag ended on a document-level release (outside the chart). */
  onTimeAxisScaleEnd?: (chartRef: ChartRefLike) => void;
  /** Fired after a mouse pan or price-axis drag ended on a document-level release (outside the chart). */
  onPanEnd?: (chartRef: ChartRefLike) => void;

  // performance/throttling state
  private interactionUpdateScheduled = false;
  private lastInteractionUpdateAt = 0;
  private lastVisibleCount = 0;
  private interactionFrameCounter = 0;
  private lastXRange: { min: number; max: number } | null = null;

  // Optional hook for components to react after interaction updates (pan/zoom)
  onAfterInteractionUpdate?: (chartRef: ChartRefLike) => void;
  /** Fired immediately when pan/zoom mutates xScale.options.min/max (before throttled update). */
  onLinkedPanelXRangeChanged?: (chartRef: ChartRefLike) => void;
  /**
   * Linked panel crosshair (TradingView panes): receives the snapped crosshair
   * time (the one shared X of every pane), the pointer's clientY and the pane the
   * pointer is physically in ('main' or 'pane'), or nulls when the crosshair is
   * hidden. The panel shows its horizontal line / value label only for 'pane'.
   * While set, the crosshair also shows (vertical line only) when the pointer
   * is above/below the plot, so it can be dragged across into the panel.
   */
  onCrosshairChanged?: (time: number | null, clientY: number | null, source?: CrosshairSource) => void;
  /** Desktop: the crosshair follows the mouse (TradingView) instead of needing a long-press. */
  hoverCrosshair = false;

  // Capital Flow Signal filter state
  readonly capitalFlowFilter$ = new BehaviorSubject<{
    bronze: boolean;
    silver: boolean;
    gold: boolean;
    platinum: boolean;
  }>({ bronze: true, silver: true, gold: true, platinum: true });

  get capitalFlowFilter(): {
    bronze: boolean;
    silver: boolean;
    gold: boolean;
    platinum: boolean;
  } {
    return this.capitalFlowFilter$.value;
  }

  setCapitalFlowFilter(patch: Partial<{
    bronze: boolean;
    silver: boolean;
    gold: boolean;
    platinum: boolean;
  }>): void {
    const curr = this.capitalFlowFilter$.value;
    this.capitalFlowFilter$.next({ ...curr, ...patch });
  }

  /** The chart page's authoritative time scale (shared with the linked panes). */
  get timeScale(): TimeScale {
    return this.linkedScale.timeScale;
  }

  setRanges(full: { min: number; max: number }, extended: { min: number; max: number }, initialY: { min: number; max: number }): void {
    this.fullDataRange = full;
    this.extendedDataRange = extended;
    this.initialYRange = initialY;
  }

  // Touch handlers
  onTouchStart(event: TouchEvent, chartRef: ChartRefLike): void {
    event.preventDefault();

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      this.gestureType = null;

      // If crosshair is persisted, don't start pan/zoom — only move crosshair or dismiss
      if (this.crosshairPersisted) return;

      // Start long-press timer: if user holds 300ms without moving, activate crosshair
      this.cancelLongPress();
      this.longPressChartRef = chartRef;
      this.longPressTimer = setTimeout(() => {
        if (!this.touchStart || this.gestureType) return;
        const ref = this.longPressChartRef;
        if (!ref) return;
        if (this.setCrosshair(ref, this.touchStart.x, this.touchStart.y, true)) {
          this.crosshairPersisted = true;
          this.isInteracting = false;
          ref._isInteracting = false;
          this.gestureType = null;
        }
      }, 300);
    } else if (event.touches.length === 2) {
      this.cancelLongPress();
      // Block pinch zoom while crosshair is active
      if (this.crosshairPersisted) return;
      // Pinch has priority over pan / axis scaling / crosshair: one gesture at a time.
      if (!this.touchStart) this.touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: Date.now() };
      this.lastTouches = event.touches;
      this.gestureType = 'pinch';
      this.beginPinch(chartRef, this.getTouchDistance(event.touches), this.touchCenterPlotX(event.touches, chartRef));
    }

    this.isInteracting = true;
    if (chartRef) chartRef._isInteracting = true;
  }

  onTouchMove(event: TouchEvent, chartRef: ChartRefLike): void {
    event.preventDefault();
    if (!chartRef || !this.touchStart) return;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.touchStart.x;
      const deltaY = touch.clientY - this.touchStart.y;

      // If crosshair is active, only move crosshair — no pan/zoom
      if (this.crosshairPersisted) {
        this.cancelLongPress();
        this.setCrosshair(chartRef, touch.clientX, touch.clientY);
        return;
      }

      if (!this.gestureType && this.isTouchInAxisArea(this.touchStart, chartRef)) {
        this.cancelLongPress();
        const absX = Math.abs(deltaX); const absY = Math.abs(deltaY);
        if (absX > 15 || absY > 15) {
          this.gestureType = absX > absY ? 'zoom-x' : 'zoom-y';
          if (this.gestureType === 'zoom-x' && this.axisAt(chartRef, this.touchStart.x, this.touchStart.y) === 'x') {
            // Rebase dx at the threshold (no jump) but keep the anchor at the original press.
            const area = chartRef.chartArea;
            const pressPlotX = area ? this.touchStart.x - chartRef.canvas.getBoundingClientRect().left - area.left : undefined;
            this.beginTimeAxisScale(chartRef, touch.clientX, pressPlotX);
          }
        }
      } else if (!this.gestureType && !this.isTouchInAxisArea(this.touchStart, chartRef)) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          this.cancelLongPress();
          this.gestureType = 'pan';
          this.beginPan(chartRef, this.touchStart.x, this.touchStart.y);
        }
      }

      if (this.gestureType === 'zoom-x') {
        // Swipe right stretches the candles (zoom in), left compresses them, same as the mouse drag.
        if (this.timeAxisDrag) {
          this.updateTimeAxisScale(touch.clientX, chartRef);
        } else {
          // Horizontal swipe from the price axis keeps the step-wise zoom.
          this.handleHorizontalZoomSwipe(-deltaX, chartRef);
          this.touchStart.x = touch.clientX;
        }
      } else if (this.gestureType === 'zoom-y') {
        this.handleVerticalZoomSwipe(deltaY, chartRef);
        this.touchStart.y = touch.clientY;
      } else if (this.gestureType === 'pan') {
        this.updatePan(touch.clientX, touch.clientY, chartRef);
        this.touchStart.x = touch.clientX;
        this.touchStart.y = touch.clientY;
      }
    } else if (event.touches.length === 2 && this.lastTouches && this.gestureType === 'pinch') {
      this.updatePinch(this.getTouchDistance(event.touches), this.touchCenterPlotX(event.touches, chartRef), chartRef);
    }
  }

  /** Returns the start position when the touch was a short tap (no pan/zoom), else null. */
  onTouchEnd(event: TouchEvent, chartRef: ChartRefLike): { x: number; y: number } | null {
    this.cancelLongPress();
    this.clearTimeAxisDrag();
    this.clearPan();
    this.clearPriceAxisDrag();
    // One finger of a pinch lifted: the remaining finger continues as a fresh pan start (no shift, never a tap).
    const remaining = event?.touches;
    if (this.gestureType === 'pinch' && remaining?.length === 1) {
      this.pinch = null;
      this.gestureType = null;
      this.lastTouches = null;
      this.touchStart = { x: remaining[0].clientX, y: remaining[0].clientY, time: 0 };
      return null;
    }
    this.pinch = null;
    const wasStart = this.touchStart;
    const elapsed = wasStart ? Date.now() - wasStart.time : 9999;
    this.isInteracting = false;
    const wasGesture = this.gestureType;
    this.gestureType = null;
    this.touchStart = null;
    this.lastTouches = null;
    if (chartRef) {
      chartRef._isInteracting = false;

      // Short tap = dismiss crosshair
      const isTap = elapsed < 300 && !wasGesture;
      if (isTap && this.crosshairPersisted) this.hideCrosshair(chartRef);
      // Crosshair persists from long-press; pan/zoom never creates one

      chartRef.update('none');
      this.updateCandleWidth(chartRef);
    }
    return wasStart && elapsed < 300 && !wasGesture ? { x: wasStart.x, y: wasStart.y } : null;
  }

  // Mouse handlers
  onMouseDown(event: MouseEvent, chartRef: ChartRefLike): void {
    if (event.button === 0) {
      // A drag whose release was lost (iframe / native dialog) must not keep running beside this one.
      this.clearTimeAxisDrag();
      this.clearPan();
      this.clearPriceAxisDrag();
      this.mouseStart = { x: event.clientX, y: event.clientY, time: Date.now() };
      this.mouseStartOrigin = { x: event.clientX, y: event.clientY };

      // If crosshair is persisted, don't start panning — only track for crosshair move or dismiss
      if (this.crosshairPersisted) {
        // Show crosshair at click position immediately
        if (chartRef) this.setCrosshair(chartRef, event.clientX, event.clientY);
        return;
      }

      this.isInteracting = true;
      // TradingView: drag the price axis = scale y, drag the time axis = zoom x, elsewhere = pan
      const axis = chartRef ? this.axisAt(chartRef, event.clientX, event.clientY) : null;
      if (axis === 'y') {
        this.gestureType = 'zoom-y';
        this.beginPriceAxisScale(chartRef, event.clientY, true);
      } else {
        this.gestureType = axis === 'x' ? 'zoom-x' : 'pan';
        if (axis === 'x') this.beginTimeAxisScale(chartRef, event.clientX, undefined, true);
        else if (chartRef) this.beginPan(chartRef, event.clientX, event.clientY, true);
      }
      if (chartRef) chartRef._isInteracting = true;
      // No crosshair on pan — only long-press activates it
    }
  }

  onMouseMove(event: MouseEvent, chartRef: ChartRefLike): void {
    if (!chartRef) return;

    // If crosshair is persisted, move crosshair instead of panning
    if (this.crosshairPersisted && this.mouseStart) {
      this.setCrosshair(chartRef, event.clientX, event.clientY);
      return;
    }
    
    // If actively panning, pan (the hover crosshair stays under the mouse)
    if (this.mouseStart && this.gestureType === 'pan') {
      // (a move also reaches the document listener while it captures; updatePan skips the repeat)
      this.updatePan(event.clientX, event.clientY, chartRef);
      this.mouseStart.x = event.clientX;
      this.mouseStart.y = event.clientY;
    } else if (this.mouseStart && this.gestureType === 'zoom-y' && this.priceAxisDrag) {
      // (a move also reaches the document listener while it captures; an identical repeat is skipped)
      this.updatePriceAxisScale(event.clientY, chartRef);
      return;
    } else if (this.mouseStart && this.gestureType === 'zoom-x') {
      // Drag right stretches the candles (zoom in), left compresses them, like TradingView's time axis.
      if (this.timeAxisDrag) {
        // With document capture the document listener already scales (avoid doing it twice per move).
        if (!this.timeAxisDrag.documentCapture) this.updateTimeAxisScale(event.clientX, chartRef);
      } else {
        this.handleHorizontalZoomSwipe(this.mouseStart.x - event.clientX, chartRef);
        this.mouseStart.x = event.clientX;
      }
      return;
    }
    if (this.hoverCrosshair && !this.crosshairPersisted) {
      this.setCrosshair(chartRef, event.clientX, event.clientY, false, true);
    }
  }

  onMouseUp(event: MouseEvent, chartRef: ChartRefLike): void {
    const wasStart = this.mouseStart;
    const elapsed = wasStart ? Date.now() - wasStart.time : 9999;
    const origin = this.mouseStartOrigin;
    this.clearTimeAxisDrag();
    this.clearPan();
    this.clearPriceAxisDrag();
    const movedDist = origin
      ? Math.hypot(event.clientX - origin.x, event.clientY - origin.y)
      : 999;
    this.isInteracting = false;
    this.gestureType = null;
    this.mouseStart = null;
    this.mouseStartOrigin = null;
    if (chartRef) {
      chartRef._isInteracting = false;

      // Short click = dismiss crosshair
      const isClick = elapsed < 300 && movedDist < 5;
      if (isClick && this.crosshairPersisted) this.hideCrosshair(chartRef);
      // Pan never creates crosshair

      chartRef.update('none');
      this.updateCandleWidth(chartRef);
      this.finishGestureCrosshair(chartRef);
    }
  }

  // ── Time-axis drag scaling (TradingView): anchored bar-spacing scale ──

  /**
   * Start scaling the time axis at `clientX` (press position). The time drawn under it
   * stays under it for the whole drag. `plotX` is the press position across the plot
   * (px from its left edge) when the press happened on a linked pane; default: from
   * `chartRef`. `captureDocument` follows the mouse outside the chart until release.
   * Returns false (nothing started) while the TimeScale is not ready.
   */
  beginTimeAxisScale(chartRef: ChartRefLike, clientX: number, plotX?: number, captureDocument = false): boolean {
    this.clearTimeAxisDrag();
    const area = chartRef?.chartArea;
    if (!chartRef || !area || !Number.isFinite(clientX) || !this.linkedScale.syncTimeScale(chartRef as any)) return false;
    const ts = this.timeScale;
    const px = plotX ?? clientX - chartRef.canvas.getBoundingClientRect().left - area.left;
    if (!Number.isFinite(px) || !(ts.plotWidth > 0)) return false;
    const fraction = Math.min(1, Math.max(0, px / ts.plotWidth));
    const visible = ts.visibleTimeRange();
    const anchorTime = ts.projectedXToTime(ts.plotLeft + fraction * ts.plotWidth);
    if (!visible || !Number.isFinite(anchorTime)) return false;
    this.timeAxisDrag = {
      chartRef,
      startClientX: clientX,
      startBarSpacing: clampBarSpacing(ts.barSpacingPx),
      startSpan: visible.max - visible.min,
      anchorTime,
      anchorFraction: fraction,
      documentCapture: captureDocument,
    };
    this.gestureType = 'zoom-x';
    this.isInteracting = true;
    chartRef._isInteracting = true;
    this.suspendCrosshair(chartRef);
    if (captureDocument && typeof document !== 'undefined') {
      document.addEventListener('mousemove', this.onDocumentMouseMove);
      document.addEventListener('mouseup', this.onDocumentMouseUp);
      window.addEventListener('blur', this.onDocumentMouseUp);
    }
    return true;
  }

  /** True while a time-axis drag is in progress. */
  get isTimeAxisScaling(): boolean {
    return this.timeAxisDrag !== null;
  }

  /** Scale to the pointer at `clientX`, from the state at the press (total dx, not per event). */
  updateTimeAxisScale(clientX: number, chartRef?: ChartRefLike): void {
    const drag = this.timeAxisDrag;
    if (!drag || !Number.isFinite(clientX)) return;
    const ref = chartRef ?? drag.chartRef;
    if (!this.linkedScale.syncTimeScale(ref as any)) return;
    const dx = clientX - drag.startClientX;
    const range = this.solveAnchoredRange(ref, drag.anchorTime, drag.anchorFraction,
      drag.startBarSpacing * Math.exp(dx * TIME_AXIS_SCALE_SENSITIVITY), drag.startSpan, drag.startBarSpacing);
    if (range) this.commitAnchoredRange(ref, range);
  }

  /** Finish the time-axis drag: the scale stays as dragged. */
  endTimeAxisScale(chartRef?: ChartRefLike): void {
    const drag = this.timeAxisDrag;
    this.clearTimeAxisDrag();
    if (!drag) return;
    const ref = chartRef ?? drag.chartRef;
    this.isInteracting = false;
    if (this.gestureType === 'zoom-x') this.gestureType = null;
    this.mouseStart = null;
    this.mouseStartOrigin = null;
    ref._isInteracting = false;
    // The chart may already be destroyed (ng2-charts tears it down first): state cleanup above must always run.
    if (!ref.canvas) return;
    try {
      ref.update('none');
      this.updateCandleWidth(ref);
    } catch {}
    this.finishGestureCrosshair(ref);
  }

  ngOnDestroy(): void {
    this.storeSubscription.unsubscribe();
    this.clearTimeAxisDrag();
    this.clearPan();
    this.clearPriceAxisDrag();
  }

  private readonly onDocumentMouseMove = (event: MouseEvent): void => {
    this.updateTimeAxisScale(event.clientX);
  };

  private readonly onDocumentMouseUp = (): void => {
    const ref = this.timeAxisDrag?.chartRef;
    this.endTimeAxisScale();
    if (ref) this.onTimeAxisScaleEnd?.(ref);
  };

  private clearTimeAxisDrag(): void {
    this.timeAxisDrag = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this.onDocumentMouseMove);
      document.removeEventListener('mouseup', this.onDocumentMouseUp);
    }
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onDocumentMouseUp);
  }

  // ── Price-axis drag scaling (TradingView): anchored manual y scale ──

  /**
   * Start scaling the price axis at `clientY` (press position): leaves auto scale (manual y).
   * The price drawn under the press stays under it for the whole drag. `captureDocument`
   * follows the mouse outside the chart until release / window blur. False = nothing started.
   */
  beginPriceAxisScale(chartRef: ChartRefLike, clientY: number, captureDocument = false): boolean {
    this.clearPriceAxisDrag();
    const area = chartRef?.chartArea;
    const yScale = chartRef?.scales?.y;
    if (!area || !yScale || !chartRef.canvas || !Number.isFinite(clientY)) return false;
    const height = area.bottom - area.top;
    const min = Number.isFinite(yScale.min) ? yScale.min : yScale.options?.min;
    const max = Number.isFinite(yScale.max) ? yScale.max : yScale.options?.max;
    if (!(height > 0) || typeof min !== 'number' || typeof max !== 'number' || !Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return false;
    const pressY = clientY - chartRef.canvas.getBoundingClientRect().top - area.top;
    const fraction = Math.min(1, Math.max(0, pressY / height));
    // y is linear: the top edge is max, the bottom edge min.
    this.priceAxisDrag = {
      chartRef,
      startClientY: clientY,
      lastClientY: clientY,
      startMin: min,
      startMax: max,
      anchorPrice: max - fraction * (max - min),
      anchorFraction: fraction,
      documentCapture: captureDocument,
    };
    this.gestureType = 'zoom-y';
    this.isInteracting = true;
    chartRef._isInteracting = true;
    this.suspendCrosshair(chartRef);
    if (captureDocument && typeof document !== 'undefined') {
      document.addEventListener('mousemove', this.onDocumentPriceMove);
      document.addEventListener('mouseup', this.onDocumentPriceUp);
      window.addEventListener('blur', this.onDocumentPriceUp);
    }
    return true;
  }

  /** Scale to the pointer at `clientY`, from the state at the press (total dy, not per event). */
  updatePriceAxisScale(clientY: number, chartRef?: ChartRefLike): void {
    const drag = this.priceAxisDrag;
    if (!drag || !Number.isFinite(clientY) || clientY === drag.lastClientY) return;
    const ref = chartRef ?? drag.chartRef;
    const yScale = ref.scales?.y;
    if (!yScale) return;
    drag.lastClientY = clientY;
    this.yAutoScale = false; // a click without movement keeps auto scale
    const range = solveAnchoredPriceRange(drag, clientY - drag.startClientY);
    yScale.options.min = range.min;
    yScale.options.max = range.max;
    this.syncIndicatorAxis(ref);
    this.scheduleInteractionUpdate(ref);
  }

  /** True while a price-axis drag is in progress. */
  get isPriceAxisScaling(): boolean {
    return this.priceAxisDrag !== null;
  }

  private readonly onDocumentPriceMove = (event: MouseEvent): void => {
    this.updatePriceAxisScale(event.clientY);
  };

  /** Release (or window blur) anywhere ends the price-axis drag like a mouse up on the chart. */
  private readonly onDocumentPriceUp = (): void => {
    const ref = this.priceAxisDrag?.chartRef;
    this.clearPriceAxisDrag();
    if (!ref) return;
    this.isInteracting = false;
    if (this.gestureType === 'zoom-y') this.gestureType = null;
    this.mouseStart = null;
    this.mouseStartOrigin = null;
    ref._isInteracting = false;
    // The chart may already be destroyed: state cleanup above must always run.
    if (!ref.canvas) return;
    try {
      ref.update('none');
      this.updateCandleWidth(ref);
    } catch {}
    this.finishGestureCrosshair(ref);
    this.onPanEnd?.(ref);
  };

  private clearPriceAxisDrag(): void {
    this.priceAxisDrag = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this.onDocumentPriceMove);
      document.removeEventListener('mouseup', this.onDocumentPriceUp);
    }
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onDocumentPriceUp);
  }

  onMouseLeave(chartRef: ChartRefLike): void {
    if (this.crosshairPersisted) return;
    // A gesture still captures the mouse (document listeners): it continues untouched; the crosshair goes when it ends.
    if (this.isInteracting) {
      this.crosshairLeftDuringGesture = true;
      return;
    }
    if (chartRef) this.hideCrosshair(chartRef);
  }

  /** A gesture ended: a crosshair left behind by a pointer that exited the chart meanwhile goes now. */
  private finishGestureCrosshair(chartRef: ChartRefLike | null | undefined): void {
    if (!this.crosshairLeftDuringGesture) return;
    this.crosshairLeftDuringGesture = false;
    // (the chart may already be destroyed)
    if (!this.crosshairPersisted) try { this.hideCrosshair(chartRef); } catch {}
  }

  /** Axis scaling and pinch own the plot: no hover crosshair (it would sit at a stale position while the scale moves). */
  private get crosshairSuspended(): boolean {
    const g = this.gestureType;
    return g === 'zoom-x' || g === 'zoom-y' || g === 'pinch';
  }

  private suspendCrosshair(chartRef: ChartRefLike): void {
    if (!this.crosshairPersisted) this.hideCrosshair(chartRef);
  }

  /**
   * Show the crosshair at a viewport position, e.g. from a linked panel.
   * Returns false when the position is outside the plot's time range.
   */
  showCrosshairAt(chartRef: ChartRefLike, clientX: number, clientY: number): boolean {
    return this.setCrosshair(chartRef, clientX, clientY, false, true);
  }

  /**
   * Show the crosshair for a pointer in a linked pane (`paneRef`, e.g. the MCB chart) on `chartRef` (the main
   * chart). The time under the pointer comes from the pane's OWN x scale, never from main-canvas pixels, so
   * panes whose plots are offset from each other still agree on one time. Main gets the vertical line only.
   */
  showCrosshairFromPane(chartRef: ChartRefLike, paneRef: ChartRefLike, clientX: number, clientY: number): boolean {
    return this.setCrosshair(chartRef, clientX, clientY, false, true, paneRef);
  }

  /** Hide the crosshair (also a pinned touch crosshair) here and in linked panels. */
  hideCrosshair(chartRef: ChartRefLike | null | undefined): void {
    this.crosshairPersisted = false;
    this.crosshairPointerTime = null;
    this.crosshairSnappedTime = null;
    this.crosshairSource = null;
    this.crosshairLeftDuringGesture = false;
    if (chartRef && (chartRef._crosshairX != null || chartRef._crosshairY != null || chartRef._crosshairTime != null)) {
      chartRef._crosshairX = null;
      chartRef._crosshairY = null;
      chartRef._crosshairTime = null;
      chartRef.draw();
    }
    this.onCrosshairChanged?.(null, null);
  }

  /** The shown crosshair: precise pointer time, snapped (drawn) time and the pane the pointer is in; null when hidden. */
  get crosshairState(): { pointerTime: number | null; snappedTime: number | null; source: CrosshairSource } | null {
    return this.crosshairSource
      ? { pointerTime: this.crosshairPointerTime, snappedTime: this.crosshairSnappedTime, source: this.crosshairSource }
      : null;
  }

  /** True while a touch long-press crosshair is pinned (pan/zoom are blocked). */
  get isCrosshairPinned(): boolean {
    return this.crosshairPersisted;
  }

  /** Pin the touch crosshair after a long-press in a linked panel. */
  pinCrosshair(): void {
    this.crosshairPersisted = true;
  }

  // ── Pan driven from a linked panel (x only; the panel shares this chart's time axis) ──

  /** Start a pan at the pane pointer's `clientX` (only dx matters, so the pane's offset cancels out). */
  beginLinkedPan(chartRef: ChartRefLike, clientX: number): void {
    if (!chartRef || this.crosshairPersisted) return;
    this.isInteracting = true;
    this.gestureType = 'pan';
    chartRef._isInteracting = true;
    this.beginPan(chartRef, clientX);
  }

  /** Pan to the pane pointer's `clientX`, from the state at `beginLinkedPan` (total dx, not per event). */
  linkedPanTo(clientX: number, chartRef: ChartRefLike): void {
    if (!chartRef || this.gestureType !== 'pan') return;
    this.updatePan(clientX, null, chartRef);
  }

  endLinkedPan(chartRef: ChartRefLike): void {
    if (this.gestureType !== 'pan') return;
    this.clearPan();
    this.isInteracting = false;
    this.gestureType = null;
    if (!chartRef) return;
    chartRef._isInteracting = false;
    chartRef.update('none');
    this.updateCandleWidth(chartRef);
    this.finishGestureCrosshair(chartRef);
  }

  /**
   * Wheel zoom of the time axis around the pointer (TradingView): the time under the
   * pointer stays under it. `paneCursorX` is set when the wheel happened over a linked
   * panel (never the price axis): the pointer's x across that pane's plot (px from its
   * left edge), `null` when unknown. Without it the pointer is read from `chartRef`.
   * Only the pointer's x matters for the time anchor.
   */
  onWheel(event: WheelEvent, chartRef: ChartRefLike, paneCursorX?: number | null): void {
    event.preventDefault();
    event.stopPropagation?.();
    if (!chartRef) return;
    // Block zoom while crosshair is active
    if (this.crosshairPersisted) return;
    // Wheel over the price axis scales y (like the MCB panel's axis)
    if (paneCursorX === undefined && this.axisAt(chartRef, event.clientX, event.clientY) === 'y') {
      const y = chartRef.scales.y;
      if (y) this.setYRangeAroundCenter({ min: y.min, max: y.max }, event.deltaY > 0 ? 1.1 : 1 / 1.1, chartRef);
      return;
    }
    const area = chartRef.chartArea;
    const plotX = paneCursorX !== undefined
      ? paneCursorX
      : this.plotXAtClientX(chartRef, event.clientX);
    if (plotX == null || !Number.isFinite(plotX) || !area) return;
    const factor = this.wheelSpacingFactor(event, Math.max(0, area.bottom - area.top));
    if (factor !== 1) this.zoomTimeAtCursor(chartRef, plotX, factor);
  }

  /** Pointer x across the plot (px from its left edge), NaN without a plot. */
  plotXAtClientX(chartRef: Pick<ChartRefLike, 'canvas' | 'chartArea'> | null | undefined, clientX: number): number {
    const area = chartRef?.chartArea;
    if (!area || !chartRef?.canvas) return NaN;
    return clientX - chartRef.canvas.getBoundingClientRect().left - area.left;
  }

  /**
   * Multiplier for the bar spacing from a wheel event (> 1 = zoom in): the delta is
   * normalized to CSS px (`deltaMode`), clamped per event, and ctrl+wheel (a trackpad
   * pinch) gets its own scale. 1 for a missing or zero delta.
   */
  private wheelSpacingFactor(event: WheelEvent, plotHeight: number): number {
    // deltaMode first: Firefox reports pixel deltas when deltaY is read before it.
    const mode = event.deltaMode;
    let delta = event.deltaY;
    if (!Number.isFinite(delta) || delta === 0) return 1;
    if (mode === 1) delta *= WHEEL_LINE_PX;
    else if (mode === 2) delta *= plotHeight > 0 ? plotHeight : 400;
    if (event.ctrlKey) {
      delta = Math.max(-WHEEL_PINCH_MAX_DELTA, Math.min(WHEEL_PINCH_MAX_DELTA, delta)) * WHEEL_PINCH_FACTOR;
    } else {
      delta = Math.max(-WHEEL_MAX_DELTA_PX, Math.min(WHEEL_MAX_DELTA_PX, delta));
    }
    return Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
  }

  /**
   * Scale the bar spacing by `spacingFactor` (> 1 = zoom in, within MIN/MAX_BAR_SPACING)
   * keeping the time under `plotX` (px from the plot's left edge) under it. The new range is
   * solved from the current state in one step; only the span limits (same as the
   * time-axis drag) let the anchor move. Returns false when nothing changed.
   */
  zoomTimeAtCursor(chartRef: ChartRefLike, plotX: number, spacingFactor: number): boolean {
    if (!chartRef || !chartRef.chartArea || !Number.isFinite(plotX) || !(spacingFactor > 0) || !Number.isFinite(spacingFactor)) return false;
    if (!this.linkedScale.syncTimeScale(chartRef as any)) return false;
    const ts = this.timeScale;
    if (!(ts.plotWidth > 0)) return false;
    const fraction = Math.min(1, Math.max(0, plotX / ts.plotWidth));
    const anchorTime = ts.projectedXToTime(ts.plotLeft + fraction * ts.plotWidth);
    const visible = ts.visibleTimeRange();
    if (!visible) return false;
    const spacing = sanitizeBarSpacing(ts.barSpacingPx);
    const range = this.solveAnchoredRange(chartRef, anchorTime, fraction, spacing * spacingFactor, visible.max - visible.min, spacing);
    if (!range) return false;
    this.commitAnchoredRange(chartRef, range);
    return true;
  }

  /**
   * Time range that shows the bar spacing `targetSpacing` (clamped to MIN/MAX_BAR_SPACING,
   * never reversing the direction from `refSpacing`) with `anchorTime` at `fraction`
   * across the plot (0 = left edge, 1 = right edge). The span comes from the reference pair
   * `refSpan` (visible time span) at `refSpacing`: a gesture passes its start state (with uneven
   * candles span x spacing depends on the visible candles, so the current state would make it
   * path-dependent), a one-shot zoom (wheel) the current one. Only the span limits (min candles .. 98% of the data, inside the
   * overscroll range) let the anchor move. Null when the TimeScale is not ready or the
   * result is not finite. The TimeScale must have been synced for `chartRef`.
   */
  private solveAnchoredRange(
    chartRef: ChartRefLike,
    anchorTime: number,
    fraction: number,
    targetSpacing: number,
    refSpan: number,
    refSpacing: number,
  ): { min: number; max: number } | null {
    const ts = this.timeScale;
    if (!(ts.plotWidth > 0) || !Number.isFinite(anchorTime) || !Number.isFinite(fraction) || !Number.isFinite(targetSpacing)) return null;
    if (!Number.isFinite(refSpan) || !(refSpan > 0) || !Number.isFinite(refSpacing) || !(refSpacing > 0)) return null;
    let spacing = clampBarSpacing(targetSpacing, refSpacing);
    // A spacing beyond MIN/MAX (min-candles limit) never reverses the direction of the gesture.
    if (targetSpacing > refSpacing && spacing < refSpacing) spacing = refSpacing;
    if (targetSpacing < refSpacing && spacing > refSpacing) spacing = refSpacing;
    let span = (refSpan * refSpacing) / spacing;
    if (!Number.isFinite(span) || !(span > 0)) return null;

    const data = chartRef.data?.datasets?.[0]?.data || [];
    const totalRange = this.fullDataRange.max - this.fullDataRange.min;
    if (data.length && totalRange > 0) {
      span = Math.max((totalRange / data.length) * this.MIN_CANDLES_VISIBLE, Math.min(totalRange * 0.98, span));
    }
    const f = Math.min(1, Math.max(0, fraction));
    let min = anchorTime - f * span;
    let max = min + span;
    const extMin = this.extendedDataRange.min;
    const extMax = this.extendedDataRange.max;
    if (extMax > extMin) {
      // At an extreme the anchor yields to the limits.
      if (span > extMax - extMin) { span = extMax - extMin; min = extMin; max = extMax; }
      if (min < extMin) { min = extMin; max = min + span; }
      if (max > extMax) { max = extMax; min = max - span; }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null;
    return { min, max };
  }

  /** Show a solved range on every pane; y auto-fits (only if auto scale is on). */
  private commitAnchoredRange(chartRef: ChartRefLike, range: { min: number; max: number }): void {
    this.applyXRange(chartRef, range.min, range.max);
    this.autoFitYScale(chartRef); this.syncIndicatorAxis(chartRef);
    try { this.linkedScale.notifyMainPan(chartRef as any); } catch {}
    this.scheduleInteractionUpdate(chartRef);
  }

  // ── Two-pointer pinch (focal-anchored bar-spacing scale) ──

  /**
   * Start a pinch: `distance` between the two pointers (px), `centerPlotX` their centroid
   * across the main plot (px from its left edge). The time under the centroid is the anchor
   * for the whole pinch. Cancels any one-finger long-press and axis scaling and takes over
   * from a pan; false (nothing started) while a touch crosshair is pinned or the TimeScale
   * is not ready.
   */
  beginPinch(chartRef: ChartRefLike, distance: number, centerPlotX: number): boolean {
    this.cancelLongPress();
    this.clearTimeAxisDrag();
    this.pinch = null;
    if (this.crosshairPersisted || !chartRef?.chartArea) return false;
    if (!Number.isFinite(distance) || !(distance > 0) || !Number.isFinite(centerPlotX)) return false;
    if (!this.linkedScale.syncTimeScale(chartRef as any)) return false;
    const ts = this.timeScale;
    if (!(ts.plotWidth > 0)) return false;
    const fraction = Math.min(1, Math.max(0, centerPlotX / ts.plotWidth));
    const anchorTime = ts.projectedXToTime(ts.plotLeft + fraction * ts.plotWidth);
    if (!Number.isFinite(anchorTime)) return false;
    const visible = ts.visibleTimeRange();
    if (!visible) return false;
    this.pinch = { chartRef, startDistance: distance, startBarSpacing: clampBarSpacing(ts.barSpacingPx), startSpan: visible.max - visible.min, anchorTime };
    this.gestureType = 'pinch';
    this.isInteracting = true;
    chartRef._isInteracting = true;
    this.suspendCrosshair(chartRef);
    return true;
  }

  /**
   * Scale to the pinch's current `distance` and centroid (`centerPlotX`), from the state at
   * the pinch start: the anchor time follows the centroid (zoom and move together).
   * Ignored (false) for a zero/NaN distance. Only the time scale changes.
   */
  updatePinch(distance: number, centerPlotX: number, chartRef?: ChartRefLike): boolean {
    const pinch = this.pinch;
    if (!pinch || !Number.isFinite(distance) || !(distance > 0) || !Number.isFinite(centerPlotX)) return false;
    const ref = chartRef ?? pinch.chartRef;
    if (!this.linkedScale.syncTimeScale(ref as any)) return false;
    const ts = this.timeScale;
    if (!(ts.plotWidth > 0)) return false;
    const fraction = Math.min(1, Math.max(0, centerPlotX / ts.plotWidth));
    const range = this.solveAnchoredRange(ref, pinch.anchorTime, fraction,
      pinch.startBarSpacing * (distance / pinch.startDistance), pinch.startSpan, pinch.startBarSpacing);
    if (!range) return false;
    this.commitAnchoredRange(ref, range);
    return true;
  }

  /** Finish the pinch (last finger up / linked pane): the scale stays as pinched. */
  endPinch(chartRef?: ChartRefLike): void {
    const pinch = this.pinch;
    this.pinch = null;
    if (!pinch) return;
    const ref = chartRef ?? pinch.chartRef;
    this.isInteracting = false;
    if (this.gestureType === 'pinch') this.gestureType = null;
    ref._isInteracting = false;
    if (!ref.canvas) return;
    try {
      ref.update('none');
      this.updateCandleWidth(ref);
    } catch {}
    this.finishGestureCrosshair(ref);
  }

  /** True while a pinch is in progress. */
  get isPinching(): boolean {
    return this.pinch !== null;
  }

  /**
   * An MCB-pane plot x (px from the pane's plot edge) in the main plot's frame, which all
   * pointer-anchored zooms use. Without a pane plot (NaN): the right edge of the plot.
   */
  mainPlotXFromMcbPane(paneX: number): number {
    return Number.isFinite(paneX) ? paneX + this.linkedScale.mcbPlotOffsetLeft : this.timeScale.plotWidth;
  }

  /** x value (time) under a viewport x coordinate, or null outside the plot area. */
  xValueAtClientX(chartRef: Pick<ChartRefLike, 'canvas' | 'chartArea' | 'scales'> | null | undefined, clientX: number): number | null {
    const area = chartRef?.chartArea;
    const x = chartRef?.scales?.x;
    if (!area || !x || !Number.isFinite(x.min) || !Number.isFinite(x.max)) return null;
    const width = area.right - area.left;
    if (!(width > 0)) return null;
    const px = clientX - chartRef.canvas.getBoundingClientRect().left;
    if (px < area.left || px > area.right) return null;
    // Panes share the main plot's left edge, so the offset into the plot is the same in every pane.
    // Time-linear (how Chart.js draws), only when the TimeScale was synced for this chart (or its main chart).
    const ts = this.timeScale;
    if (this.linkedScale.syncTimeScaleForPane(chartRef as any)) {
      const time = ts.projectedXToTime(ts.plotLeft + (px - area.left));
      if (Number.isFinite(time)) return time;
    }
    return x.min + ((px - area.left) / width) * (x.max - x.min);
  }

  // (public zoom/pan methods appear before private helpers to satisfy lint ordering rule)

  /** Zoom the x-range by `factor`; `anchor` (an x value) stays at the same pixel, default the right edge (TradingView). */
  zoomHorizontal(factor: number, chartRef: ChartRefLike, anchor?: number | null): void {
    const xScale = chartRef.scales.x; if (!xScale) return;
    const currentRange = xScale.max - xScale.min;
    let newRange = currentRange * factor;
    const data = chartRef.data.datasets[0]?.data || [];
    if (!data.length) return;
    const totalRange = this.fullDataRange.max - this.fullDataRange.min;
    const avgWidth = totalRange / data.length;
    const minRange = avgWidth * this.MIN_CANDLES_VISIBLE;
    const maxRange = totalRange * 0.98;
    newRange = Math.max(minRange, Math.min(maxRange, newRange));
    const pivot = anchor != null && Number.isFinite(anchor) && anchor >= xScale.min && anchor <= xScale.max ? anchor : xScale.max;
    const ratio = currentRange > 0 ? newRange / currentRange : 1;
    let newMin = pivot - (pivot - xScale.min) * ratio; let newMax = newMin + newRange;
    const extMin = this.extendedDataRange.min; const extMax = this.extendedDataRange.max;
    const extWidth = extMax - extMin;
    if (newRange > extWidth) { newRange = extWidth; newMin = extMin; newMax = extMax; }
    if (newMin < extMin) { newMin = extMin; newMax = newMin + newRange; }
    if (newMax > extMax) { newMax = extMax; newMin = newMax - newRange; }
    this.applyXRange(chartRef, newMin, newMax);
    this.autoFitYScale(chartRef); this.syncIndicatorAxis(chartRef);
    try { this.linkedScale.notifyMainPan(chartRef as any); } catch {}
    this.scheduleInteractionUpdate(chartRef);
  }

  /** Which axis is under a viewport position: 'y' = price axis, 'x' = time axis, null = plot/elsewhere. */
  axisAt(chartRef: Pick<ChartRefLike, 'canvas' | 'chartArea'> | null | undefined, clientX: number, clientY: number): 'x' | 'y' | null {
    const area = chartRef?.chartArea;
    if (!area || !chartRef?.canvas || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const rect = chartRef.canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const inX = cx >= area.left && cx <= area.right;
    const inY = cy >= area.top && cy <= area.bottom;
    if (inY && !inX) return 'y';
    if (inX && cy > area.bottom) return 'x';
    return null;
  }

  /** Manual price scale (leaves auto scale): `range` scaled by `factor` around its center. */
  private setYRangeAroundCenter(range: { min: number; max: number }, factor: number, chartRef: ChartRefLike): void {
    const yScale = chartRef.scales.y;
    if (!yScale || !Number.isFinite(range.min) || !Number.isFinite(range.max) || !(factor > 0)) return;
    const center = (range.min + range.max) / 2;
    const half = Math.max((range.max - range.min) * factor, 0.000001) / 2;
    this.yAutoScale = false;
    yScale.options.min = center - half;
    yScale.options.max = center + half;
    this.syncIndicatorAxis(chartRef);
    this.scheduleInteractionUpdate(chartRef);
  }

  zoomVertical(factor: number, chartRef: ChartRefLike): void {
    const yScale = chartRef.scales.y; if (!yScale) return;
    const currentRange = yScale.max - yScale.min; const center = (yScale.max + yScale.min)/2;
    const newRange = Math.max(currentRange * factor, 0.000001);
    yScale.options.min = center - newRange/2; yScale.options.max = center + newRange/2;
    this.syncIndicatorAxis(chartRef); this.scheduleInteractionUpdate(chartRef);
  }

  /** Fit y to the visible candles; skipped after a manual price scale unless `force` (which re-enables auto scale). */
  autoFitYScale(chartRef: ChartRefLike, force = false, candles?: CandleLike[]): void {
    if (force) this.yAutoScale = true;
    else if (!this.yAutoScale) return;
    const xScale = chartRef.scales.x; const yScale = chartRef.scales.y;
    const data = candles ?? chartRef.data.datasets[0]?.data ?? [];
    if (!data.length || !xScale || !yScale) return;
    const visible = (data as CandleLike[]).filter((c) => c.x >= xScale.min && c.x <= xScale.max);
    if (!visible.length) return;
    const highs = visible.map((c) => c.h ?? Number.NEGATIVE_INFINITY); const lows = visible.map((c) => c.l ?? Number.POSITIVE_INFINITY);
    // include order lines so they stay in view
    try {
      const orderLevels: number[] = [];
      (chartRef.data.datasets || []).forEach((ds: ChartDatasetLike) => {
        if (ds && ds.isOrder && Array.isArray(ds.data)) {
          ds.data.forEach((pt) => { const yVal = pt?.y ?? pt?.Price; if (typeof yVal === 'number') orderLevels.push(yVal); });
        }
      });
      highs.push(...orderLevels); lows.push(...orderLevels);
    } catch {}
    const maxY = Math.max(...highs); const minY = Math.min(...lows);
    const span = maxY - minY;
    yScale.options.min = minY - span * Y_AUTO_MARGIN_BOTTOM; yScale.options.max = maxY + span * Y_AUTO_MARGIN_TOP;
    this.syncIndicatorAxis(chartRef);
  }

  /**
   * Live candle flush: in auto scale, refit y only when the last candle's high/low left the current y range and
   * no gesture runs, so a vertical drag / the user's y offset survives ticks until the next x change.
   */
  refitYForLiveCandle(chartRef: ChartRefLike): void {
    if (!this.yAutoScale || this.isInteracting) return;
    const yScale = chartRef?.scales?.y;
    const data = chartRef?.data?.datasets?.[0]?.data as CandleLike[] | undefined;
    const last = data?.[data.length - 1];
    if (!yScale || !last) return;
    // options first: they hold the latest intended range (a drag writes them before the scale is updated)
    const yMin = typeof yScale.options?.min === 'number' ? yScale.options.min : yScale.min;
    const yMax = typeof yScale.options?.max === 'number' ? yScale.options.max : yScale.max;
    const outside = (typeof last.h === 'number' && typeof yMax === 'number' && last.h > yMax) ||
      (typeof last.l === 'number' && typeof yMin === 'number' && last.l < yMin);
    if (outside) this.autoFitYScale(chartRef);
  }

  /** Price-axis double click / double tap: auto scale on, price fitted to the visible candles (manual range discarded). */
  resetPriceScale(chartRef: ChartRefLike): void {
    if (!chartRef?.scales?.y) return;
    this.autoFitYScale(chartRef, true);
    this.layoutService.invalidateTickCache();
    this.scheduleInteractionUpdate(chartRef);
  }

  /**
   * Time-axis double click / double tap: horizontal scale back to DEFAULT_BAR_SPACING, Y mode untouched.
   * Following the live edge: the right edge returns to the latest candle + RIGHT_PADDING_BARS.
   * Detached (viewing history): the time at the plot center stays; never jumps to the latest candle.
   * Returns false when nothing changed (TimeScale not ready).
   */
  resetTimeScale(chartRef: ChartRefLike): boolean {
    if (!chartRef?.chartArea || !this.linkedScale.syncTimeScale(chartRef as any)) return false;
    const ts = this.timeScale;
    const visible = ts.visibleTimeRange();
    if (!(ts.plotWidth > 0) || !visible) return false;
    this.updateLiveFollow(); // the stored state only follows pans: judge the current view
    const following = this.liveFollow() === 'following';
    const fraction = following ? 1 : 0.5;
    const anchorTime = following
      ? ts.logicalToTime(ts.lastDataIndex + this.RIGHT_PADDING_BARS)
      : ts.projectedXToTime(ts.plotLeft + fraction * ts.plotWidth);
    const spacing = sanitizeBarSpacing(ts.barSpacingPx);
    const range = this.solveAnchoredRange(chartRef, anchorTime, fraction, this.DEFAULT_BAR_SPACING_PX, visible.max - visible.min, spacing);
    if (!range) return false;
    this.commitAnchoredRange(chartRef, range);
    this.updateLiveFollow();
    return true;
  }

  /** Toolbar reset: back to the default view. */
  resetZoom(chartRef: ChartRefLike, candleData?: CandleLike[]): void {
    this.zoomToRecent(chartRef, candleData);
  }

  /**
   * Default view (load, timeframe / symbol switch), like TradingView: the latest candles at
   * DEFAULT_BAR_SPACING_PX each, the current candle on the right with RIGHT_PADDING_BARS
   * of space after it, price fitted to what is visible. `candles` overrides the chart's data
   * when the chart instance has not received the new dataset yet.
   */
  zoomToRecent(chartRef: ChartRefLike, candles?: CandleLike[]): void {
    const area = chartRef?.chartArea;
    this.showLatestBars(chartRef, this.defaultVisibleBars(area ? area.right - area.left : 0), candles);
  }

  /**
   * The default view's x/y range for `candles` on a plot `widthPx` wide, without touching a chart,
   * so it can go into the chart options before the first render of new data. Null with < 2 candles.
   */
  recentRange(candles: CandleLike[], widthPx: number): { xMin: number; xMax: number; yMin: number; yMax: number } | null {
    const gap = this.candleGap(candles);
    if (!gap) return null;
    const x = this.latestBarsXRange(candles, this.defaultVisibleBars(widthPx), gap);
    const visible = candles.filter((c) => c.x >= x.min && c.x <= x.max);
    const highs = visible.map((c) => c.h ?? Number.NEGATIVE_INFINITY);
    const lows = visible.map((c) => c.l ?? Number.POSITIVE_INFINITY);
    const maxY = Math.max(...highs); const minY = Math.min(...lows);
    if (!Number.isFinite(maxY) || !Number.isFinite(minY)) return null;
    const span = maxY - minY;
    return { xMin: x.min, xMax: x.max, yMin: minY - span * Y_AUTO_MARGIN_BOTTOM, yMax: maxY + span * Y_AUTO_MARGIN_TOP };
  }

  /**
   * Jump to the latest candle and fit price to what is visible (no double-click / double-tap caller since T7).
   * Keeps the current zoom when it shows fewer than `maxVisible` candles, otherwise zooms in to `maxVisible`.
   */
  zoomToLatest(chartRef: ChartRefLike, maxVisible = 100): void {
    const xScale = chartRef?.scales?.x;
    const data = (chartRef?.data?.datasets?.[0]?.data || []) as CandleLike[];
    const gap = this.candleGap(data);
    if (!xScale || !gap) return;
    const currentBars = Math.round((xScale.max - xScale.min) / gap) - this.RIGHT_PADDING_BARS;
    this.showLatestBars(chartRef, Math.min(maxVisible, currentBars));
  }

  fitToData(chartRef: ChartRefLike): void {
    if (!chartRef?.scales?.x?.options || !chartRef?.scales?.y?.options) return;
    if (
      !Number.isFinite(this.fullDataRange.min) ||
      !Number.isFinite(this.fullDataRange.max) ||
      !Number.isFinite(this.initialYRange.min) ||
      !Number.isFinite(this.initialYRange.max)
    ) {
      return;
    }

    this.yAutoScale = true;
    this.applyXRange(chartRef, this.fullDataRange.min, this.fullDataRange.max);
    const yBuffer = this.initialYRange.max - this.initialYRange.min;
    chartRef.scales.y.options.min = this.initialYRange.min - yBuffer;
    chartRef.scales.y.options.max = this.initialYRange.max + yBuffer;
    this.layoutService.invalidateTickCache();
    this.syncIndicatorAxis(chartRef);
    chartRef.update('none'); this.updateCandleWidth(chartRef);
  }

  // Hidden indicator axis sync (public)
  syncIndicatorAxis(chartRef: ChartRefLike): void {
    try {
      const yScale = chartRef.scales.y; if (!yScale) return;
      const yMinRaw = typeof yScale.min === 'number' ? yScale.min : yScale.options?.min;
      const yMaxRaw = typeof yScale.max === 'number' ? yScale.max : yScale.options?.max;
      if (typeof yMinRaw !== 'number' || typeof yMaxRaw !== 'number') return;
      if (!Number.isFinite(yMinRaw) || !Number.isFinite(yMaxRaw)) return;
      const yMin = yMinRaw;
      const yMax = yMaxRaw;
      chartRef.config = chartRef.config || {}; chartRef.config.options = chartRef.config.options || {};
      chartRef.config.options.scales = chartRef.config.options.scales || {};
      chartRef.config.options.scales['indicator'] = chartRef.config.options.scales['indicator'] || {};
      chartRef.config.options.scales['indicator'].min = yMin; chartRef.config.options.scales['indicator'].max = yMax;
      const ind = chartRef.scales.indicator; if (ind) { ind.options = ind.options || {}; ind.options.min = yMin; ind.options.max = yMax; ind.min = yMin; ind.max = yMax; }
    } catch {}
  }

  // Candle width logic (public)
  updateCandleWidth(chartRef: ChartRefLike): void {
    if (!chartRef) return;
    const candleDs = chartRef.data.datasets.find((d: ChartDatasetLike) => d.type === 'candlestick'); 
    if (!candleDs) return;
    const data = (candleDs.data || []) as CandleLike[]; 
    if (!data.length) return;
    const xScale = chartRef.scales.x; 
    if (!xScale || typeof xScale.min !== 'number' || typeof xScale.max !== 'number') return;
    const visible = data.filter(c => c.x >= xScale.min && c.x <= xScale.max); 
    const visibleCount = visible.length; 
    if (visibleCount < 2) return;
    
    const xRangeChanged = !this.lastXRange || this.lastXRange.min !== xScale.min || this.lastXRange.max !== xScale.max;
  const countChangedPct = this.lastVisibleCount > 0 ? Math.abs(visibleCount - this.lastVisibleCount) / this.lastVisibleCount : 1;
    this.interactionFrameCounter++;
    const frameSkip = Math.max(1, this.performance.profile.candleWidthFrameSkip);
    if (this.isInteracting && !xRangeChanged && countChangedPct < 0.05 && this.interactionFrameCounter % frameSkip !== 0) return;
    
    this.lastVisibleCount = visibleCount; 
    this.lastXRange = { min: xScale.min, max: xScale.max };
    
    // Calculate average gap between candles in time units
    let totalGap = 0; 
    for (let i=1; i<visible.length; i++) totalGap += visible[i].x - visible[i-1].x;
    const avgGap = totalGap / (visible.length - 1); 
  if (!isFinite(avgGap) || avgGap <= 0) return;
    
    // Get the actual drawable chart area width (where candles are rendered)
    // This is stable regardless of what datasets are present
    const chartArea = chartRef.chartArea;
    if (!chartArea) return;
    const areaWidth = chartArea.right - chartArea.left;
    if (areaWidth <= 0) return;
    
    // Calculate how many pixels are available per time unit
    const timeRange = xScale.max - xScale.min;
    const pxPerTimeUnit = areaWidth / timeRange;
    
    // Calculate the pixel gap between candle centers
    const pxGapBetweenCandles = avgGap * pxPerTimeUnit;
    
    // TradingView approach: the gap between candles includes the candle width + spacing
    // Total space per candle = candle width + spacing
    // We want: candleWidth / totalSpace ≈ 0.8 (80% candle, 20% spacing)
    const candleWidthRatio = 0.8;
    let candleWidthPx = pxGapBetweenCandles * candleWidthRatio;
    
    // Apply TradingView-like bounds
    // Min: 1px (very zoomed out), Max: 16px (zoomed in close)
    candleWidthPx = Math.max(1, Math.min(16, candleWidthPx));
    
    // Set Chart.js properties for consistent rendering
    // barPercentage: how much of the category the bar takes up
    // categoryPercentage: how much space between categories
    // maxBarThickness: absolute maximum width in pixels
    candleDs.barPercentage = 0.9;
    candleDs.categoryPercentage = 0.9;
    candleDs.maxBarThickness = Math.round(candleWidthPx);
    
    chartRef.update('none');
  }

  // Compute extended overscroll range (public)
  computeExtendedRange(candles: Array<{ x: number }>): void {
    if (!candles || candles.length < 2) { this.extendedDataRange = { ...this.fullDataRange }; return; }
    const first = candles[0].x; const last = candles[candles.length -1].x; const totalRange = last - first;
    let sumGaps = 0; for (let i=1;i<candles.length;i++) sumGaps += candles[i].x - candles[i-1].x;
    const avgGap = sumGaps / (candles.length -1); const gap = !isFinite(avgGap) || avgGap <= 0 ? totalRange / candles.length : avgGap;
    const bufferByPercent = totalRange * 0.15; const bufferByCandles = gap * 40; let buffer = Math.max(bufferByPercent, bufferByCandles);
    const maxBuffer = totalRange * 0.4; if (buffer > maxBuffer) buffer = maxBuffer;
    this.extendedDataRange = { min: Math.floor(first - buffer), max: Math.ceil(last + buffer) };
  }

  // --- Private helpers (moved to bottom) ---
  /** Average x distance between the last ~50 candles, 0 when unknown. */
  private candleGap(data: CandleLike[]): number {
    return averageCandleGap(data);
  }

  /**
   * Show `min`..`max` (ms) through the shared TimeScale: it takes the range as its
   * state and projects it onto the chart. Falls back to writing the range
   * directly while the TimeScale is not ready (no plot / fewer than 2 candles).
   */
  private applyXRange(chartRef: ChartRefLike, min: number, max: number, candles?: CandleLike[]): void {
    const ts = this.timeScale;
    this.linkedScale.syncTimeScale(chartRef as any, 'rendered', candles);
    if (ts.setVisibleTimeRange(min, max) && ts.applyToChart(chartRef)) return;
    const xScale = chartRef.scales.x;
    xScale.options.min = min; xScale.options.max = max;
    xScale.min = min; xScale.max = max;
  }

  /** Candles in the default view: DEFAULT_BAR_SPACING_PX each on a plot `widthPx` wide (100 when unknown). */
  private defaultVisibleBars(widthPx: number): number {
    if (!(widthPx > 0)) return 100;
    const bars = Math.round(widthPx / this.DEFAULT_BAR_SPACING_PX) - this.RIGHT_PADDING_BARS;
    return Math.max(30, Math.min(200, bars));
  }

  /** x-range with the last `bars` candles plus RIGHT_PADDING_BARS empty bars. */
  private latestBarsXRange(data: CandleLike[], bars: number, gap: number): { min: number; max: number } {
    const count = Math.max(this.MIN_CANDLES_VISIBLE, Math.min(bars, data.length));
    const last = data[data.length - 1].x;
    let max = last + gap * (this.RIGHT_PADDING_BARS + 0.5);
    if (Number.isFinite(this.extendedDataRange.max) && this.extendedDataRange.max > last) {
      max = Math.min(max, this.extendedDataRange.max);
    }
    return { min: max - gap * (count + this.RIGHT_PADDING_BARS), max };
  }

  /** Show the last `bars` candles plus RIGHT_PADDING_BARS empty bars, y auto scale back on. */
  private showLatestBars(chartRef: ChartRefLike, bars: number, candles?: CandleLike[]): void {
    const xScale = chartRef?.scales?.x;
    const data = candles ?? ((chartRef?.data?.datasets?.[0]?.data || []) as CandleLike[]);
    const gap = this.candleGap(data);
    if (!xScale || !chartRef.scales.y || !gap) return;
    const { min: newMin, max: newMax } = this.latestBarsXRange(data, bars, gap);
    this.applyXRange(chartRef, newMin, newMax, data);
    this.autoFitYScale(chartRef, true, candles);
    this.layoutService.invalidateTickCache();
    try { this.linkedScale.notifyMainPan(chartRef as any); } catch {}
    chartRef.update('none'); this.updateCandleWidth(chartRef);
    // Every default-view path (zoomToRecent / resetZoom / zoomToLatest / initial load) follows the live edge.
    this.resetLiveFollow();
  }

  private handleHorizontalZoomSwipe(deltaX: number, chartRef: ChartRefLike): void {
    const sensitivity = 0.003; const zoomFactor = 1 + deltaX * sensitivity; const constrained = Math.max(0.95, Math.min(1.05, zoomFactor));
    this.zoomHorizontal(constrained, chartRef);
  }
  private handleVerticalZoomSwipe(deltaY: number, chartRef: ChartRefLike): void {
    const sensitivity = 0.004; const zoomFactor = 1 + deltaY * sensitivity; const constrained = Math.max(0.95, Math.min(1.05, zoomFactor));
    this.yAutoScale = false;
    this.zoomVertical(constrained, chartRef);
  }
  /** 'detached' once a pan left the latest candle (+ right offset) by more than the threshold (settings store, default LIVE_FOLLOW_THRESHOLD_BARS). */
  get liveFollowState(): LiveFollowState {
    return this.liveFollow();
  }

  /** Back to 'following' without moving the view: default view applied, new exchange / symbol / timeframe. */
  resetLiveFollow(): void {
    this.liveFollow.set('following');
  }

  /** Stop following without moving the view (global `setAllChartsLiveFollow(false)`). */
  detachLiveFollow(): void {
    this.liveFollow.set('detached');
  }

  /**
   * "Return to live": the newest candle back at the right edge with RIGHT_PADDING_BARS empty bars after it,
   * at the CURRENT bar spacing (unlike resetTimeScale, which restores DEFAULT_BAR_SPACING), state 'following'.
   * Y mode untouched (auto scale refits to the new visible candles, a manual range stays).
   * False when nothing changed (TimeScale not ready).
   */
  goToRealtime(chartRef: ChartRefLike): boolean {
    if (!chartRef?.chartArea || !this.linkedScale.syncTimeScale(chartRef as any)) return false;
    const ts = this.timeScale;
    const visible = ts.visibleTimeRange();
    if (!(ts.plotWidth > 0) || !visible) return false;
    const spacing = sanitizeBarSpacing(ts.barSpacingPx);
    const anchorTime = ts.logicalToTime(ts.lastDataIndex + this.RIGHT_PADDING_BARS);
    const range = this.solveAnchoredRange(chartRef, anchorTime, 1, spacing, visible.max - visible.min, spacing);
    if (!range) return false;
    this.commitAnchoredRange(chartRef, range);
    this.resetLiveFollow();
    return true;
  }

  /**
   * Live flush after `newBars` candles were appended to `candles` (the chart's new dataset).
   * Always: the pan/zoom limits grow with the data (see growRangesForAppend).
   * 'following' (and no gesture running): the visible range moves by exactly the appended bars, so the
   * right offset in bars and the bar spacing stay as they were (no fit, no re-center, Y untouched).
   * 'detached': the range is not touched. Writes the main chart's range only (applyXRange); the caller's
   * update('none') then projects it onto the linked panes in the same frame (linkedPanelSync afterUpdate).
   * True when the range moved.
   */
  followLiveBars(chartRef: ChartRefLike, candles: CandleLike[], newBars: number): boolean {
    const n = candles?.length ?? 0;
    const k = Math.floor(newBars);
    if (!chartRef?.scales?.x || !(k > 0) || n - k < 2) return false;
    this.growRangesForAppend(candles, k);
    if (this.liveFollow() !== 'following' || this.isInteracting || this.pan || this.pinch || this.timeAxisDrag) return false;
    const area = chartRef.chartArea;
    const xOpts = chartRef.scales.x.options;
    const min = typeof xOpts?.min === 'number' ? xOpts.min : chartRef.scales.x.min;
    const max = typeof xOpts?.max === 'number' ? xOpts.max : chartRef.scales.x.max;
    if (!area || !(area.right > area.left) || !Number.isFinite(min) || !Number.isFinite(max)) return false;
    // The view before the append, measured on the previous candles (a scratch scale: the shared one may already hold the new ones).
    const before = new TimeScale();
    before.setCandles(candles.slice(0, n - k));
    before.setPlot(area.left, area.right);
    if (!before.setVisibleTimeRange(min, max)) return false;
    const { from, to } = before.visibleLogicalRange();
    const ts = this.timeScale;
    ts.setCandles(candles);
    ts.setPlot(area.left, area.right);
    // Same bars across the plot, same empty bars right of the (new) last candle.
    if (!ts.setVisibleLogicalRange(from + k, to + k)) return false;
    const next = ts.visibleTimeRange();
    if (!next) return false;
    let { min: newMin, max: newMax } = next;
    const extMin = this.extendedDataRange.min; const extMax = this.extendedDataRange.max;
    if (extMax > extMin && newMax - newMin <= extMax - extMin) {
      if (newMax > extMax) { newMin -= newMax - extMax; newMax = extMax; }
      if (newMin < extMin) { newMax += extMin - newMin; newMin = extMin; }
    }
    this.applyXRange(chartRef, newMin, newMax, candles);
    return true;
  }

  /**
   * Appended candles extend the pan/zoom limits that loadCandles computed: the data range ends at the new
   * last candle and the overscroll range keeps its buffer beyond it. Only ever widens them, so a detached
   * view is never moved by it; without it the newest candles would end up beyond the pan limit.
   */
  private growRangesForAppend(candles: CandleLike[], newBars: number): void {
    const last = candles[candles.length - 1]?.x;
    const prevLast = candles[candles.length - 1 - newBars]?.x;
    if (!Number.isFinite(last) || !Number.isFinite(prevLast) || !(last > prevLast)) return;
    const full = this.fullDataRange;
    if (Number.isFinite(full.max) && last > full.max) full.max = last;
    const ext = this.extendedDataRange;
    if (Number.isFinite(ext.max) && ext.max > ext.min) {
      // Same buffer past the last candle as before the append (in place: the component shares these objects).
      const buffer = ext.max - prevLast;
      if (buffer > 0 && last + buffer > ext.max) ext.max = last + buffer;
    }
  }

  /**
   * Start a pan at the pointer (`clientX`/`clientY` at the press): remembers the visible
   * time range, so every later move is computed from the total dx. `clientY` null = x only.
   * `captureDocument` follows the mouse outside the chart until release.
   */
  private beginPan(chartRef: ChartRefLike, clientX: number, clientY: number | null = null, captureDocument = false): void {
    this.clearPan();
    const xScale = chartRef?.scales?.x;
    if (!xScale || !Number.isFinite(clientX)) return;
    const ts = this.timeScale;
    const ready = this.linkedScale.syncTimeScale(chartRef as any);
    const visible = ready ? ts.visibleTimeRange() : null;
    this.pan = {
      chartRef,
      startClientX: clientX,
      lastClientX: clientX,
      startMin: visible?.min ?? xScale.min,
      startMax: visible?.max ?? xScale.max,
      plotWidth: ready && ts.plotWidth > 0 ? ts.plotWidth : chartRef.width,
      lastClientY: clientY != null && Number.isFinite(clientY) ? clientY : null,
      documentCapture: captureDocument,
    };
    if (captureDocument && typeof document !== 'undefined') {
      document.addEventListener('mousemove', this.onDocumentPanMove);
      document.addEventListener('mouseup', this.onDocumentPanUp);
      window.addEventListener('blur', this.onDocumentPanUp);
    }
  }

  /**
   * Pan to the pointer. x: start range shifted by the TOTAL dx (content follows the pointer,
   * span and bar spacing never change), clamped to the extended data range. y (when
   * `clientY` is given): the unchanged incremental vertical pan (shifts the y range by the
   * pointer's dy since the previous event; never changes its span or the y auto-scale flag).
   */
  private updatePan(clientX: number, clientY: number | null, chartRef: ChartRefLike): void {
    const pan = this.pan;
    const xScale = chartRef.scales.x; const yScale = chartRef.scales.y;
    if (!pan || !xScale || !yScale || !Number.isFinite(clientX)) return;
    // The same pointer position again (canvas move + its bubbled document move): nothing new to apply.
    if (clientX === pan.lastClientX && (clientY == null || clientY === pan.lastClientY)) return;
    pan.lastClientX = clientX;
    const yRange = yScale.max - yScale.min;
    const span = pan.startMax - pan.startMin;
    const shift = pan.plotWidth > 0 ? -((clientX - pan.startClientX) / pan.plotWidth) * span * this.PAN_SENSITIVITY : 0;
    let newXMin = pan.startMin + shift; let newXMax = pan.startMax + shift;
    const extMin = this.extendedDataRange.min; const extMax = this.extendedDataRange.max;
    if (newXMin < extMin) { newXMin = extMin; newXMax = newXMin + span; }
    if (newXMax > extMax) { newXMax = extMax; newXMin = newXMax - span; }
    let deltaY = 0;
    if (clientY != null && Number.isFinite(clientY)) {
      if (pan.lastClientY != null) deltaY = clientY - pan.lastClientY;
      pan.lastClientY = clientY;
    }
    const yPanAmount = (deltaY / chartRef.height) * yRange * this.PAN_SENSITIVITY;
    this.applyXRange(chartRef, newXMin, newXMax);
    yScale.options.min = yScale.min + yPanAmount; yScale.options.max = yScale.max + yPanAmount;
    this.syncIndicatorAxis(chartRef);
    try { this.linkedScale.notifyMainPan(chartRef as any); } catch {}
    this.scheduleInteractionUpdate(chartRef);
    this.updateLiveFollow();
  }

  /** Pans only: compare the right edge with the latest candle + right offset, in bars (threshold from the settings store). */
  private updateLiveFollow(): void {
    const ts = this.timeScale;
    if (!ts.isReady) return;
    const awayBars = Math.abs(ts.rightOffsetBars - this.RIGHT_PADDING_BARS);
    this.liveFollow.set(awayBars > this.liveFollowThresholdBars ? 'detached' : 'following');
  }

  private readonly onDocumentPanMove = (event: MouseEvent): void => {
    const pan = this.pan;
    if (pan) this.updatePan(event.clientX, event.clientY, pan.chartRef);
  };

  /** Release (or window blur) outside the chart ends the pan like a mouse up on it. */
  private readonly onDocumentPanUp = (): void => {
    const ref = this.pan?.chartRef;
    this.clearPan();
    if (!ref) return;
    this.isInteracting = false;
    if (this.gestureType === 'pan') this.gestureType = null;
    this.mouseStart = null;
    this.mouseStartOrigin = null;
    ref._isInteracting = false;
    // The chart may already be destroyed: state cleanup above must always run.
    if (!ref.canvas) return;
    try {
      ref.update('none');
      this.updateCandleWidth(ref);
    } catch {}
    this.finishGestureCrosshair(ref);
    this.onPanEnd?.(ref);
  };

  private clearPan(): void {
    this.pan = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this.onDocumentPanMove);
      document.removeEventListener('mouseup', this.onDocumentPanUp);
    }
    if (typeof window !== 'undefined') window.removeEventListener('blur', this.onDocumentPanUp);
  }
  private getTouchDistance(touches: TouchList): number {
    const t1 = touches[0]; const t2 = touches[1]; return Math.sqrt(Math.pow(t2.clientX - t1.clientX,2) + Math.pow(t2.clientY - t1.clientY,2));
  }
  /** Centroid of the first two touches across the main plot (px from its left edge), NaN without a plot. */
  private touchCenterPlotX(touches: TouchList, chartRef: ChartRefLike): number {
    return this.plotXAtClientX(chartRef, (touches[0].clientX + touches[1].clientX) / 2);
  }
  private isTouchInAxisArea(touchPoint: { x: number; y: number }, chartRef: ChartRefLike): boolean {
    if (!chartRef || !chartRef.chartArea) return false; const rect = chartRef.canvas.getBoundingClientRect(); const chartArea = chartRef.chartArea;
    const canvasX = touchPoint.x - rect.left; const canvasY = touchPoint.y - rect.top; const inX = canvasX >= chartArea.left && canvasX <= chartArea.right && (canvasY < chartArea.top || canvasY > chartArea.bottom);
    const inY = canvasY >= chartArea.top && canvasY <= chartArea.bottom && (canvasX < chartArea.left || canvasX > chartArea.right); return inX || inY;
  }

  /**
   * Place the crosshair at a viewport position, snapped to the nearest candle
   * (TradingView). Inside the plot both lines show; above/below it only the
   * vertical line, and only when a linked panel listens. Returns whether shown.
   */
  private setCrosshair(
    chartRef: ChartRefLike,
    clientX: number,
    clientY: number,
    insideOnly = false,
    hideOutside = false,
    paneRef?: ChartRefLike,
  ): boolean {
    if (this.crosshairSuspended) {
      this.suspendCrosshair(chartRef);
      return false;
    }
    // The pane the pointer is physically in decides where it is and which time it means.
    const pointerRef = paneRef ?? chartRef;
    const source: CrosshairSource = paneRef ? 'pane' : 'main';
    const area = pointerRef.chartArea;
    const pointerScale = pointerRef.scales?.x;
    const xScale = chartRef.scales?.x;
    const mainArea = chartRef.chartArea;
    if (!area || !pointerScale || !xScale || !mainArea) return false;
    const rect = pointerRef.canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const inX = cx >= area.left && cx <= area.right;
    const inY = cy >= area.top && cy <= area.bottom;
    if (!inX || (source === 'main' && !inY && (insideOnly || !this.onCrosshairChanged))) {
      if (hideOutside && !this.crosshairPersisted) this.hideCrosshair(chartRef);
      return false;
    }
    const raw = pointerScale.getValueForPixel?.(cx);
    const pointerTime = raw != null && Number.isFinite(raw) ? raw : null;
    const snappedTime = pointerTime != null ? this.snapCandleTime(chartRef, pointerTime) : null;
    const px = snappedTime != null ? crosshairPixelX(xScale, mainArea, snappedTime) : null;
    if (px == null && source === 'pane') return false;
    this.crosshairPointerTime = pointerTime;
    this.crosshairSnappedTime = snappedTime;
    this.crosshairSource = source;
    this.crosshairLeftDuringGesture = false;
    chartRef._crosshairTime = px != null ? snappedTime : null;
    chartRef._crosshairX = px ?? cx;
    // Horizontal line + price label: only in the pane the pointer is in.
    chartRef._crosshairY = source === 'main' && inY ? cy : null;
    this.scheduleCrosshairDraw(chartRef);
    this.onCrosshairChanged?.(snappedTime, clientY, source);
    return true;
  }

  /** One redraw per frame while the crosshair follows the pointer (mousemove can fire faster). */
  private scheduleCrosshairDraw(chartRef: ChartRefLike): void {
    if (typeof requestAnimationFrame === 'undefined') {
      chartRef.draw();
      return;
    }
    if (this.crosshairDrawChart === chartRef) return;
    this.crosshairDrawChart = chartRef;
    requestAnimationFrame(() => {
      const ref = this.crosshairDrawChart;
      this.crosshairDrawChart = null;
      try { ref?.draw(); } catch {}
    });
  }

  /** Time of the candle nearest to `value`; past either end, the nearest empty candle slot. */
  private snapCandleTime(chartRef: ChartRefLike, value: number): number {
    const candles = (chartRef.data.datasets.find((d) => d.type === 'candlestick')?.data ?? []) as CandleLike[];
    const n = candles.length;
    if (!n) return value;
    const first = candles[0].x;
    const last = candles[n - 1].x;
    if (value >= last) {
      const step = n > 1 ? last - candles[n - 2].x : 0;
      return step > 0 ? last + Math.round((value - last) / step) * step : last;
    }
    if (value <= first) {
      const step = n > 1 ? candles[1].x - first : 0;
      return step > 0 ? first - Math.round((first - value) / step) * step : first;
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].x <= value) lo = mid;
      else hi = mid;
    }
    return value - candles[lo].x <= candles[hi].x - value ? candles[lo].x : candles[hi].x;
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressChartRef = null;
  }


  private scheduleInteractionUpdate(chartRef: ChartRefLike): void {
    if (!chartRef) return;
    if (!this.isInteracting) {
      chartRef.update('none');
      this.updateCandleWidth(chartRef);
      return;
    }
    if (this.interactionUpdateScheduled) return;

    const now = Date.now();
    const minMs = Math.max(10, this.performance.profile.interactionUpdateMs);
    if (now - this.lastInteractionUpdateAt < minMs) return;

    this.interactionUpdateScheduled = true;
    const run: () => void = () => {
      this.interactionUpdateScheduled = false;
      this.lastInteractionUpdateAt = Date.now();
      chartRef.update('none');
      this.updateCandleWidth(chartRef);
      try { this.onAfterInteractionUpdate?.(chartRef); } catch {}
    };
    if (minMs > 20) {
      setTimeout(run, minMs);
      return;
    }
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run); else setTimeout(run,16);
  }
}
