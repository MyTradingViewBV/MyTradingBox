/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
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
import { BitcoinCandleChartService } from '../../modules/shared/http/bitcoinCandleChartService';
import { Candle } from '../../modules/shared/http/market.service';

// Register Chart.js controllers & plugins
ChartJS.register(
  TimeScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
  CandlestickController,
  CandlestickElement,
  zoomPlugin,
);

@Component({
  selector: 'app-chart-simple',
  standalone: true,
  imports: [CommonModule, NgChartsModule],
  templateUrl: 'chart-simple-component.html',
  styleUrls: ['chart-simple-component.scss'],
})
export class ChartSimpleComponent implements OnInit {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  chartData: any = { datasets: [] };

  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        mode: 'index',
        intersect: false,
        backgroundColor: '#1e1e1e',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#333',
        borderWidth: 1,
      },
      datalabels: { display: false },
      zoom: {
        pan: {
          enabled: true,
          mode: 'xy', // 👈 pan both directions
        },
        zoom: {
          wheel: {
            enabled: true,
            speed: 0.05, // smoother zoom
          },
          pinch: { enabled: true },
          mode: 'xy', // 👈 zoom both axes
        },
        limits: {
          y: { min: 'original', max: 'original' }, // keep original Y range
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
        grid: {
          color: '#2a2a2a', // dark grid
          borderColor: '#555',
        },
        ticks: {
          color: '#aaa',
          autoSkip: true,
          maxTicksLimit: 8,
        },
      },
      y: {
        position: 'right',
        beginAtZero: false,
        grid: {
          color: '#2a2a2a',
          borderColor: '#555',
        },
        ticks: {
          color: '#aaa',
          callback: (val: any) => Number(val).toFixed(6),
          maxTicksLimit: 12,
        },
        afterBuildTicks: (axis: any) => {
          // reduce number of labels like TradingView
          axis.ticks = axis.ticks.filter((_: any, i: number) => i % 2 === 0);
        },
      },
    },
    layout: {
      backgroundColor: '#0d1117', // chart background
    },
  };

  constructor(private chartService: BitcoinCandleChartService) {}

  ngOnInit(): void {
    this.chartService.getSymbols().subscribe((symbols) => {
      if (symbols?.length) {
        const symbol = symbols[0].SymbolName; // auto-load first symbol
        this.loadCandles(symbol);
      }
    });
  }

  loadCandles(symbol: string): void {
    this.chartService
      .getCandles(symbol, '1d', 200)
      .subscribe((candles: Candle[]) => {
        const mapped = candles.map((c) => ({
          x: new Date(c.Time).getTime(),
          o: c.Open,
          h: c.High,
          l: c.Low,
          c: c.Close,
        }));

        if (!mapped.length) return;

        // compute min/max from new data
        const xMin = mapped[0].x;
        const xMax = mapped[mapped.length - 1].x;
        const yMin = Math.min(...mapped.map((c) => c.l));
        const yMax = Math.max(...mapped.map((c) => c.h));

        this.chartData = {
          datasets: [
            {
              label: `${symbol} 1D`,
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

        // 🔥 update options with new min/max each time candles update
        this.chartOptions = {
          ...this.chartOptions,
          scales: {
            ...this.chartOptions.scales,
            x: {
              ...this.chartOptions.scales.x,
              min: xMin,
              max: xMax,
            },
            y: {
              ...this.chartOptions.scales.y,
              min: yMin * 0.98, // add padding
              max: yMax * 1.02,
            },
          },
          plugins: {
            ...this.chartOptions.plugins,
            zoom: {
              ...this.chartOptions.plugins.zoom,
              limits: {
                x: { min: xMin, max: xMax },
                y: { min: yMin, max: yMax },
              },
            },
          },
        };

        // force chart update if already rendered
        if (this.chart) {
          this.chart.update();
        }
      });
  }

  // 🔥 Double click to reset zoom/pan
  onChartDblClick(): void {
    if (this.chart) {
      (this.chart.chart as any).resetZoom();
    }
  }
}
