/* eslint-disable @typescript-eslint/no-unused-vars */
/* Removed explicit-function-return-type disable (no longer needed) */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { NgChartsModule, BaseChartDirective } from 'ng2-charts';
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
import { chartCustomPlugins } from './chart-plugins';
import { ChartInteractionService, GestureKind } from './chart-interaction.service';
import { formatPriceChange, resolveBoxColors, isBtcSymbol, buildBoxDatasets } from './utils/chart-utils';
import { ChartIndicatorsService } from './services/chart-indicators.service';
import { ChartBoxesService } from './services/chart-boxes.service';
import 'chartjs-adapter-date-fns';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { tap, switchMap, map, of, forkJoin, Observable } from 'rxjs';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { BoxModel } from 'src/app/modules/shared/models/chart/boxModel.dto';
import { OrderModel } from 'src/app/modules/shared/models/orders/order.dto';
import { KeyZonesModel } from 'src/app/modules/shared/models/chart/keyZones.dto';


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
  imports: [
    CommonModule,
    NgChartsModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  templateUrl: './chart-component.html',
  styleUrls: ['./chart-component.scss'],
})
export class ChartComponent implements OnInit {
  // Mark static:true so it's available during ngOnInit (we access the chart soon after data loads)
  @ViewChild(BaseChartDirective, { static: true }) chart?: BaseChartDirective;
  @ViewChild('chartCanvas', { read: ElementRef }) chartCanvas?: ElementRef;
  showSettings = false;
  chartData: any = { datasets: [] };
  boxes: any;//BoxModel[] = [];
  // store base candle data for overlays
  baseData: any[] = [];
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
  // selectedSymbol: SymbolModel = new SymbolModel(); // ? now full object
  showBoxes = true;

  // Indicator toggle and storage
  showIndicators = true; // default ON as requested
  indicatorSignals: any[] = [];

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

