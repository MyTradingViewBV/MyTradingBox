/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { NgChartsModule, BaseChartDirective } from 'ng2-charts';
import {
  Chart as ChartJS,
  TimeScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
} from 'chart.js';
import {
  CandlestickController,
  CandlestickElement,
} from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
import {
  MarketService,
  SymbolModel,
} from '../../modules/shared/http/market.service';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AppService } from '../../modules/shared/http/appService';
import { AppActions } from '../../store/app.actions';
import { tap, switchMap, map } from 'rxjs';

//
// 📍 Crosshair plugin for better interactivity
//
const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart: any): void {
    if (chart.tooltip?._active?.length) {
      const ctx = chart.ctx;
      const x = chart.tooltip._active[0].element.x;
      const y = chart.tooltip._active[0].element.y;

      ctx.save();
      ctx.beginPath();
      // vertical line
      ctx.moveTo(x, chart.chartArea.top);
      ctx.lineTo(x, chart.chartArea.bottom);
      // horizontal line
      ctx.moveTo(chart.chartArea.left, y);
      ctx.lineTo(chart.chartArea.right, y);

      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#555';
      ctx.stroke();
      ctx.restore();
    }
  },
};

//
// 📍 Register Chart.js controllers and plugins
//
ChartJS.register(
  TimeScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
  CandlestickController,
  CandlestickElement,
  zoomPlugin,
  crosshairPlugin,
);

