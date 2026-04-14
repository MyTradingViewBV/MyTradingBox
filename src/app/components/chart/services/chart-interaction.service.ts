/* Interaction logic extracted from ChartComponent.
   Handles touch, mouse, wheel gestures and scale adjustments.
   The component injects this service and forwards events.
*/
 
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChartLayoutService } from './chart-layout.service';

export type GestureKind = 'pan' | 'zoom-x' | 'zoom-y' | 'pinch' | null;

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
}

@Injectable({ providedIn: 'root' })
export class ChartInteractionService {
  readonly MIN_CANDLES_VISIBLE = 10;
  readonly PAN_SENSITIVITY = 1.0;

  constructor(private layoutService: ChartLayoutService) {}

  // runtime interaction state
  isInteracting = false;
  gestureType: GestureKind = null;
  touchStart: { x: number; y: number; time: number } | null = null;
  mouseStart: { x: number; y: number; time: number } | null = null;

  // Crosshair state: persisted = crosshair is frozen on screen after release
  private crosshairPersisted = false;
  // Long-press timer to activate crosshair (only way to show it)
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private longPressChartRef: ChartRefLike | null = null;
  // Original start position (mouseStart gets mutated during drag)
  private mouseStartOrigin: { x: number; y: number } | null = null;
  lastTouches: TouchList | null = null;
  initialPinchDistance = 0;
  fullDataRange: { min: number; max: number } = { min: 0, max: 0 };
  extendedDataRange: { min: number; max: number } = { min: 0, max: 0 };
  initialYRange: { min: number; max: number } = { min: 0, max: 0 };

  // performance/throttling state
  private interactionUpdateScheduled = false;
  private lastVisibleCount = 0;
  private interactionFrameCounter = 0;
  private lastXRange: { min: number; max: number } | null = null;

