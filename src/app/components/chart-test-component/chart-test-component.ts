/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import {
  MAT_FORM_FIELD_DEFAULT_OPTIONS,
  MatFormFieldModule,
} from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { NgChartsModule } from 'ng2-charts';

import {
  Chart as ChartJS,
  TimeScale,
  Tooltip,
  Legend,
  Title,
  LinearScale,
} from 'chart.js';
import {
  CandlestickController,
  CandlestickElement,
} from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
import 'chartjs-adapter-date-fns';
// import {
//   Candle,
//   EmaMmaLevel,
//   FibLevel,
//   MarketService,
//   SymbolModel,
//   VolumeProfile,
// } from '../../modules/shared/http/market.service';
import { FormsModule } from '@angular/forms';
// import { ActivatedRoute } from '@angular/router';
import ChartDataLabels from 'chartjs-plugin-datalabels';

// Register Chart.js plugins and controllers
ChartJS.register(
  TimeScale,
  LinearScale,
  Tooltip,
  Legend,
  Title,
  CandlestickController,
  CandlestickElement,
  zoomPlugin,
  ChartDataLabels,
);

@Component({
  selector: 'app-chart-test-component',
  standalone: true,
  imports: [
    CommonModule,
    NgChartsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatButtonModule,
    FormsModule,
  ],
  templateUrl: './chart-test-component.html',
  styleUrls: ['./chart-test-component.scss'],
  providers: [
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline', subscriptSizing: 'dynamic' },
    },
  ],
})
export class ChartTestComponent /*implements OnInit*/ {
  // Minimal example candlestick data so chart renders
  chartData: any = {
    datasets: [
      {
        label: 'BTCUSDT 1d',
        data: [
          { x: new Date('2025-05-10').getTime(), o: 56000, h: 57000, l: 55000, c: 56500 },
          { x: new Date('2025-05-11').getTime(), o: 56500, h: 57500, l: 56000, c: 57000 },
          { x: new Date('2025-05-12').getTime(), o: 57000, h: 58000, l: 56500, c: 57500 },
          { x: new Date('2025-05-13').getTime(), o: 57500, h: 58500, l: 57000, c: 58000 },
          { x: new Date('2025-05-14').getTime(), o: 58000, h: 59000, l: 57500, c: 58500 },
        ],
        type: 'candlestick',
        // Lock visual width/height characteristics so overlays don't change candle sizing
        barPercentage: 1.0,
        categoryPercentage: 0.9,
        maxBarThickness: 60,
        // Fixed bar thickness (pixels) ensures other datasets like scatter don't affect candle width
        barThickness: 12,
      },
    ],
  };

  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: false },
      datalabels: { display: true },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day' },
      },
      y: {
        position: 'right',
      },
      // separate hidden axis for indicator scatter dataset so it doesn't change main y scale
      indicator: {
        display: false,
        position: 'left',
        grid: { display: false },
        ticks: { display: false },
        type: 'linear',
        beginAtZero: false,
      },
    },
  };

  // settings
  showBoxes = false;
  showBoxesV2 = false;
  showIndicators = false;

  // store indicator events and original dataset count
  indicatorEvents: any[] = [];
  private mainDatasetCount = 1;

  // fallback sample (user-provided data truncated) in case HTTP call fails
  private readonly INDICATOR_SAMPLE: any[] = [
    {
      Symbol: 'BTCUSDT',
      Timeframe: '1d',
      EndBar: 6,
      EndTime: '2024-05-13T00:00:00+00:00',
      Kind: 'Bullish',
      Count: 0,
      HasMcb: true,
      Indicators: [],
      ExchangeId: 1,
    },
    {
      Symbol: 'BTCUSDT',
      Timeframe: '1d',
      EndBar: 29,
      EndTime: '2024-06-05T00:00:00+00:00',
      Kind: 'Bearish',
      Count: 3,
      HasMcb: false,
      Indicators: ['Hist', 'MACD', 'Stoch'],
      ExchangeId: 1,
    },
    {
      Symbol: 'BTCUSDT',
      Timeframe: '1d',
      EndBar: 59,
      EndTime: '2024-07-05T00:00:00+00:00',
      Kind: 'Bullish',
      Count: 2,
      HasMcb: true,
      Indicators: ['RSI', 'Stoch'],
      ExchangeId: 1,
    },
    // ... more items can be added or the HTTP endpoint used
  ];

  constructor() {}

  toggleIndicators(): void {
    if (!this.showIndicators) {
      // remove indicators
      this.chartData.datasets = this.chartData.datasets.slice(0, this.mainDatasetCount);
      this.indicatorEvents = [];
      // reset indicator axis to default hidden state
      if (this.chartOptions?.scales) {
        this.chartOptions.scales.indicator = {
          display: false,
          position: 'left',
          grid: { display: false },
          ticks: { display: false },
          type: 'linear',
          beginAtZero: false,
        };
      }
      this.chartData = { datasets: [...this.chartData.datasets] };
      // ensure candle width settings are present after removal
      this.ensureCandleWidthDefaults();
      return;
    }

    // try to call server endpoint Indicator?symbol=1&timeframe=1d&exchangeId=1 using fetch
    fetch('/Indicator?symbol=1&timeframe=1d&exchangeId=1')
      .then((r) => {
        if (!r.ok) throw new Error('network');
        return r.json();
      })
      .then((arr: any[]) => {
        this.indicatorEvents = arr || [];
        this.addIndicatorDataset();
      })
      .catch(() => {
        // fallback to sample
        this.indicatorEvents = this.INDICATOR_SAMPLE;
        this.addIndicatorDataset();
      });
  }

  private addIndicatorDataset(): void {
    if (!this.indicatorEvents?.length) return;

    // compute min Y from candlestick dataset to place indicators under the candles
    const candleDs = this.chartData.datasets[0]?.data as Array<any> | undefined;
    if (!candleDs || candleDs.length === 0) return;

    const highs = candleDs.map((c) => c.h);
    const lows = candleDs.map((c) => c.l);
    const minY = Math.min(...lows);
    const maxY = Math.max(...highs);
    const range = maxY - minY || Math.max(Math.abs(minY), Math.abs(maxY)) * 0.01 || 1;
    const offset = range * 0.12;
    const indicatorY = minY - offset;

    const scatterPoints = this.indicatorEvents
      .map((ev: any) => {
        const evTime = new Date(ev.EndTime).getTime();

        // find nearest candle by time (within 24h)
        let x = evTime;
        let nearest = candleDs.reduce((prev: any, curr: any) => {
          const prevDiff = Math.abs((prev.x ?? prev) - evTime);
          const currDiff = Math.abs((curr.x ?? curr) - evTime);
          return prevDiff <= currDiff ? prev : curr;
        });

        // if nearest has x property (candle object), normalize
        const nearestX = nearest?.x ?? nearest;
        if (Math.abs(nearestX - evTime) <= 24 * 60 * 60 * 1000) {
          x = nearestX;
        }

        return {
          x,
          y: indicatorY,
          label: (ev.Indicators || []).join(', '),
          kind: ev.Kind,
          count: ev.Count,
        };
      })
      // filter out duplicates (same x) and ensure it's within candle span
      .filter((pt: any, idx: number, arr: any[]) => {
        const first = arr.findIndex((a: any) => a.x === pt.x);
        // keep only first occurrence per x
        if (first !== idx) return false;
        const minX = candleDs[0].x;
        const maxX = candleDs[candleDs.length - 1].x;
        return pt.x >= minX && pt.x <= maxX;
      });

    if (!scatterPoints.length) return;

    // per-point colors and sizes
    const backgroundColors = scatterPoints.map((pt: any) =>
      (pt.kind || '').toLowerCase() === 'bullish' ? 'rgba(0,200,0,0.9)' : 'rgba(200,0,0,0.9)',
    );
    const radii = scatterPoints.map((pt: any) => Math.min(12, 4 + (pt.count || 0) * 2));

    // set indicator axis to a tight range around indicatorY so it won't rescale the main axis
    const indicatorAxisMin = indicatorY - Math.max(range * 0.02, 1);
    const indicatorAxisMax = indicatorY + Math.max(range * 0.02, 1);

    if (!this.chartOptions) this.chartOptions = {};
    if (!this.chartOptions.scales) this.chartOptions.scales = {};
    this.chartOptions.scales.indicator = {
      display: false,
      position: 'left',
      grid: { display: false },
      ticks: { display: false },
      type: 'linear',
      beginAtZero: false,
      min: indicatorAxisMin,
      max: indicatorAxisMax,
      // prevent automatic fitting from interfering with main scale
      // suggestedMin/suggestedMax could be used instead, but explicit min/max is more robust here
    };

    const ds = {
      type: 'scatter' as const,
      label: 'Indicators',
      data: scatterPoints,
      // assign to a separate hidden y-axis so it doesn't affect main candlestick scaling
      yAxisID: 'indicator',
      backgroundColor: backgroundColors,
      pointRadius: radii,
      pointHoverRadius: radii.map((r: number) => Math.min(r + 2, 16)),
      datalabels: {
        align: 'end',
        anchor: 'end',
        formatter: (value: any, ctx: any) => {
          const lbl = ctx.dataset.data[ctx.dataIndex]?.label || '';
          return lbl ? lbl : ctx.dataset.data[ctx.dataIndex]?.kind ?? '';
        },
        color: '#000',
        font: { size: 10, weight: 'bold' },
      },
    };

    // append dataset and update
    this.chartData.datasets.push(ds);
    this.chartData = { datasets: [...this.chartData.datasets] };

    // ensure candle width settings remain applied
    this.ensureCandleWidthDefaults();
  }

  private ensureCandleWidthDefaults(): void {
    const candleDs = this.chartData.datasets.find((d: any) => d.type === 'candlestick');
    if (candleDs) {
      // enforce a fixed visual width so other datasets can't change candle sizing
      candleDs.barPercentage = candleDs.barPercentage ?? 1.0;
      candleDs.categoryPercentage = candleDs.categoryPercentage ?? 0.9;
      candleDs.maxBarThickness = candleDs.maxBarThickness ?? 60;
      // explicit pixel width; adjust to taste or compute dynamically if needed
      candleDs.barThickness = candleDs.barThickness ?? 12;
      // apply back to chartData to force redraw
      this.chartData = { datasets: [...this.chartData.datasets] };
    }
  }
}
