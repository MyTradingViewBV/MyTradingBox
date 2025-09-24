/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
import { BitcoinCandleChartService } from '../../modules/shared/http/bitcoinCandleChartService';
import {
  Candle,
  EmaMmaLevel,
  FibLevel,
  SymbolModel,
  VolumeProfile,
} from '../../modules/shared/http/market.service';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
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
export class ChartTestComponent implements OnInit {
  chartData: any = {
    datasets: [
      {
        label: 'UMB/USDT',
        data: [
          {
            x: new Date('2023-08-25'),
            o: 0.0025,
            h: 0.0028,
            l: 0.0024,
            c: 0.0026,
          },
          {
            x: new Date('2023-08-26'),
            o: 0.0026,
            h: 0.0027,
            l: 0.0023,
            c: 0.0024,
          },
          {
            x: new Date('2023-08-27'),
            o: 0.0024,
            h: 0.0025,
            l: 0.0021,
            c: 0.0022,
          },
          {
            x: new Date('2023-08-28'),
            o: 0.0022,
            h: 0.0023,
            l: 0.002,
            c: 0.0021,
          },
        ],
        type: 'candlestick',
      },
    ],
  };

  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        bottom: 50, // 👈 leave space for footer (adjust to match footer height)
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { mode: 'index', intersect: true },
      datalabels: {
        display: false, // 👈 disable globally
      },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        datalabels: {
          display: (ctx: any) => {
            // only show on first and third point of box (min/max anchors)
            return (
              ctx.dataset.isBox && (ctx.dataIndex === 1 || ctx.dataIndex === 2)
            );
          },
          align: (ctx: any) => (ctx.dataIndex === 1 ? 'bottom' : 'top'),
          anchor: (ctx: any) => (ctx.dataIndex === 1 ? 'end' : 'start'),
          color: '#000',
          font: { size: 10, weight: 'bold' },
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          formatter: (value: any, ctx: any) => {
            return value.y.toFixed(2); // show ZoneMin / ZoneMax values
          },
        },
        zoom: {
          wheel: {
            enabled: true,
            speed: 0.4, // 👈 smaller = faster zoom (default ~0.001)
          },
          pinch: { enabled: true },
          mode: 'x',
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'day',
          tooltipFormat: 'MMM dd',
          displayFormats: { day: 'MMM dd' },
        },
        ticks: {
          autoSkip: false,
          maxRotation: 0,
          minRotation: 0,
        },
      },
      y: {
        position: 'right', // 👈 moves prices to the right side
        beginAtZero: false,
        ticks: {
          callback: (val: any) => val.toFixed(2),
        },
      },
    },
  };

  showFib = false;
  showVolumeProfile = false;
  showEmaMma = false;
  showVwap = false;
  showBoxes = false;
  showBoxesV2 = true;
  showZeros = false;

  fibLevels: FibLevel[] = [];
  emaMmaLevels: EmaMmaLevel[] = [];
  volumeProfiles: VolumeProfile[] = [];
  boxes: any[] = [];

  symbols: SymbolModel[] = [];
  selectedSymbol = 'BTCUSDT';
  availableTimeframes = ['30m', '1h', '4h', '1d', '1w', '1y'];
  selectedTimeframe = '1d';

  private mainDatasetCount = 1;

  constructor(
    private chartService: BitcoinCandleChartService,
    private route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const symbol = params.get('symbol');
      const timeframe = params.get('timeframe');

      if (symbol) {
        this.selectedSymbol = symbol;
      }
      if (timeframe) {
        this.selectedTimeframe = timeframe;
      }

      this.loadCandles();
    });

    this.loadSymbols();
  }

  onTimeframeChange(tf: string): void {
    this.selectedTimeframe = tf;
    this.loadCandles();
    this.updateChartOptionsForTimeframe(tf);
    console.log('Selected timeframe:', tf);
  }

  onSymbolChange(symbol: string): void {
    this.selectedSymbol = symbol;

    // 🔥 Do whatever you want here:
    // For example reload candles:
    this.loadCandles();

    // Or log/debug
    console.log('Selected symbol:', symbol);
  }

  updateChartOptionsForTimeframe(tf: string): void {
    let maxTicks = 10;

    switch (tf) {
      case '1m':
      case '5m':
      case '15m':
        maxTicks = 6;
        break;
      case '1h':
      case '4h':
        maxTicks = 10;
        break;
      case '1d':
      case '1w':
      case '1y':
        maxTicks = 12;
        break;
    }

    // 👇 reassign new object so Angular notices
    this.chartOptions = {
      ...this.chartOptions,
      scales: {
        ...this.chartOptions.scales,
        x: {
          ...this.chartOptions.scales.x,
          ticks: {
            ...this.chartOptions.scales.x.ticks,
            maxTicksLimit: maxTicks,
            autoSkip: true,
          },
        },
      },
    };
  }

  loadSymbols(): void {
    this.chartService.getSymbols().subscribe((arr) => {
      this.symbols = arr;
      if (arr.length && !this.selectedSymbol) {
        this.selectedSymbol = arr[0].SymbolName;
      }
    });
  }

  loadCandles(limit = 300): void {
    if (!this.selectedSymbol) return;
    this.chartService
      .getCandles(this.selectedSymbol, this.selectedTimeframe, limit)
      .subscribe((candles) => {
        this.mapCandlesToChartData(candles);
        if (this.showBoxesV2) {
          this.ensureOverlaysLoadedV2();
        } else {
          this.ensureOverlaysLoaded();
        }
        this.updateChartOptionsForTimeframe(this.selectedTimeframe);
      });
  }

  ensureOverlaysLoaded(): void {
    this.showBoxesV2 = false;
    console.log('ensureOverlaysLoaded called');
    this.chartService.getBoxes(this.selectedSymbol).subscribe((arr) => {
      this.boxes = arr.filter(
        (b: any) => ((b.Type || b.type || '') + '').toLowerCase() === 'range',
      );
      this.refreshOverlays();
    });
  }

  ensureOverlaysLoadedV2(): void {
    this.showBoxes = false;
    console.log('ensureOverlaysLoadedV2 called');
    this.chartService.getBoxesV2(this.selectedSymbol).subscribe((arr) => {
      this.boxes = arr.filter(
        (b: any) => ((b.Type || b.type || '') + '').toLowerCase() === 'range',
      );
      this.refreshOverlays();
    });
  }

  private mapCandlesToChartData(candles: Candle[]): void {
    const ds = (candles || []).map((c) => ({
      x: new Date(c.Time).getTime(),
      o: c.Open,
      h: c.High,
      l: c.Low,
      c: c.Close,
    }));
    this.chartData = {
      datasets: [
        { label: `${this.selectedSymbol} ${this.selectedTimeframe}`, data: ds },
      ],
    };
    this.mainDatasetCount = this.chartData.datasets.length;
  }

  private refreshOverlays(): void {
    this.chartData.datasets = this.chartData.datasets.slice(
      0,
      this.mainDatasetCount,
    );

    if (this.showFib && this.fibLevels.length) this.addFibDatasets();
    if ((this.showEmaMma || this.showVwap) && this.emaMmaLevels.length)
      this.addEmaMmaDatasets();
    if (this.showVolumeProfile && this.volumeProfiles.length)
      this.addVolumeProfileDatasets();

    if (
      (this.showBoxes && this.boxes.length) ||
      (this.showBoxesV2 && this.boxes.length)
    )
      this.addBoxesDatasets(); // 👈

    this.chartData = {
      datasets: [...(this.chartData.datasets as any[])],
    };
  }

  private addBoxesDatasets(): void {
    if (!this.boxes?.length) return;

    const candleDs = this.chartData.datasets[0]?.data as
      | Array<{ x: number }>
      | undefined;
    if (!candleDs || candleDs.length < 2) return;

    const xMin = candleDs[0].x;
    const xMax = candleDs[candleDs.length - 1].x;

    const overlays = this.boxes.flatMap((b) => {
      const color =
        b.Color ||
        (b.PositionType === 'Short'
          ? 'rgba(255,0,0,0.4)'
          : 'rgba(0,200,0,0.4)');

      // Box shape dataset
      const boxDataset = {
        type: 'line' as const,
        label: `Box ${b.Id}`,
        data: [
          { x: xMin, y: b.ZoneMin },
          { x: xMax, y: b.ZoneMin },
          { x: xMax, y: b.ZoneMax },
          { x: xMin, y: b.ZoneMax },
          { x: xMin, y: b.ZoneMin },
        ],
        borderColor: color,
        borderWidth: 2,
        backgroundColor: 'transparent',
        fill: false,
        pointRadius: 0,
      };

      // Label dataset for ZoneMax
      const labelTop = {
        type: 'line' as const,
        data: [{ x: xMax, y: b.ZoneMax }],
        borderColor: 'transparent',
        pointRadius: 0,
        datalabels: {
          align: 'end',
          anchor: 'end',
          color: 'red',
          font: { size: 11, weight: 'bold' },
          formatter: () => `ZoneMax: ${b.ZoneMax}`,
        },
      };

      // Label dataset for ZoneMin
      const labelBottom = {
        type: 'line' as const,
        data: [{ x: xMax, y: b.ZoneMin }],
        borderColor: 'transparent',
        pointRadius: 0,
        datalabels: {
          align: 'start',
          anchor: 'start',
          color: 'green',
          font: { size: 11, weight: 'bold' },
          formatter: () => `ZoneMin: ${b.ZoneMin}`,
        },
      };

      return [boxDataset, labelTop, labelBottom];
    });

    this.chartData.datasets.push(...overlays);
  }

  private addFibDatasets(): void {
    const overlays = (this.fibLevels || [])
      .filter((f) => this.showZeros || Number(f.Price) !== 0)
      .map((f) => ({
        type: 'line' as const,
        label: `Fib ${f.Level}`,
        data: this.horizontalLineData(f.Price),
        borderColor: 'rgba(255,165,0,0.9)',
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        tension: 0,
      }));
    this.chartData.datasets.push(...overlays);
  }

  private horizontalLineData(price: number): Array<{ x: number; y: number }> {
    const candleDs = this.chartData.datasets[0]?.data as
      | Array<{ x: number }>
      | undefined;
    if (candleDs && candleDs.length >= 2) {
      const x0 = candleDs[0].x;
      const x1 = candleDs[candleDs.length - 1].x;
      return [
        { x: x0, y: price },
        { x: x1, y: price },
      ];
    }
    return [
      { x: new Date().getTime() - 3600 * 1000, y: price },
      { x: new Date().getTime(), y: price },
    ];
  }

  private addEmaMmaDatasets(): void {
    const vwapTypes = ['VWAP', 'RVWAP'];
    let items = this.emaMmaLevels || [];
    if (this.showVwap) {
      items = items.filter((e) =>
        vwapTypes.includes((e.Type || '').toUpperCase()),
      );
    } else if (this.showEmaMma) {
      items = items.filter(
        (e) => !vwapTypes.includes((e.Type || '').toUpperCase()),
      );
    } else {
      items = [];
    }

    const overlays = items
      .filter((e) => this.showZeros || Number(e.Value) !== 0)
      .map((e) => ({
        type: 'line' as const,
        label: `${e.Type} ${e.Period ?? ''}`,
        data: this.horizontalLineData(e.Value),
        borderColor: 'rgba(0,128,255,0.9)',
        borderWidth: 1,
        pointRadius: 0,
        tension: 0,
      }));
    this.chartData.datasets.push(...overlays);
  }

  private addVolumeProfileDatasets(): void {
    const overlays: any[] = [];
    (this.volumeProfiles || [])
      .filter(
        (v) =>
          this.showZeros ||
          Number(v.Poc) !== 0 ||
          Number(v.Vah) !== 0 ||
          Number(v.Val) !== 0,
      )
      .forEach((v) => {
        if (this.showZeros || Number(v.Poc) !== 0) {
          overlays.push({
            type: 'line' as const,
            label: 'POC',
            data: this.horizontalLineData(v.Poc),
            borderColor: 'rgba(0,200,0,0.9)',
            borderWidth: 1,
            pointRadius: 0,
          });
        }
        if (this.showZeros || Number(v.Vah) !== 0) {
          overlays.push({
            type: 'line' as const,
            label: 'VAH',
            data: this.horizontalLineData(v.Vah),
            borderColor: 'rgba(200,0,200,0.9)',
            borderWidth: 1,
            pointRadius: 0,
          });
        }
        if (this.showZeros || Number(v.Val) !== 0) {
          overlays.push({
            type: 'line' as const,
            label: 'VAL',
            data: this.horizontalLineData(v.Val),
            borderColor: 'rgba(200,200,0,0.9)',
            borderWidth: 1,
            pointRadius: 0,
          });
        }
      });

    this.chartData.datasets.push(...overlays);
  }
}
