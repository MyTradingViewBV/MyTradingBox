/**
 * Side-effect module: registers the Chart.js controllers, scales and plugins
 * used by the candlestick chart pages. Imported by ChartBaseComponent so
 * chart.js is only pulled into the lazy chart chunks, not the initial bundle.
 */
import {
  Chart,
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
import 'chartjs-adapter-date-fns';
import { chartCustomPlugins } from './services/chart-plugins';

Chart.register(
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
