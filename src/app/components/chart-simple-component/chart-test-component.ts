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

// 📌 Crosshair plugin
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
      ctx.setLineDash([4, 4]); // dashed lines like TradingView
      ctx.strokeStyle = '#555';
      ctx.stroke();
      ctx.restore();
    }
  },
};

ChartJS.register(
  TimeScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
  CandlestickController,
  CandlestickElement,
  zoomPlugin,
  crosshairPlugin, // 👈 register crosshair
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
    interaction: {
      mode: 'nearest', // 👈 works for tap on mobile
      intersect: false,
      axis: 'x',
    },
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
        bodyFont: { size: 14 }, // 📱 larger font
        titleFont: { size: 14 },
        padding: 12, // 📱 more padding for fat fingers
      },
      datalabels: { display: false },
      zoom: {
        pan: {
          enabled: true,
          mode: 'xy',
        },
        zoom: {
          wheel: { enabled: false }, // no wheel on phones
          pinch: { enabled: true, scaleMode: 'xy' }, // pinch zoom
          mode: 'xy',
          drag: { enabled: false }, // disable drag zoom on mobile
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
          color: '#2a2a2a',
          borderColor: '#555',
        },
        ticks: {
          color: '#aaa',
          autoSkip: true,
          maxTicksLimit: window.innerWidth < 500 ? 4 : 8, // 📱 fewer ticks
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
          axis.ticks = axis.ticks.filter((_: any, i: number) => i % 2 === 0);
        },
      },
    },
    layout: {
      backgroundColor: '#0d1117',
    },
  };

  constructor(private chartService: BitcoinCandleChartService) {}

  ngOnInit(): void {
    this.chartService.getSymbols().subscribe((symbols) => {
      if (symbols?.length) {
        const symbol = symbols[0].SymbolName;
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

        // dynamic zoom limits
        this.chartOptions = {
          ...this.chartOptions,
          scales: {
            ...this.chartOptions.scales,
            x: { ...this.chartOptions.scales.x, min: xMin, max: xMax },
            y: {
              ...this.chartOptions.scales.y,
              min: yMin * 0.98,
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

        if (this.chart) this.chart.update();
      });
  }

  // 🔥 Double click (desktop) or double tap (mobile) → reset zoom
  onChartDblClick(): void {
    if (this.chart) {
      (this.chart.chart as any).resetZoom();
    }
  }
}
