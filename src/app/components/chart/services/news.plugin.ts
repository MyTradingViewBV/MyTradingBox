/**
 * News overlay (WPF "News" toggle): a 📰 marker above every candle a ForexFactory calendar
 * event overlaps, red for high impact, yellow otherwise. The markers come from the news
 * carrier dataset (isNews + newsMarkers, built by buildNewsMarkers); the candle under the
 * crosshair shows its events in a tooltip.
 */
import type { Chart } from 'chart.js';
import { NewsMarker, newsEventLine } from '../utils/news-events';

type ScaleLike = { getPixelForValue(value: unknown): number; min: number; max: number };
type NewsChart = Chart & { _crosshairTime?: number | null };

export const NEWS_HIGH_IMPACT_COLOR = '#f23645';
export const NEWS_OTHER_COLOR = '#f5c518';
const MARKER_RADIUS = 4;
/** Gap between the candle high and the marker dot. */
const MARKER_OFFSET_PX = 10;
/** Room a marker takes above the candle high; other glyphs above that candle start past it. */
export const NEWS_MARKER_CLEARANCE_PX = MARKER_OFFSET_PX + MARKER_RADIUS + 2;
const TOOLTIP_MAX_LINES = 8;
const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';

/** Markers of the news carrier dataset; [] when the overlay is off. */
export function newsMarkersOf(chart: Chart): NewsMarker[] {
  for (const ds of (chart.data?.datasets ?? []) as Array<{ isNews?: boolean; newsMarkers?: NewsMarker[] }>) {
    if (ds?.isNews && Array.isArray(ds.newsMarkers)) return ds.newsMarkers;
  }
  return [];
}

function markerAnchor(marker: NewsMarker, x: ScaleLike, y: ScaleLike): { px: number; py: number } | null {
  const px = x.getPixelForValue(marker.x);
  const py = y.getPixelForValue(marker.price) - MARKER_OFFSET_PX;
  return Number.isFinite(px) && Number.isFinite(py) ? { px, py } : null;
}

export const newsPlugin = {
  id: 'mtbNews',

  afterDatasetsDraw(chart: Chart): void {
    const markers = newsMarkersOf(chart);
    if (!markers.length) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const area = chart.chartArea;
    const xScale = chart.scales['x'] as unknown as ScaleLike | undefined;
    const yScale = chart.scales['y'] as unknown as ScaleLike | undefined;
    if (!ctx || !area || !xScale || !yScale) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
    ctx.clip();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.font = `11px ${FONT_FAMILY}`;
    for (const marker of markers) {
      if (marker.x < xScale.min || marker.x > xScale.max) continue;
      const anchor = markerAnchor(marker, xScale, yScale);
      if (!anchor) continue;
      ctx.beginPath();
      ctx.arc(anchor.px, anchor.py, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = marker.highImpact ? NEWS_HIGH_IMPACT_COLOR : NEWS_OTHER_COLOR;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      ctx.fillText('📰', anchor.px, anchor.py - MARKER_RADIUS - 1);
    }
    ctx.restore();
  },

  afterDraw(chart: Chart): void {
    const time = (chart as NewsChart)._crosshairTime;
    if (time == null) return;
    const marker = newsMarkersOf(chart).find((m) => m.x === time);
    if (!marker) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const area = chart.chartArea;
    const xScale = chart.scales['x'] as unknown as ScaleLike | undefined;
    const yScale = chart.scales['y'] as unknown as ScaleLike | undefined;
    if (!ctx || !area || !xScale || !yScale) return;
    const anchor = markerAnchor(marker, xScale, yScale);
    if (!anchor) return;

    const lines = marker.events.slice(0, TOOLTIP_MAX_LINES).map(newsEventLine);
    if (marker.events.length > TOOLTIP_MAX_LINES) lines.push(`+${marker.events.length - TOOLTIP_MAX_LINES} …`);
    ctx.save();
    ctx.font = `12px ${FONT_FAMILY}`;
    const lineH = 16;
    const pad = 6;
    const width = Math.min(
      area.right - area.left - 8,
      Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2,
    );
    const height = lines.length * lineH + pad * 2;
    let left = anchor.px + 10;
    if (left + width > area.right - 4) left = anchor.px - 10 - width;
    left = Math.max(area.left + 4, left);
    let top = anchor.py - 24 - height;
    if (top < area.top + 4) top = Math.min(area.bottom - height - 4, anchor.py + 12);

    ctx.fillStyle = 'rgba(30,34,45,0.95)';
    ctx.strokeStyle = marker.highImpact ? NEWS_HIGH_IMPACT_COLOR : NEWS_OTHER_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(left, top, width, height);
    ctx.clip();
    ctx.fillStyle = '#d1d4dc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((line, i) => ctx.fillText(line, left + pad, top + pad + i * lineH));
    ctx.restore();
  },
};