@Component({
  selector: 'app-chart-simple',
  standalone: true,
  imports: [
    CommonModule,
    NgChartsModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  templateUrl: 'chart-simple-component.html',
  styleUrls: ['chart-simple-component.scss'],
})
export class ChartSimpleComponent implements OnInit {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;
  @ViewChild('chartCanvas', { read: ElementRef }) chartCanvas?: ElementRef;
  showSettings = false;
  chartData: any = { datasets: [] };
  boxes: any[] = [];

  // Touch/gesture tracking (simplified)
  isInteracting = false;
  gestureType: 'pan' | 'zoom-x' | 'zoom-y' | 'pinch' | null = null;
  touchStart: { x: number; y: number; time: number } | null = null;
  mouseStart: { x: number; y: number; time: number } | null = null;
  lastTouches: TouchList | null = null;
  initialPinchDistance = 0;
  fullDataRange: { min: number; max: number } = { min: 0, max: 0 };
  initialYRange: { min: number; max: number } = { min: 0, max: 0 };

  // TradingView-style interface data
  selectedSymbol: SymbolModel = new SymbolModel();
  selectedTimeframe = '1d';
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

  symbols: SymbolModel[] = [];
  // selectedSymbol: SymbolModel = new SymbolModel(); // ✅ now full object
  showBoxes = true;

  // Chart constraints
  readonly MIN_CANDLES_VISIBLE = 10;
  readonly PAN_SENSITIVITY = 1.0;

  //
  // 📊 Simplified chart options for TradingView look
  //
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
        display: true, // Hide x-axis for cleaner look
      },
      y: {
        position: 'right',
        beginAtZero: false,
        grid: {
          color: '#1a1a1a',
          borderColor: 'transparent',
          drawBorder: false,
        },
        ticks: {
          color: '#666',
          callback: (val: any) => Number(val).toFixed(2),
          maxTicksLimit: 8,
          padding: 10,
        },
      },
    },
    layout: {
      backgroundColor: '#131722',
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
    },
  };

  constructor(
    private marketService: MarketService,
    private _appService: AppService,
  ) {}

  ngOnInit(): void {
    this.loadSymbols();
    //this.getBoxes();
  }

  getBoxes(): void {
    this.marketService
      .getBoxesV2(this.selectedSymbol.SymbolName, '1d')
      .subscribe((arr) => {
        this.boxes = arr.filter(
          (b: any) => ((b.Type || b.type || '') + '').toLowerCase() === 'range',
        );
        console.log('boxes: ', this.boxes);
      });
  }

  onBoxesToggle(): void {
    console.log('🟡 onBoxesToggle triggered. showBoxes =', this.showBoxes);
    // if (this.showBoxes) {
    //   if (this.boxes.length) {
    //     this.addBoxesDatasets(this.baseData);
    //   } else if (this.selectedSymbol?.SymbolName) {
    //     this.marketService
    //       .getBoxesV2(this.selectedSymbol.SymbolName, '1d')
    //       .subscribe({
    //         next: (boxes) => {
    //           this.boxes = boxes.filter(
    //             (b: any) =>
    //               ((b.Type || b.type || '') + '').toLowerCase() === 'range',
    //           );
    //           if (this.boxes.length && this.baseData.length) {
    //             this.addBoxesDatasets(this.baseData);
    //           }
    //         },
    //       });
    //   }
    // } else {
    //   // ✅ Hide boxes
    //   this.chartData.datasets = this.chartData.datasets.filter(
    //     (d: any) => !d.label?.startsWith('Box'),
    //   );
    //   this.chart?.update();
    // }
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }

  loadSymbols(): void {
    this.marketService
      .getSymbols()
      .pipe(
        tap((symbols) => {
          this.availableSymbols = symbols || [];
          console.log('symbols:', symbols);
        }),
        switchMap((symbols) =>
          this._appService.getSelectedSymbol().pipe(
            map((stored) => {
              // ensure stored is a valid SymbolModel
              if (stored && stored.SymbolName) {
                return stored;
              }
              console.warn(
                '⚠️ No valid stored symbol, using first:',
                symbols[0],
              );
              this._appService.dispatchAppAction(
                AppActions.setSelectedSymbol({ symbol: symbols[0] }),
              );
              return symbols[0];
            }),
            tap((selected) => (this.selectedSymbol = selected)),
            map((selected) => selected.SymbolName),
          ),
        ),
      )
      .subscribe((symbolName) => {
        console.log('▶️ Loading candles for:', symbolName);
        this.loadCandles(symbolName);
      });
  }

  onSymbolChange(symbol: SymbolModel): void {
    this._appService.dispatchAppAction(
      AppActions.setSelectedSymbol({ symbol: symbol }),
    );
    this.loadCandles(symbol.SymbolName);
  }

  onTimeframeChange(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    if (this.selectedSymbol) {
      this.loadCandles(this.selectedSymbol.SymbolName);
    }
  }

  //
  // 📈 Load chart data and update price info
  //
  loadCandles(symbol: string): void {
    console.log('SSS', symbol);
    this.marketService
      .getCandles(symbol, this.selectedTimeframe, 1000)
      .subscribe((candles) => {
        const mapped = candles.map((c) => ({
          x: new Date(c.Time).getTime(),
          o: c.Open,
          h: c.High,
          l: c.Low,
          c: c.Close,
        }));

        if (!mapped.length) return;

        // Update price information
        const latestCandle = mapped[mapped.length - 1];
        const previousCandle = mapped[mapped.length - 2];

        this.currentPrice = latestCandle.c;
        this.priceChange = previousCandle
          ? latestCandle.c - previousCandle.c
          : 0;
        this.priceChangeFormatted = this.formatPriceChange(
          this.priceChange,
          previousCandle?.c || 0,
        );

        // Simulate buy/sell prices (spread)
        this.spread = this.currentPrice * 0.001; // 0.1% spread
        this.sellPrice = this.currentPrice - this.spread / 2;
        this.buyPrice = this.currentPrice + this.spread / 2;

        // Store full data range
        this.fullDataRange = {
          min: mapped[0].x,
          max: mapped[mapped.length - 1].x,
        };

        const allHighs = mapped.map((c) => c.h);
        const allLows = mapped.map((c) => c.l);
        this.initialYRange = {
          min: Math.min(...allLows),
          max: Math.max(...allHighs),
        };

        this.chartData = {
          datasets: [
            {
              label: `${symbol} ${this.selectedTimeframe.toUpperCase()}`,
              data: mapped,
              type: 'candlestick',
              borderColor: {
                up: '#26a69a',
                down: '#ef5350',
                unchanged: '#999',
              },
              backgroundColor: {
                up: '#26a69a',
                down: '#ef5350',
                unchanged: '#999',
              },
            },
          ],
        };

        setTimeout(() => {
          this.initializeChart(mapped);
        }, 100);
      });
  }

  formatPriceChange(change: number, previousPrice: number): string {
    const changePercent = previousPrice ? (change / previousPrice) * 100 : 0;
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
  }

  initializeChart(data: any[]): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef) return;

    // Show last 100 candles initially for better mobile view
    const initialVisible = Math.min(100, data.length);
    const visibleData = data.slice(-initialVisible);

    const xMin = visibleData[0].x;
    const xMax = visibleData[visibleData.length - 1].x;

    const visibleHighs = visibleData.map((c) => c.h);
    const visibleLows = visibleData.map((c) => c.l);
    const yMin = Math.min(...visibleLows);
    const yMax = Math.max(...visibleHighs);
    const yBuffer = (yMax - yMin) * 0.05;

    chartRef.scales.x.options.min = xMin;
    chartRef.scales.x.options.max = xMax;
    chartRef.scales.y.options.min = yMin - yBuffer;
    chartRef.scales.y.options.max = yMax + yBuffer;

    chartRef.update('none');
  }

  //
  // 🎯 Touch Event Handlers - With Axis-Only Single Finger Zoom
  //
  onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    this.isInteracting = true;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
      this.gestureType = null; // Will be determined by movement direction and location
    } else if (event.touches.length === 2) {
      this.gestureType = 'pinch';
      this.lastTouches = event.touches;
      this.initialPinchDistance = this.getTouchDistance(event.touches);
    }
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (!this.chart?.chart || !this.touchStart) return;
    const chartRef = this.chart.chart as any;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.touchStart.x;
      const deltaY = touch.clientY - this.touchStart.y;

      // Check if touch started in axis area for zoom gestures
      if (
        !this.gestureType &&
        this.isTouchInAxisArea(this.touchStart, chartRef)
      ) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > 15 || absY > 15) {
          // Minimum threshold before detecting direction
          if (absX > absY) {
            this.gestureType = 'zoom-x'; // Horizontal swipe = zoom X (candle width)
          } else {
            this.gestureType = 'zoom-y'; // Vertical swipe = zoom Y (candle height)
          }
        }
      } else if (
        !this.gestureType &&
        !this.isTouchInAxisArea(this.touchStart, chartRef)
      ) {
        // Touch started in canvas area - enable panning
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > 10 || absY > 10) {
          // Lower threshold for pan detection
          this.gestureType = 'pan';
        }
      }

      // Apply gesture-specific action
      if (this.gestureType === 'zoom-x') {
        // Horizontal swipe = adjust candle width (zoom X-axis) - only in axis area
        this.handleHorizontalZoomSwipe(deltaX, chartRef);
        this.touchStart.x = touch.clientX; // Update for continuous gesture
      } else if (this.gestureType === 'zoom-y') {
        // Vertical swipe = adjust candle height (zoom Y-axis) - only in axis area
        this.handleVerticalZoomSwipe(deltaY, chartRef);
        this.touchStart.y = touch.clientY; // Update for continuous gesture
      } else if (this.gestureType === 'pan') {
        // Pan functionality for canvas area
        this.handlePan(deltaX, deltaY, chartRef);
        this.touchStart.x = touch.clientX; // Update for continuous panning
        this.touchStart.y = touch.clientY;
      }
    } else if (
      event.touches.length === 2 &&
      this.lastTouches &&
      this.gestureType === 'pinch'
    ) {
      this.handlePinchZoom(event.touches, chartRef);
    }
  }

  onTouchEnd(event: TouchEvent): void {
    console.log(event);
    this.isInteracting = false;
    this.gestureType = null;
    this.touchStart = null;
    this.lastTouches = null;
    this.initialPinchDistance = 0;
  }

  //
  // 🖱️ Mouse events
  //
  onMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      this.mouseStart = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      };
      this.isInteracting = true;
      this.gestureType = 'pan';
    }
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.mouseStart || !this.chart?.chart || this.gestureType !== 'pan')
      return;

    const chartRef = this.chart.chart as any;
    const deltaX = event.clientX - this.mouseStart.x;
    const deltaY = event.clientY - this.mouseStart.y;

    this.handlePan(deltaX, deltaY, chartRef);
    this.mouseStart.x = event.clientX;
    this.mouseStart.y = event.clientY;
  }

  onMouseUp(event: MouseEvent): void {
    console.log(event);
    this.isInteracting = false;
    this.gestureType = null;
    this.mouseStart = null;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();

    if (!this.chart?.chart) return;
    const chartRef = this.chart.chart as any;

    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
    this.zoomHorizontal(zoomFactor, chartRef);
  }

  //
  // 🎯 Helper method to detect if touch is in axis area
  //
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

  //
  // 🎯 Single Finger Zoom Handlers
  //
  handleHorizontalZoomSwipe(deltaX: number, chartRef: any): void {
    // TradingView style: Right swipe = zoom out (wider candles), Left swipe = zoom in (narrower candles)
    const sensitivity = 0.003; // Fine-tuned for natural feel
    const zoomFactor = 1 + deltaX * sensitivity;

    // Constrain zoom factor to prevent extreme changes
    const constrainedFactor = Math.max(0.95, Math.min(1.05, zoomFactor));

    this.zoomHorizontal(constrainedFactor, chartRef);
  }

  handleVerticalZoomSwipe(deltaY: number, chartRef: any): void {
    // TradingView style: Down swipe = zoom out (shorter candles), Up swipe = zoom in (taller candles)
    const sensitivity = 0.004; // Slightly higher sensitivity for Y-axis
    const zoomFactor = 1 - deltaY * sensitivity; // Inverted for natural feel

    // Constrain zoom factor to prevent extreme changes
    const constrainedFactor = Math.max(0.95, Math.min(1.05, zoomFactor));

    this.zoomVertical(constrainedFactor, chartRef);
  }

  //
  // 🔧 Core interaction methods
  //
  handlePan(deltaX: number, deltaY: number, chartRef: any): void {
    const xScale = chartRef.scales.x;
    const yScale = chartRef.scales.y;

    if (!xScale || !yScale) return;

    const xRange = xScale.max - xScale.min;
    const yRange = yScale.max - yScale.min;

    const xPanAmount =
      (deltaX / chartRef.width) * xRange * this.PAN_SENSITIVITY;
    const yPanAmount =
      (deltaY / chartRef.height) * yRange * this.PAN_SENSITIVITY;

    const newXMin = xScale.min - xPanAmount;
    const newXMax = xScale.max - xPanAmount;

    if (
      newXMin >= this.fullDataRange.min &&
      newXMax <= this.fullDataRange.max
    ) {
      xScale.options.min = newXMin;
      xScale.options.max = newXMax;
    }

    yScale.options.min = yScale.min + yPanAmount;
    yScale.options.max = yScale.max + yPanAmount;

    chartRef.update('none');
  }

  handlePinchZoom(touches: TouchList, chartRef: any): void {
    if (!this.lastTouches) return;

    const currentDistance = this.getTouchDistance(touches);
    const zoomFactor = currentDistance / this.initialPinchDistance;

    this.zoomHorizontal(1 / zoomFactor, chartRef);
    this.zoomVertical(1 / zoomFactor, chartRef);

    this.initialPinchDistance = currentDistance;
  }

  getTouchDistance(touches: TouchList): number {
    const touch1 = touches[0];
    const touch2 = touches[1];
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2),
    );
  }

  zoomHorizontal(factor: number, chartRef: any): void {
    const xScale = chartRef.scales.x;
    if (!xScale) return;

    const currentRange = xScale.max - xScale.min;
    const center = (xScale.max + xScale.min) / 2;

    let newRange = currentRange * factor;

    const data = chartRef.data.datasets[0]?.data || [];
    if (!data.length) return;

    const totalRange = this.fullDataRange.max - this.fullDataRange.min;
    const avgCandleWidth = totalRange / data.length;
    const minRange = avgCandleWidth * this.MIN_CANDLES_VISIBLE;
    const maxRange = totalRange * 0.98;

    newRange = Math.max(minRange, Math.min(maxRange, newRange));

    let newMin = center - newRange / 2;
    let newMax = center + newRange / 2;

    if (newMin < this.fullDataRange.min) {
      newMin = this.fullDataRange.min;
      newMax = newMin + newRange;
    }
    if (newMax > this.fullDataRange.max) {
      newMax = this.fullDataRange.max;
      newMin = newMax - newRange;
    }

    xScale.options.min = newMin;
    xScale.options.max = newMax;

    this.autoFitYScale(chartRef);
    chartRef.update('none');
  }

  zoomVertical(factor: number, chartRef: any): void {
    const yScale = chartRef.scales.y;
    if (!yScale) return;

    const currentRange = yScale.max - yScale.min;
    const center = (yScale.max + yScale.min) / 2;
    const newRange = Math.max(currentRange * factor, 0.000001);

    yScale.options.min = center - newRange / 2;
    yScale.options.max = center + newRange / 2;

    chartRef.update('none');
  }

  autoFitYScale(chartRef: any): void {
    const xScale = chartRef.scales.x;
    const yScale = chartRef.scales.y;
    const data = chartRef.data.datasets[0]?.data || [];

    if (!data.length || !xScale || !yScale) return;

    const visibleCandles = data.filter(
      (candle: any) => candle.x >= xScale.min && candle.x <= xScale.max,
    );

    if (!visibleCandles.length) return;

    const highs = visibleCandles.map((c: any) => c.h);
    const lows = visibleCandles.map((c: any) => c.l);
    const maxY = Math.max(...highs);
    const minY = Math.min(...lows);

    const buffer = (maxY - minY) * 0.05;

    yScale.options.min = minY - buffer;
    yScale.options.max = maxY + buffer;
  }

  //
  // 🎮 Public methods for toolbar
  //
  resetZoom(): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef || !this.chartData.datasets[0]?.data.length) return;

    this.initializeChart(this.chartData.datasets[0].data);
  }

  fitToData(): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef) return;

    chartRef.scales.x.options.min = this.fullDataRange.min;
    chartRef.scales.x.options.max = this.fullDataRange.max;

    const yBuffer = (this.initialYRange.max - this.initialYRange.min) * 0.05;
    chartRef.scales.y.options.min = this.initialYRange.min - yBuffer;
    chartRef.scales.y.options.max = this.initialYRange.max + yBuffer;

    chartRef.update('none');
  }

  onChartDblClick(): void {
    if (!this.chart?.chart) return;
    this.autoFitYScale(this.chart.chart as any);
    (this.chart.chart as any).update('none');
  }
}
