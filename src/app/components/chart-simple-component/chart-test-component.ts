/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { NgChartsModule } from 'ng2-charts';
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
        pan: { enabled: true, mode: 'x' },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
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
          color: '#2a2a2a', // grid lines dark
          borderColor: '#555',
        },
        ticks: {
          color: '#aaa', // grey x-axis labels
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
          color: '#aaa', // grey y-axis labels
          callback: (val: any) => Number(val).toFixed(6),
          maxTicksLimit: 10,
        },
      },
    },
    layout: {
      backgroundColor: '#0d1117', // chart bg
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

        this.chartData = {
          datasets: [
            {
              label: `${symbol} 1D`,
              data: mapped,
              type: 'candlestick',
              borderColor: {
                up: '#26a69a', // green up candle
                down: '#ef5350', // red down candle
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
      });
  }
}