  constructor(
    private marketService: ChartService,
    private _settingsService: SettingsService,
    private route: ActivatedRoute,
    private interaction: ChartInteractionService,
    private boxesService: ChartBoxesService,
    private indicatorsService: ChartIndicatorsService,
  ) { }

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
    // default
    const sign = this.priceChange >= 0 ? '+' : '';
    const prev = 0;
    const percent = prev ? (this.priceChange / prev) * 100 : 0;
    return `${sign}${percent.toFixed(2)}%`;
  }

  // Expose interaction state (service holds runtime values after refactor)
  get isInteracting(): boolean {
    return this.interaction.isInteracting;
  }
  get gestureType(): GestureKind | null {
    return this.interaction.gestureType;
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
    // Read route params (symbol/timeframe) if provided; timeframe optional
    const paramSymbol = this.route.snapshot.paramMap.get('symbol');
    const paramTimeframe = this.route.snapshot.paramMap.get('timeframe');
    if (paramTimeframe) this.selectedTimeframe = paramTimeframe;
    if (paramSymbol) {
      // Pre-dispatch so loadSymbolsAndBoxes picks it up and aligns references
      const minimal = new SymbolModel();
      minimal.SymbolName = paramSymbol;
      this._settingsService.dispatchAppAction(
        SettingsActions.setSelectedSymbol({ symbol: minimal }),
      );
      try {
        localStorage.setItem('selectedSymbol', paramSymbol);
      } catch {
        /* ignore */
      }
    }
    // Force showOrders if navigation set a flag (e.g. from Orders component)
    try {
      const force = localStorage.getItem('forceShowOrders');
      if (force === '1') {
        this.showOrders = true;
        localStorage.removeItem('forceShowOrders');
      }
    } catch {
      /* ignore */
    }
    this.loadSymbolsAndBoxes();
  }

  // Helper: safely update datasets while preserving current axis view to avoid unexpected auto-zoom
  // Modified: optional preserveScales controls whether current axis min/max are captured and reapplied.
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
          } catch (e) { }
          try {
            if (typeof saved.xMax === 'number')
              chartRef.scales.x.max = saved.xMax;
          } catch (e) { }
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
          } catch (e) { }
          try {
            if (typeof saved.yMax === 'number')
              chartRef.scales.y.max = saved.yMax;
          } catch (e) { }
        }
      } catch (e) {
        // ignore
      }
      try {
        chartRef.update('none');
      } catch (e) {
        try {
          this.chart?.update();
        } catch (ee) { }
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
            map((stored: any) => {
              if (!stored || !stored.SymbolName) {
                try {
                  const ls = localStorage.getItem('selectedSymbol');
                  if (ls) {
                    const minimal = new SymbolModel();
                    minimal.SymbolName = ls;
                    stored = minimal;
                    this._settingsService.dispatchAppAction(
                      SettingsActions.setSelectedSymbol({ symbol: minimal }),
                    );
                  }
                } catch {
                  /* ignore */
                }
              }
              if (stored && stored.SymbolName) {
                const match = (symbols || []).find(
                  (s: any) =>
                    (s.SymbolName || '').toString().toUpperCase() ===
                    (stored.SymbolName || '').toString().toUpperCase(),
                );
                return (match as SymbolModel) || (stored as SymbolModel);
              }
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
              console.warn(
                '?? No valid stored symbol, selecting:',
                chosen?.SymbolName || '<none>',
              );
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
            switchMap(() =>
              forkJoin({
                boxes: this.fetchBoxes(symbolName),
                // Always fetch orders if showOrders true (may have been forced before load)
                orders: this.showOrders ? this.fetchOrders(symbolName) : of([]),
              }),
            ),
          );
        }),
      )
      .subscribe({
        error: (err) => console.warn('loadSymbolsAndBoxes error', err),
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

      this.fetchBoxes(this.selectedSymbol.SymbolName).subscribe({
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
      this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isBox);
    });

    console.log(`fetchBoxes(start): mode=${this.boxMode} symbol=${symbolName}`);

    return this.boxesService.getBoxes(symbolName, this.boxMode).pipe(
      tap(filtered => {
        console.log(`fetchBoxes(received): ${filtered?.length || 0} boxes for mode=${this.boxMode}`);
        this.boxes = filtered || [];

        // Always render if we have both baseData and boxes, regardless of showBoxes flag
        // The mode change implies user wants to see the result
        if (this.baseData && this.baseData.length && this.boxes.length) {
          console.log(`fetchBoxes: calling addBoxesDatasets with ${this.boxes.length} boxes`);
          this.addBoxesDatasets();
        } else {
          console.log(`fetchBoxes: skipping render - baseData=${!!this.baseData?.length}, boxes=${this.boxes.length}`);
        }
      })
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
      this.fetchBoxes(this.selectedSymbol.SymbolName).subscribe({
        error: (e) => console.warn('fetchBoxes error', e),
      });
    }
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
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
      // Capture symbolName in a const to satisfy TypeScript
      const capturedSymbolName = symbolName;
      this.loadCandles(capturedSymbolName)
        .pipe(
          switchMap(() =>
            forkJoin({
              boxes: this.fetchBoxes(capturedSymbolName),
              orders: this.showOrders ? this.fetchOrders(capturedSymbolName) : of([]),
            }),
          ),
        )
        .subscribe({
          error: (e) => console.warn('onSymbolChange chain error', e),
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
      delete this.chartOptions.scales.x.min;
      delete this.chartOptions.scales.x.max;
      delete this.chartOptions.scales.y.min;
      delete this.chartOptions.scales.y.max;

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
        } catch (e) { }
        try {
          if (chartRef.scales.y && chartRef.scales.y.options) {
            delete chartRef.scales.y.options.min;
            delete chartRef.scales.y.options.max;
          }
        } catch (e) { }
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
    if (this.selectedSymbol) {
      this.loadCandles(this.selectedSymbol.SymbolName).subscribe({
        error: (e) => console.warn('loadCandles error', e),
      });
    }
  }

  //
  // ?? Load chart data and update price info
  //
  loadCandles(symbol: string): Observable<any[]> {
    console.log('SSS', symbol);
    return this.marketService
      .getCandles(symbol, this.selectedTimeframe, 1000)
      .pipe(
        switchMap((candles: any[]) => {
        // Fetch live candle and combine with historical candles
          return this.marketService.getLiveCandle(symbol, this.selectedTimeframe).pipe(
       map((liveCandle: any) => {
// If we received a live candle with valid price data, append it
          if (liveCandle && liveCandle.Price && candles.length > 0) {
       const lastCandle = candles[candles.length - 1];
      const currentPrice = liveCandle.Price;
              
      // Create a live candle with proper OHLC based on last close and current price
     const liveCandleData = {
       Time: new Date().toISOString(),
        Open: lastCandle.Close, // Start from last candle's close
  High: Math.max(lastCandle.Close, currentPrice),
          Low: Math.min(lastCandle.Close, currentPrice),
                  Close: currentPrice,
        };
       return [...candles, liveCandleData];
              }
    return candles;
      }),
     );
        }),
        map((candles: any[]) =>
        candles.map((c: any) => ({
            x: new Date(c.Time).getTime(),
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
          const allHighs = mapped.map((c: any) => c.h);
          const allLows = mapped.map((c: any) => c.l);
          this.initialYRange = {
            min: Math.min(...allLows),
            max: Math.max(...allHighs),
          };
          // propagate ranges to interaction service
          this.interaction.setRanges(this.fullDataRange, this.extendedDataRange, this.initialYRange);
          this.chartData = {
            datasets: [
              {
                label: `${symbol} ${this.selectedTimeframe.toUpperCase()}`,
                data: mapped,
                type: 'candlestick',
                borderWidth: 1,
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
                wickColor: {
                  up: '#26a69a',
                  down: '#ef5350',
                  unchanged: '#999',
                },
                color: { up: '#26a69a', down: '#ef5350', unchanged: '#999' },
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
          // Auto-load indicator signals on initial data load if the toggle is ON so the first user click behaves intuitively.
          // Previously the checkbox defaulted to checked but indicators were only fetched after a manual re-check cycle.
          if (this.showIndicators) {
            // Avoid duplicate fetches: only trigger if we currently have no indicator datasets.
            const hasIndicators = (this.chartData.datasets || []).some(
              (d: any) => d.isIndicator,
            );
            if (!hasIndicators) {
              this.loadIndicatorSignals();
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

    chartRef.update('none');
    // keep hidden indicator axis aligned with main y-axis so indicator glyphs stay pinned
    // keep hidden indicator axis aligned with main y-axis so indicator glyphs stay pinned
    this.interaction.syncIndicatorAxis(chartRef);
    // Dynamische candle breedte op basis van zichtbare candles
    this.interaction.updateCandleWidth(chartRef);
  }

  // Touch handlers
  // Delegated interaction handlers
  onTouchStart(event: TouchEvent): void { this.interaction.onTouchStart(event, this.chart?.chart as any); }
  onTouchMove(event: TouchEvent): void { this.interaction.onTouchMove(event, this.chart?.chart as any); }
  onTouchEnd(event: TouchEvent): void { this.interaction.onTouchEnd(event, this.chart?.chart as any); }
  onMouseDown(event: MouseEvent): void { this.interaction.onMouseDown(event, this.chart?.chart as any); }
  onMouseMove(event: MouseEvent): void { this.interaction.onMouseMove(event, this.chart?.chart as any); }
  onMouseUp(event: MouseEvent): void { this.interaction.onMouseUp(event, this.chart?.chart as any); }
  onWheel(event: WheelEvent): void { this.interaction.onWheel(event, this.chart?.chart as any); }

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
  resetZoom(): void { this.interaction.resetZoom(this.chart?.chart as any, this.chartData.datasets[0]?.data || []); }
  fitToData(): void { this.interaction.fitToData(this.chart?.chart as any); }

  onChartDblClick(): void {
    if (!this.chart?.chart) return;
    this.interaction.autoFitYScale(this.chart.chart as any);
    (this.chart.chart as any).update('none');
    this.interaction.syncIndicatorAxis(this.chart?.chart as any);
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
    this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isBox);
    const overlays = buildBoxDatasets({ boxes: this.boxes || [], baseData: this.baseData, mainData: mainDs, boxMode: this.boxMode });

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
      this.fetchKeyZones(this.selectedSymbol.SymbolName).subscribe({
        error: (e) => console.warn('fetchKeyZones error', e),
      });
    } else {
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

    // remove existing key zone datasets
    this.chartData.datasets = this.chartData.datasets.filter(
      (d: any) => !d.isKeyZone,
    );

    const xMin = mainDs[0].x;
    const xMax = mainDs[mainDs.length - 1].x;

    const lines: any[] = [];

    // VolumeProfiles -> POC, VAH, VAL
    const vps = this.keyZones.VolumeProfiles || [];
    vps.forEach((vp: any) => {
      const tf = vp.Timeframe || vp.timeframe || '';
      if (vp.Poc != null) {
        lines.push({
          type: 'line' as const,
          label: `${tf} POC`,
          data: [
            { x: xMin, y: vp.Poc },
            { x: xMax, y: vp.Poc },
          ],
          borderColor: 'rgba(0,200,0,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tf} POC`,
          keyColor: 'rgba(0,200,0,0.9)',
        });
      }
      if (vp.Vah != null) {
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
      const type = f.Type || f.type || '';
      const level = f.Level ?? f.level ?? null;
      const price = f.Price ?? f.price ?? null;
      if (price == null) return;

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
      } catch { }
    });

    console.log(
      'addKeyZoneDatasets: added',
      lines.length,
      'key zone lines, total datasets=',
      this.chartData.datasets.length,
    );
  }

  // Orders (moved above private methods to satisfy member ordering lint rules)
  onOrdersToggle(): void {
    if (!this.showOrders) {
      this.orders = [];
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isOrder);
      });
      return;
    }

    // If we already have orders cached and baseData is available, render them immediately
    if (this.orders && this.orders.length && this.baseData && this.baseData.length) {
      console.log('[Chart] Rendering cached orders immediately:', this.orders.length);
      this.addOrderDatasets();
    }

    // Then fetch fresh orders from the server
    if (this.selectedSymbol?.SymbolName) {
      this.fetchOrders(this.selectedSymbol.SymbolName).subscribe({
        error: (e) => console.warn('fetchOrders error in toggle', e),
      });
    }
  } addOrderDatasets(): void {
    if (!this.orders?.length) return;
    const mainDs = this.chartData.datasets[0]?.data as Array<{ x: number }>;
    if (!mainDs || mainDs.length < 2) return;
    this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isOrder);
    const xMin = mainDs[0].x;
    const xMax = mainDs[mainDs.length - 1].x;
    const lines: any[] = [];
    this.orders.forEach((o: any) => {
      const entry = Number(o.EntryPrice ?? o.Entryprice ?? o.entryPrice ?? null);
      const sl = Number(o.StopLoss ?? o.Stoploss ?? o.stopLoss ?? null);
      const t1 = Number(o.TargetPrice ?? o.Target1Price ?? o.Target1price ?? null);
      const t2 = Number(o.Target2Price ?? o.Target2price ?? o.Target2 ?? null);
      const side = ((o.Direction || o.direction || '') + '').toLowerCase();
      const isLong = /long|buy/.test(side);
      const entryColor = isLong ? '#00C853' : '#FF8F00';
      const slColor = '#FF4444';
      const tColor = '#00C8FF';
      if (!Number.isNaN(entry)) lines.push(this.buildOrderLine('Entry', entryColor, xMin, xMax, entry, o.Id));
      if (!Number.isNaN(sl)) lines.push(this.buildOrderLine('Stoploss', slColor, xMin, xMax, sl, o.Id, [4, 4]));
      if (!Number.isNaN(t1)) lines.push(this.buildOrderLine('Target1', tColor, xMin, xMax, t1, o.Id));
      if (!Number.isNaN(t2)) lines.push(this.buildOrderLine('Target2', tColor, xMin, xMax, t2, o.Id, [2, 4]));
    });
    if (!lines.length) return;
    this.safeUpdateDatasets(() => { this.chartData.datasets = this.chartData.datasets.concat(lines); });
  }


  fetchOrders(symbolName: string): Observable<any[]> {
    if (!symbolName) return of([]);

    // Don't clear orders immediately - keep them for instant render above
    // this.orders = [];

    // Remove existing order datasets to prepare for fresh render
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isOrder);
    });

    return this.marketService.getTradeOrders(symbolName).pipe(
      tap((arr: any[]) => {
        if (!arr?.length) {
          this.orders = [];
          return;
        }
        const relevant = arr.filter((o) => (o.Symbol || '').toString().toUpperCase() === symbolName.toUpperCase());
        if (!relevant.length) {
          this.orders = [];
          return;
        }
        this.orders = relevant;
        console.log(`[Chart] fetchOrders received ${this.orders.length} orders for ${symbolName}`);
        if (!this.baseData?.length) {
          console.warn('[Chart] fetchOrders: no baseData yet, cannot render');
          return;
        }
        this.addOrderDatasets();
      })
    );
  }

  // Toggle handler exposed to UI
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
      } catch { }
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
          } catch { }
          // recalc y-scale based on visible candles
          this.interaction.autoFitYScale(chartRef);
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
    this.loadIndicatorSignals();
  }

  // Fetch indicator signals from backend and add datasets
  // indicator fetching moved to ChartIndicatorsService; this now just orchestrates dataset addition & axis sync
  private loadIndicatorSignals(): void {
    if (!this.showIndicators || !this.selectedSymbol?.SymbolName) return;
    // clear existing indicator datasets
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isIndicator);
    });
    this.indicatorsService
      .fetchIndicatorSignals({
        symbolName: this.selectedSymbol.SymbolName,
        timeframe: this.selectedTimeframe,
        baseData: this.baseData,
        showIndicators: this.showIndicators,
      })
      .subscribe({
        next: (raw) => {
          if (!this.showIndicators) return;
          const newDatasets = this.indicatorsService.buildIndicatorDatasets({
            rawSignals: raw,
            timeframe: this.selectedTimeframe,
            baseData: this.baseData,
          });
          if (!newDatasets.length) return;
          this.safeUpdateDatasets(() => {
            this.chartData.datasets = this.chartData.datasets.concat(newDatasets);
          });
          try {
            this.interaction.updateCandleWidth(this.chart?.chart as any);
          } catch { }
          // refit y-scale ignoring indicator datasets
          try {
            const chartRef = this.chart?.chart as any;
            if (chartRef && chartRef.scales?.y) {
              this.interaction.autoFitYScale(chartRef);
              chartRef.update('none');
            }
          } catch { }
        },
        error: (e) => console.warn('indicator signals load error', e),
      });
  }

  private buildOrderLine(label: string, color: string, xMin: number, xMax: number, price: number, orderId: any, dash: number[] = []): any {
    return {
      type: 'line' as const,
      label: `Order ${orderId} ${label}`,
      orderLabel: label,
      orderColor: color,
      data: [{ x: xMin, y: price }, { x: xMax, y: price }],
      borderColor: color,
      borderWidth: 1,
      borderDash: dash,
      pointRadius: 0,
      isOrder: true,
      order: 950,
    };
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
}