  // Optional hook for components to react after interaction updates (pan/zoom)
  onAfterInteractionUpdate?: (chartRef: ChartRefLike) => void;

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
        const rect = ref.canvas.getBoundingClientRect();
        const cx = this.touchStart.x - rect.left;
        const cy = this.touchStart.y - rect.top;
        const area = ref.chartArea;
        if (area && cx >= area.left && cx <= area.right && cy >= area.top && cy <= area.bottom) {
          ref._crosshairX = cx;
          ref._crosshairY = cy;
          this.crosshairPersisted = true;
          this.isInteracting = false;
          ref._isInteracting = false;
          this.gestureType = null;
          ref.draw();
        }
      }, 300);
    } else if (event.touches.length === 2) {
      this.cancelLongPress();
      // Block pinch zoom while crosshair is active
      if (this.crosshairPersisted) return;
      this.gestureType = 'pinch';
      this.lastTouches = event.touches;
      this.initialPinchDistance = this.getTouchDistance(this.lastTouches);
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
        const rect = chartRef.canvas.getBoundingClientRect();
        const canvasX = touch.clientX - rect.left;
        const canvasY = touch.clientY - rect.top;
        const area = chartRef.chartArea;
        if (area && canvasX >= area.left && canvasX <= area.right && canvasY >= area.top && canvasY <= area.bottom) {
          chartRef._crosshairX = canvasX;
          chartRef._crosshairY = canvasY;
          chartRef.draw();
        }
        return;
      }

      if (!this.gestureType && this.isTouchInAxisArea(this.touchStart, chartRef)) {
        this.cancelLongPress();
        const absX = Math.abs(deltaX); const absY = Math.abs(deltaY);
        if (absX > 15 || absY > 15) {
          this.gestureType = absX > absY ? 'zoom-x' : 'zoom-y';
        }
      } else if (!this.gestureType && !this.isTouchInAxisArea(this.touchStart, chartRef)) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          this.cancelLongPress();
          this.gestureType = 'pan';
        }
      }

      if (this.gestureType === 'zoom-x') {
        this.handleHorizontalZoomSwipe(deltaX, chartRef);
        this.touchStart.x = touch.clientX;
      } else if (this.gestureType === 'zoom-y') {
        this.handleVerticalZoomSwipe(deltaY, chartRef);
        this.touchStart.y = touch.clientY;
      } else if (this.gestureType === 'pan') {
        this.handlePan(deltaX, deltaY, chartRef);
        this.touchStart.x = touch.clientX;
        this.touchStart.y = touch.clientY;
      }
    } else if (event.touches.length === 2 && this.lastTouches && this.gestureType === 'pinch') {
      this.handlePinchZoom(event.touches, chartRef);
    }
  }

  onTouchEnd(_: TouchEvent, chartRef: ChartRefLike): void {
    this.cancelLongPress();
    const wasStart = this.touchStart;
    const elapsed = wasStart ? Date.now() - wasStart.time : 9999;
    this.isInteracting = false;
    const wasGesture = this.gestureType;
    this.gestureType = null;
    this.touchStart = null;
    this.lastTouches = null;
    this.initialPinchDistance = 0;
    if (chartRef) {
      chartRef._isInteracting = false;

      // Short tap = dismiss crosshair
      const isTap = elapsed < 300 && !wasGesture;
      if (isTap && this.crosshairPersisted) {
        chartRef._crosshairX = null;
        chartRef._crosshairY = null;
        this.crosshairPersisted = false;
      }
      // Crosshair persists from long-press; pan/zoom never creates one

      chartRef.update('none');
      this.updateCandleWidth(chartRef);
    }
  }

  // Mouse handlers
  onMouseDown(event: MouseEvent, chartRef: ChartRefLike): void {
    if (event.button === 0) {
      this.mouseStart = { x: event.clientX, y: event.clientY, time: Date.now() };
      this.mouseStartOrigin = { x: event.clientX, y: event.clientY };

      // If crosshair is persisted, don't start panning — only track for crosshair move or dismiss
      if (this.crosshairPersisted) {
        // Show crosshair at click position immediately
        if (chartRef) {
          const rect = chartRef.canvas.getBoundingClientRect();
          const canvasX = event.clientX - rect.left;
          const canvasY = event.clientY - rect.top;
          const area = chartRef.chartArea;
          if (area && canvasX >= area.left && canvasX <= area.right && canvasY >= area.top && canvasY <= area.bottom) {
            chartRef._crosshairX = canvasX;
            chartRef._crosshairY = canvasY;
            chartRef.draw();
          }
        }
        return;
      }

      this.isInteracting = true;
      this.gestureType = 'pan';
      if (chartRef) chartRef._isInteracting = true;
      // No crosshair on pan — only long-press activates it
    }
  }

  onMouseMove(event: MouseEvent, chartRef: ChartRefLike): void {
    if (!chartRef) return;

    // If crosshair is persisted, move crosshair instead of panning
    if (this.crosshairPersisted && this.mouseStart) {
      const rect = chartRef.canvas.getBoundingClientRect();
      const canvasX = event.clientX - rect.left;
      const canvasY = event.clientY - rect.top;
      const area = chartRef.chartArea;
      if (area && canvasX >= area.left && canvasX <= area.right && canvasY >= area.top && canvasY <= area.bottom) {
        chartRef._crosshairX = canvasX;
        chartRef._crosshairY = canvasY;
        chartRef.draw();
      }
      return;
    }
    
    // If actively panning, just pan (no crosshair)
    if (this.mouseStart && this.gestureType === 'pan') {
      const deltaX = event.clientX - this.mouseStart.x;
      const deltaY = event.clientY - this.mouseStart.y;
      this.handlePan(deltaX, deltaY, chartRef);
      this.mouseStart.x = event.clientX;
      this.mouseStart.y = event.clientY;
      return;
    }
  }

  onMouseUp(event: MouseEvent, chartRef: ChartRefLike): void {
    const wasStart = this.mouseStart;
    const elapsed = wasStart ? Date.now() - wasStart.time : 9999;
    const origin = this.mouseStartOrigin;
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
      if (isClick && this.crosshairPersisted) {
        chartRef._crosshairX = null;
        chartRef._crosshairY = null;
        this.crosshairPersisted = false;
      }
      // Pan never creates crosshair

      chartRef.update('none');
      this.updateCandleWidth(chartRef);
    }
  }

  onMouseLeave(chartRef: ChartRefLike): void {
    // Only clear crosshair if not persisted
    if (chartRef && !this.crosshairPersisted) {
      chartRef._crosshairX = null;
      chartRef._crosshairY = null;
      chartRef.draw();
    }
  }

  onWheel(event: WheelEvent, chartRef: ChartRefLike): void {
    event.preventDefault();
    if (!chartRef) return;
    // Block zoom while crosshair is active
    if (this.crosshairPersisted) return;
    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
    this.zoomHorizontal(zoomFactor, chartRef);
  }

  // (public zoom/pan methods appear before private helpers to satisfy lint ordering rule)

  zoomHorizontal(factor: number, chartRef: ChartRefLike): void {
    const xScale = chartRef.scales.x; if (!xScale) return;
    const currentRange = xScale.max - xScale.min; const center = (xScale.max + xScale.min)/2;
    let newRange = currentRange * factor;
    const data = chartRef.data.datasets[0]?.data || [];
    if (!data.length) return;
    const totalRange = this.fullDataRange.max - this.fullDataRange.min;
    const avgWidth = totalRange / data.length;
    const minRange = avgWidth * this.MIN_CANDLES_VISIBLE;
    const maxRange = totalRange * 0.98;
    newRange = Math.max(minRange, Math.min(maxRange, newRange));
    let newMin = center - newRange/2; let newMax = center + newRange/2;
    const extMin = this.extendedDataRange.min; const extMax = this.extendedDataRange.max;
    const extWidth = extMax - extMin;
    if (newRange > extWidth) { newRange = extWidth; newMin = extMin; newMax = extMax; }
    if (newMin < extMin) { newMin = extMin; newMax = newMin + newRange; }
    if (newMax > extMax) { newMax = extMax; newMin = newMax - newRange; }
    xScale.options.min = newMin; xScale.options.max = newMax;
    this.autoFitYScale(chartRef); this.syncIndicatorAxis(chartRef);
    this.scheduleInteractionUpdate(chartRef);
  }

  zoomVertical(factor: number, chartRef: ChartRefLike): void {
    const yScale = chartRef.scales.y; if (!yScale) return;
    const currentRange = yScale.max - yScale.min; const center = (yScale.max + yScale.min)/2;
    const newRange = Math.max(currentRange * factor, 0.000001);
    yScale.options.min = center - newRange/2; yScale.options.max = center + newRange/2;
    this.syncIndicatorAxis(chartRef); this.scheduleInteractionUpdate(chartRef);
  }

  autoFitYScale(chartRef: ChartRefLike): void {
    const xScale = chartRef.scales.x; const yScale = chartRef.scales.y;
    const data = chartRef.data.datasets[0]?.data || [];
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
    const buffer = (maxY - minY) * 0.05;
    yScale.options.min = minY - buffer; yScale.options.max = maxY + buffer;
    this.syncIndicatorAxis(chartRef);
    this.setYAxisStep(chartRef);
  }

  resetZoom(chartRef: ChartRefLike, candleData: CandleLike[]): void {
    if (!chartRef || !candleData?.length) return;
    const initialVisible = Math.min(100, candleData.length);
    const visibleData = candleData.slice(-initialVisible);
    const xMin = visibleData[0].x; const xMax = visibleData[visibleData.length -1].x;
    const highs = visibleData.map((c) => c.h ?? Number.NEGATIVE_INFINITY); const lows = visibleData.map((c) => c.l ?? Number.POSITIVE_INFINITY);
    const yMin = Math.min(...lows); const yMax = Math.max(...highs); const yBuffer = (yMax - yMin) * 0.05;
    chartRef.scales.x.options.min = xMin; chartRef.scales.x.options.max = xMax;
    chartRef.scales.y.options.min = yMin - yBuffer; chartRef.scales.y.options.max = yMax + yBuffer;
    this.layoutService.invalidateTickCache();
    this.syncIndicatorAxis(chartRef); this.setYAxisStep(chartRef); this.setXAxisLabelDensity(chartRef);
    chartRef.update('none'); this.updateCandleWidth(chartRef);
  }

  fitToData(chartRef: ChartRefLike): void {
    if (!chartRef) return;
    chartRef.scales.x.options.min = this.fullDataRange.min;
    chartRef.scales.x.options.max = this.fullDataRange.max;
    const yBuffer = this.initialYRange.max - this.initialYRange.min;
    chartRef.scales.y.options.min = this.initialYRange.min - yBuffer;
    chartRef.scales.y.options.max = this.initialYRange.max + yBuffer;
    this.layoutService.invalidateTickCache();
    this.syncIndicatorAxis(chartRef); this.setYAxisStep(chartRef); this.setXAxisLabelDensity(chartRef);
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
    if (this.isInteracting && !xRangeChanged && countChangedPct < 0.05 && this.interactionFrameCounter % 6 !== 0) return;
    
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
  private handleHorizontalZoomSwipe(deltaX: number, chartRef: ChartRefLike): void {
    const sensitivity = 0.003; const zoomFactor = 1 + deltaX * sensitivity; const constrained = Math.max(0.95, Math.min(1.05, zoomFactor));
    this.zoomHorizontal(constrained, chartRef);
  }
  private handleVerticalZoomSwipe(deltaY: number, chartRef: ChartRefLike): void {
    const sensitivity = 0.004; const zoomFactor = 1 + deltaY * sensitivity; const constrained = Math.max(0.95, Math.min(1.05, zoomFactor));
    this.zoomVertical(constrained, chartRef);
  }
  private handlePan(deltaX: number, deltaY: number, chartRef: ChartRefLike): void {
    const xScale = chartRef.scales.x; const yScale = chartRef.scales.y; if (!xScale || !yScale) return;
    const xRange = xScale.max - xScale.min; const yRange = yScale.max - yScale.min;
    const xPanAmount = (deltaX / chartRef.width) * xRange * this.PAN_SENSITIVITY; const yPanAmount = (deltaY / chartRef.height) * yRange * this.PAN_SENSITIVITY;
    let newXMin = xScale.min - xPanAmount; let newXMax = xScale.max - xPanAmount;
    const extMin = this.extendedDataRange.min; const extMax = this.extendedDataRange.max; const rangeWidth = newXMax - newXMin;
    if (newXMin < extMin) { newXMin = extMin; newXMax = newXMin + rangeWidth; }
    if (newXMax > extMax) { newXMax = extMax; newXMin = newXMax - rangeWidth; }
    xScale.options.min = newXMin; xScale.options.max = newXMax; yScale.options.min = yScale.min + yPanAmount; yScale.options.max = yScale.max + yPanAmount;
    this.syncIndicatorAxis(chartRef); this.setYAxisStep(chartRef); this.scheduleInteractionUpdate(chartRef);
  }
  private handlePinchZoom(touches: TouchList, chartRef: ChartRefLike): void {
    const currentDistance = this.getTouchDistance(touches); const zoomFactor = currentDistance / this.initialPinchDistance;
    this.zoomHorizontal(1 / zoomFactor, chartRef); this.zoomVertical(1 / zoomFactor, chartRef); this.initialPinchDistance = currentDistance;
  }
  private getTouchDistance(touches: TouchList): number {
    const t1 = touches[0]; const t2 = touches[1]; return Math.sqrt(Math.pow(t2.clientX - t1.clientX,2) + Math.pow(t2.clientY - t1.clientY,2));
  }
  private isTouchInAxisArea(touchPoint: { x: number; y: number }, chartRef: ChartRefLike): boolean {
    if (!chartRef || !chartRef.chartArea) return false; const rect = chartRef.canvas.getBoundingClientRect(); const chartArea = chartRef.chartArea;
    const canvasX = touchPoint.x - rect.left; const canvasY = touchPoint.y - rect.top; const inX = canvasX >= chartArea.left && canvasX <= chartArea.right && (canvasY < chartArea.top || canvasY > chartArea.bottom);
    const inY = canvasY >= chartArea.top && canvasY <= chartArea.bottom && (canvasX < chartArea.left || canvasX > chartArea.right); return inX || inY;
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
    if (!this.isInteracting) { chartRef.update('none'); this.updateCandleWidth(chartRef); return; }
    if (this.interactionUpdateScheduled) return;
    this.interactionUpdateScheduled = true;
    const run: () => void = () => {
      this.interactionUpdateScheduled = false;
      this.setYAxisStep(chartRef);
      this.setXAxisLabelDensity(chartRef);
      chartRef.update('none');
      this.updateCandleWidth(chartRef);
      try { this.onAfterInteractionUpdate?.(chartRef); } catch {}
    };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run); else setTimeout(run,16);
  }

  // Tick step helpers inside interaction service so all zoom/pan updates keep labels clean
  private computeNiceStep(range: number, desiredTicks = 7): number {
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
    return Math.max(step, 1e-8);
  }

  private setYAxisStep(chartRef: ChartRefLike): void {
    try {
      if (!chartRef?.scales?.y) return;
      const yScale = chartRef.scales.y;
      const min = typeof yScale.min === 'number' ? yScale.min : (yScale.options?.min ?? 0);
      const max = typeof yScale.max === 'number' ? yScale.max : (yScale.options?.max ?? min + 1);
      // Use adaptive tick calculation from layout service
      // Get chart dimensions (chartArea is the drawable region, accounting for padding/margins)
      const chartArea = chartRef.chartArea;
      const chartHeight = chartArea ? chartArea.bottom - chartArea.top : chartRef.height || 400;
      const chartWidth = chartArea ? chartArea.right - chartArea.left : chartRef.width || 800;

      // Calculate adaptive step size and max ticks based on chart size and visible range
      const { stepSize, maxTicksLimit } = this.layoutService.calculateAdaptiveYAxisStep(
        min,
        max,
        chartHeight,
        chartWidth,
      );

      // Apply to chart configuration
      chartRef.config = chartRef.config || { options: { scales: {} } };
      chartRef.config.options = chartRef.config.options || { scales: {} };
      chartRef.config.options.scales = chartRef.config.options.scales || {};
      chartRef.config.options.scales['y'] = chartRef.config.options.scales['y'] || {};
      chartRef.config.options.scales['y'].ticks = chartRef.config.options.scales['y'].ticks || {};
      chartRef.config.options.scales['y'].ticks.stepSize = stepSize;
      chartRef.config.options.scales['y'].ticks.autoSkip = true;
      chartRef.config.options.scales['y'].ticks.maxTicksLimit = maxTicksLimit;
    } catch {}
  }

  /**
   * Apply adaptive X-axis time label density based on visible candle count.
   * Calculates label spacing so more labels appear when zoomed in, fewer when zoomed out.
   * Called after pan/zoom to refresh time label density.
   * 
   * SAFE: does not modify pan/zoom/data-loading; only changes label display spacing.
   */
  private setXAxisLabelDensity(chartRef: ChartRefLike): void {
    try {
      if (!chartRef?.scales?.x || !chartRef?.data?.datasets?.[0]?.data) return;

      const xScale = chartRef.scales.x;
      const data = chartRef.data.datasets[0].data;

      // Get drawable area dimensions
      const chartArea = chartRef.chartArea;
      const chartWidth = chartArea ? chartArea.right - chartArea.left : chartRef.width || 800;

      // Find visible candle range
      const visibleData = (data as CandleLike[]).filter((c) => c.x >= xScale.min && c.x <= xScale.max);
      if (visibleData.length < 2) return;

      const visibleBars = visibleData.length;
      const isMobile = chartWidth < 600;

      // Calculate how many bars to skip between time labels (HIGH DENSITY: 35–45px per label)
      const barsPerLabel = this.layoutService.calculateAdaptiveXAxisLabelInterval(
        visibleBars,
        chartWidth,
        isMobile,
      );

      // Calculate target number of labels (2–3× more than baseline)
      const targetLabelCount = Math.max(4, Math.ceil(visibleBars / barsPerLabel));

      // Apply to chart X-axis configuration
      chartRef.config = chartRef.config || { options: { scales: {} } };
      chartRef.config.options = chartRef.config.options || { scales: {} };
      chartRef.config.options.scales = chartRef.config.options.scales || {};
      chartRef.config.options.scales['x'] = chartRef.config.options.scales['x'] || {};
      chartRef.config.options.scales['x'].ticks = chartRef.config.options.scales['x'].ticks || {};

      // Set max ticks limit to allow Chart.js auto-skip with collision prevention
      // Use generous limit so Chart.js shows enough labels on mobile
      chartRef.config.options.scales['x'].ticks.maxTicksLimit = Math.max(8, targetLabelCount + 3);
      chartRef.config.options.scales['x'].ticks.autoSkip = true;
      chartRef.config.options.scales['x'].ticks.autoSkipPadding = 8;
    } catch {}
  }
}
