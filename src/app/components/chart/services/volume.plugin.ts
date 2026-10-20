/**
 * TradingView "Volume" overlay on the price pane: one bar per candle in the bottom
 * 20% of the plot, green/red after the candle's direction, drawn before the datasets
 * so the candles stay on top. Enabled per chart through the canvas attribute
 * data-volume-title ("Vol · BTC"); without it nothing is drawn.
 */
import type { Chart } from 'chart.js';

/** Share of the plot height the tallest visible volume bar may take. */
export const VOLUME_HEIGHT_FRACTION = 0.2;
/** Bar width as share of the candle spacing (matches the candle body width). */
const VOLUME_BAR_WIDTH_FRACTION = 0.8;

type VolumeCandle = { x: number; o: number; c: number; v?: number };
type ScaleLike = { getPixelForValue(value: unknown): number; min: number; max: number };

/** Quote currencies stripped from a symbol name to get the asset volume is counted in. */
const QUOTE_SUFFIXES = ['USDT', 'USDC', 'BUSD', 'FDUSD', 'TUSD', 'USD', 'EUR', 'GBP', 'BTC', 'ETH'];

/** Base asset of a symbol name: "BTCUSDT" → "BTC", "BTC-EUR" / "BTC/EUR" → "BTC", "ETHBTC" → "ETH". */
export function volumeBaseAsset(symbolName: string | null | undefined): string {
  const name = (symbolName ?? '').trim().toUpperCase().replace(/\.P$|PERP$/, '');
  if (!name) return '';
  const sep = name.search(/[-/_:]/);
  if (sep > 0) return name.slice(0, sep);
  for (const quote of QUOTE_SUFFIXES) {
    if (name.length > quote.length && name.endsWith(quote)) return name.slice(0, -quote.length);
  }
  return name;
}

/** TradingView volume text: 1.96K, 12.3M, 4.5B; 2 decimals below 1000. */
export function formatVolume(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const units: Array<[number, string]> = [
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (abs >= size) return `${trimZeros((value / size).toFixed(2))}${suffix}`;
  }
  return trimZeros(value.toFixed(abs >= 100 ? 0 : 2));
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

/** CANDLE_UP_COLOR / CANDLE_DOWN_COLOR (chart-plugins) at 50% opacity. */
export const VOLUME_UP_COLOR = 'rgba(8,153,129,0.5)';
export const VOLUME_DOWN_COLOR = 'rgba(242,54,69,0.5)';

/** The volume title when the overlay is on for this chart, '' otherwise. */
export function volumeTitleOf(chart: Chart): string {
  return (chart.canvas as HTMLCanvasElement | undefined)?.dataset?.['volumeTitle'] ?? '';
}

export const volumePlugin = {
  id: 'mtbVolume',
  beforeDatasetsDraw(chart: Chart): void {
    if ((chart.config as { type?: string }).type !== 'candlestick') return;
    if (!volumeTitleOf(chart)) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const area = chart.chartArea;
    const xScale = chart.scales['x'] as unknown as ScaleLike | undefined;
    if (!ctx || !area || !xScale) return;
    const datasets = (chart.data?.datasets ?? []) as Array<{ type?: string; data?: unknown[] }>;
    const points = (datasets.find((d) => d.type === 'candlestick')?.data ?? []) as VolumeCandle[];
    if (!points.length) return;

    // Visible candles (one spare on each side so bars at the edges are drawn).
    let first = -1;
    let last = -1;
    for (let i = 0; i < points.length; i++) {
      const x = points[i].x;
      if (x < xScale.min) continue;
      if (x > xScale.max) break;
      if (first < 0) first = i;
      last = i;
    }
    if (first < 0) return;
    first = Math.max(0, first - 1);
    last = Math.min(points.length - 1, last + 1);

    let maxVolume = 0;
    for (let i = first; i <= last; i++) maxVolume = Math.max(maxVolume, points[i].v ?? 0);
    if (!(maxVolume > 0)) return;

    const spacing =
      points.length > 1
        ? Math.abs(xScale.getPixelForValue(points[1].x) - xScale.getPixelForValue(points[0].x))
        : 6;
    const barWidth = Math.max(1, spacing * VOLUME_BAR_WIDTH_FRACTION);
    const maxHeight = (area.bottom - area.top) * VOLUME_HEIGHT_FRACTION;

    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
    for (let i = first; i <= last; i++) {
      const p = points[i];
      const v = p.v ?? 0;
      if (!(v > 0)) continue;
      const px = xScale.getPixelForValue(p.x);
      if (!Number.isFinite(px)) continue;
      const h = Math.max(1, (v / maxVolume) * maxHeight);
      ctx.fillStyle = p.c >= p.o ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR;
      ctx.fillRect(px - barWidth / 2, area.bottom - h, barWidth, h);
    }
    ctx.restore();
  },
};
