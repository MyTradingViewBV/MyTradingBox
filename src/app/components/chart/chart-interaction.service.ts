/* Interaction logic extracted from ChartComponent.
   Handles touch, mouse, wheel gestures and scale adjustments.
   The component injects this service and forwards events.
*/
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';

export type GestureKind = 'pan' | 'zoom-x' | 'zoom-y' | 'pinch' | null;

export interface CandleLike { x: number; h?: number; l?: number; }

@Injectable({ providedIn: 'root' })
export class ChartInteractionService {
  readonly MIN_CANDLES_VISIBLE = 10;
  readonly PAN_SENSITIVITY = 1.0;

  // runtime interaction state
  isInteracting = false;
  gestureType: GestureKind = null;
  touchStart: { x: number; y: number; time: number } | null = null;
  mouseStart: { x: number; y: number; time: number } | null = null;
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

  setRanges(full: { min: number; max: number }, extended: { min: number; max: number }, initialY: { min: number; max: number }): void {
    this.fullDataRange = full;
    this.extendedDataRange = extended;
    this.initialYRange = initialY;
  }

  // Touch handlers
  onTouchStart(event: TouchEvent, chartRef: any): void {
    event.preventDefault();
    this.isInteracting = true;
    if (chartRef) chartRef._isInteracting = true;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      this.gestureType = null;
    } else if (event.touches.length === 2) {
      this.gestureType = 'pinch';
      this.lastTouches = event.touches;
      this.initialPinchDistance = this.getTouchDistance(this.lastTouches);
    }
  }

  onTouchMove(event: TouchEvent, chartRef: any): void {
    event.preventDefault();
    if (!chartRef || !this.touchStart) return;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.touchStart.x;
      const deltaY = touch.clientY - this.touchStart.y;

      if (!this.gestureType && this.isTouchInAxisArea(this.touchStart, chartRef)) {
        const absX = Math.abs(deltaX); const absY = Math.abs(deltaY);
        if (absX > 15 || absY > 15) {
          this.gestureType = absX > absY ? 'zoom-x' : 'zoom-y';
        }
      } else if (!this.gestureType && !this.isTouchInAxisArea(this.touchStart, chartRef)) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) this.gestureType = 'pan';
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

  onTouchEnd(_: TouchEvent, chartRef: any): void {
    this.isInteracting = false;
    this.gestureType = null;
    this.touchStart = null;
    this.lastTouches = null;
    this.initialPinchDistance = 0;
    if (chartRef) {
      chartRef._isInteracting = false;
      chartRef.update('none');
      this.updateCandleWidth(chartRef);
    }
  }

  // Mouse handlers
  onMouseDown(event: MouseEvent, chartRef: any): void {
    if (event.button === 0) {
      this.mouseStart = { x: event.clientX, y: event.clientY, time: Date.now() };
      this.isInteracting = true;
      this.gestureType = 'pan';
      if (chartRef) chartRef._isInteracting = true;
    }
  }

  onMouseMove(event: MouseEvent, chartRef: any): void {
    if (!this.mouseStart || !chartRef || this.gestureType !== 'pan') return;
    const deltaX = event.clientX - this.mouseStart.x;
    const deltaY = event.clientY - this.mouseStart.y;
    this.handlePan(deltaX, deltaY, chartRef);
    this.mouseStart.x = event.clientX;
    this.mouseStart.y = event.clientY;
  }

  onMouseUp(_: MouseEvent, chartRef: any): void {
    this.isInteracting = false;
    this.gestureType = null;
    this.mouseStart = null;
    if (chartRef) {
      chartRef._isInteracting = false;
      chartRef.update('none');
      this.updateCandleWidth(chartRef);
    }
  }

  onWheel(event: WheelEvent, chartRef: any): void {
    event.preventDefault();
    if (!chartRef) return;
    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
    this.zoomHorizontal(zoomFactor, chartRef);
  }

  // (public zoom/pan methods appear before private helpers to satisfy lint ordering rule)

  zoomHorizontal(factor: number, chartRef: any): void {
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

  zoomVertical(factor: number, chartRef: any): void {
    const yScale = chartRef.scales.y; if (!yScale) return;
    const currentRange = yScale.max - yScale.min; const center = (yScale.max + yScale.min)/2;
    const newRange = Math.max(currentRange * factor, 0.000001);
    yScale.options.min = center - newRange/2; yScale.options.max = center + newRange/2;
    this.syncIndicatorAxis(chartRef); this.scheduleInteractionUpdate(chartRef);
  }

  autoFitYScale(chartRef: any): void {
    const xScale = chartRef.scales.x; const yScale = chartRef.scales.y;
    const data = chartRef.data.datasets[0]?.data || [];
    if (!data.length || !xScale || !yScale) return;
    const visible = data.filter((c: any) => c.x >= xScale.min && c.x <= xScale.max);
    if (!visible.length) return;
    const highs = visible.map((c: any) => c.h); const lows = visible.map((c: any) => c.l);
    // include order lines so they stay in view
    try {
      const orderLevels: number[] = [];
      (chartRef.data.datasets || []).forEach((ds: any) => {
        if (ds && ds.isOrder && Array.isArray(ds.data)) {
          ds.data.forEach((pt: any) => { const yVal = pt?.y ?? pt?.Price; if (typeof yVal === 'number') orderLevels.push(yVal); });
        }
      });
      highs.push(...orderLevels); lows.push(...orderLevels);
    } catch {}
    const maxY = Math.max(...highs); const minY = Math.min(...lows);
    const buffer = (maxY - minY) * 0.05;
    yScale.options.min = minY - buffer; yScale.options.max = maxY + buffer;
    this.syncIndicatorAxis(chartRef);
  }

  resetZoom(chartRef: any, candleData: any[]): void {
    if (!chartRef || !candleData?.length) return;
    const initialVisible = Math.min(100, candleData.length);
    const visibleData = candleData.slice(-initialVisible);
    const xMin = visibleData[0].x; const xMax = visibleData[visibleData.length -1].x;
    const highs = visibleData.map((c: any) => c.h); const lows = visibleData.map((c: any) => c.l);
    const yMin = Math.min(...lows); const yMax = Math.max(...highs); const yBuffer = (yMax - yMin) * 0.05;
    chartRef.scales.x.options.min = xMin; chartRef.scales.x.options.max = xMax;
    chartRef.scales.y.options.min = yMin - yBuffer; chartRef.scales.y.options.max = yMax + yBuffer;
    chartRef.update('none'); this.syncIndicatorAxis(chartRef); this.updateCandleWidth(chartRef);
  }

  fitToData(chartRef: any): void {
    if (!chartRef) return;
    chartRef.scales.x.options.min = this.fullDataRange.min;
    chartRef.scales.x.options.max = this.fullDataRange.max;
    const yBuffer = this.initialYRange.max - this.initialYRange.min;
    chartRef.scales.y.options.min = this.initialYRange.min - yBuffer;
    chartRef.scales.y.options.max = this.initialYRange.max + yBuffer;
    this.syncIndicatorAxis(chartRef); chartRef.update('none'); this.updateCandleWidth(chartRef);
  }

  // Hidden indicator axis sync (public)
  syncIndicatorAxis(chartRef: any): void {
    try {
      const yScale = chartRef.scales.y; if (!yScale) return;
      const yMin = typeof yScale.min === 'number' ? yScale.min : yScale.options?.min;
      const yMax = typeof yScale.max === 'number' ? yScale.max : yScale.options?.max;
      if (!isFinite(yMin) || !isFinite(yMax)) return;
      chartRef.config = chartRef.config || {}; chartRef.config.options = chartRef.config.options || {};
      chartRef.config.options.scales = chartRef.config.options.scales || {};
      chartRef.config.options.scales.indicator = chartRef.config.options.scales.indicator || {};
      chartRef.config.options.scales.indicator.min = yMin; chartRef.config.options.scales.indicator.max = yMax;
      const ind = chartRef.scales.indicator; if (ind) { ind.options = ind.options || {}; ind.options.min = yMin; ind.options.max = yMax; ind.min = yMin; ind.max = yMax; }
    } catch {}
  }

  // Candle width logic (public)
  updateCandleWidth(chartRef: any): void {
    if (!chartRef) return;
    const candleDs = chartRef.data.datasets.find((d: any) => d.type === 'candlestick'); if (!candleDs) return;
    const data: any[] = candleDs.data || []; if (!data.length) return;
    const xScale = chartRef.scales.x; if (!xScale || typeof xScale.min !== 'number' || typeof xScale.max !== 'number') return;
    const visible = data.filter(c => c.x >= xScale.min && c.x <= xScale.max); const visibleCount = visible.length; if (visibleCount < 2) return;
    const xRangeChanged = !this.lastXRange || this.lastXRange.min !== xScale.min || this.lastXRange.max !== xScale.max;
    const countChangedPct = this.lastVisibleCount > 0 ? Math.abs(visibleCount - this.lastVisibleCount) / this.lastVisibleCount : 1;
    this.interactionFrameCounter++;
    if (this.isInteracting && !xRangeChanged && countChangedPct < 0.05 && this.interactionFrameCounter % 6 !== 0) return;
    this.lastVisibleCount = visibleCount; this.lastXRange = { min: xScale.min, max: xScale.max };
    let totalGap = 0; for (let i=1;i<visible.length;i++) totalGap += visible[i].x - visible[i-1].x;
    const avgGap = totalGap / (visible.length - 1); if (!isFinite(avgGap) || avgGap <= 0) return;
    const chartArea = chartRef.chartArea; if (!chartArea) return; const areaWidth = chartArea.right - chartArea.left; if (areaWidth <= 0) return;
    const pxPerUnit = areaWidth / (xScale.max - xScale.min); const pxGap = avgGap * pxPerUnit;
    const targetBodyPct = 0.68; let bodyPx = pxGap * targetBodyPct; bodyPx = Math.max(2, Math.min(26, bodyPx));
    candleDs.barPercentage = 0.9; candleDs.categoryPercentage = 0.95; candleDs.maxBarThickness = Math.round(bodyPx);
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
  private handleHorizontalZoomSwipe(deltaX: number, chartRef: any): void {
    const sensitivity = 0.003; const zoomFactor = 1 + deltaX * sensitivity; const constrained = Math.max(0.95, Math.min(1.05, zoomFactor));
    this.zoomHorizontal(constrained, chartRef);
  }
  private handleVerticalZoomSwipe(deltaY: number, chartRef: any): void {
    const sensitivity = 0.004; const zoomFactor = 1 + deltaY * sensitivity; const constrained = Math.max(0.95, Math.min(1.05, zoomFactor));
    this.zoomVertical(constrained, chartRef);
  }
  private handlePan(deltaX: number, deltaY: number, chartRef: any): void {
    const xScale = chartRef.scales.x; const yScale = chartRef.scales.y; if (!xScale || !yScale) return;
    const xRange = xScale.max - xScale.min; const yRange = yScale.max - yScale.min;
    const xPanAmount = (deltaX / chartRef.width) * xRange * this.PAN_SENSITIVITY; const yPanAmount = (deltaY / chartRef.height) * yRange * this.PAN_SENSITIVITY;
    let newXMin = xScale.min - xPanAmount; let newXMax = xScale.max - xPanAmount;
    const extMin = this.extendedDataRange.min; const extMax = this.extendedDataRange.max; const rangeWidth = newXMax - newXMin;
    if (newXMin < extMin) { newXMin = extMin; newXMax = newXMin + rangeWidth; }
    if (newXMax > extMax) { newXMax = extMax; newXMin = newXMax - rangeWidth; }
    xScale.options.min = newXMin; xScale.options.max = newXMax; yScale.options.min = yScale.min + yPanAmount; yScale.options.max = yScale.max + yPanAmount;
    this.syncIndicatorAxis(chartRef); this.scheduleInteractionUpdate(chartRef);
  }
  private handlePinchZoom(touches: TouchList, chartRef: any): void {
    const currentDistance = this.getTouchDistance(touches); const zoomFactor = currentDistance / this.initialPinchDistance;
    this.zoomHorizontal(1 / zoomFactor, chartRef); this.zoomVertical(1 / zoomFactor, chartRef); this.initialPinchDistance = currentDistance;
  }
  private getTouchDistance(touches: TouchList): number {
    const t1 = touches[0]; const t2 = touches[1]; return Math.sqrt(Math.pow(t2.clientX - t1.clientX,2) + Math.pow(t2.clientY - t1.clientY,2));
  }
  private isTouchInAxisArea(touchPoint: { x: number; y: number }, chartRef: any): boolean {
    if (!chartRef || !chartRef.chartArea) return false; const rect = chartRef.canvas.getBoundingClientRect(); const chartArea = chartRef.chartArea;
    const canvasX = touchPoint.x - rect.left; const canvasY = touchPoint.y - rect.top; const inX = canvasX >= chartArea.left && canvasX <= chartArea.right && (canvasY < chartArea.top || canvasY > chartArea.bottom);
    const inY = canvasY >= chartArea.top && canvasY <= chartArea.bottom && (canvasX < chartArea.left || canvasX > chartArea.right); return inX || inY;
  }


  private scheduleInteractionUpdate(chartRef: any): void {
    if (!chartRef) return;
    if (!this.isInteracting) { chartRef.update('none'); this.updateCandleWidth(chartRef); return; }
    if (this.interactionUpdateScheduled) return;
    this.interactionUpdateScheduled = true;
    const run: () => void = () => { this.interactionUpdateScheduled = false; chartRef.update('none'); this.updateCandleWidth(chartRef); };
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(run); else setTimeout(run,16);
  }
}
