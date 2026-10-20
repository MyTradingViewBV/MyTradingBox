/**
 * Chart.js plugin rendering saved Fixed Volume Profiles (TradingView "Fixed
 * Range Volume Profile"): a translucent range box, a histogram anchored at the
 * box's left edge, and POC / VAH / VAL lines, all computed live from the
 * chart's current candles.
 *
 * Drawn before the datasets so candles stay on top and user drawings (drawn
 * after the datasets) keep precedence.
 */
import type { Chart } from 'chart.js';
import {
  FixedProfileCandle,
  FixedProfileGeometry,
  FixedVolumeProfileLayerService,
  fixedProfileRange,
} from './fixed-volume-profile-layer.service';

type ScaleLike = {
  getPixelForValue(value: unknown): number;
};

export const FIXED_PROFILE_COLORS = {
  boxFill: 'rgba(120,123,134,0.08)',
  boxBorder: 'rgba(120,123,134,0.45)',
  selectedBorder: '#2962FF',
  valueAreaBar: 'rgba(41,98,255,0.35)',
  outsideBar: 'rgba(120,123,134,0.30)',
  pocBar: 'rgba(247,82,95,0.75)',
  poc: '#F7525F',
  valueAreaLine: 'rgba(41,98,255,0.9)',
  label: '#d1d4dc',
};

/** Histogram bars span at most this share of the range's pixel width (TradingView look). */
const MAX_BAR_WIDTH_FRACTION = 0.3;

export function createFixedVolumeProfilePlugin(layer: FixedVolumeProfileLayerService) {
  return {
    id: 'fixedVolumeProfiles',

    beforeDatasetsDraw(chart: Chart): void {
      const chartType = (chart.config as { type?: string }).type;
      if (chartType !== 'candlestick') return;
      const ctx = chart.ctx as CanvasRenderingContext2D;
      const xScale = chart.scales['x'] as unknown as ScaleLike | undefined;
      const yScale = chart.scales['y'] as unknown as ScaleLike | undefined;
      const area = chart.chartArea;
      if (!ctx || !xScale || !yScale || !area) return;

      const profiles = layer.profiles;
      if (!profiles.length) {
        layer.setGeometry([]);
        return;
      }

      const datasets = (chart.data?.datasets ?? []) as Array<{ type?: string; data?: unknown[] }>;
      const candleSet = datasets.find((d) => d.type === 'candlestick') ?? datasets[0];
      const candles = (candleSet?.data ?? []) as FixedProfileCandle[];

      const geometry: FixedProfileGeometry[] = [];
      ctx.save();
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();

      for (const profile of profiles) {
        const range = fixedProfileRange(profile);
        if (!range) continue;
        const x1 = xScale.getPixelForValue(range.start);
        const x2 = xScale.getPixelForValue(range.end);
        if (!Number.isFinite(x1) || !Number.isFinite(x2)) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const lineRight = profile.ExtendRight ? Math.max(right, area.right) : right;
        if (lineRight < area.left || left > area.right) continue;

        const result = layer.profileFor(profile, candles);
        const top = result ? yScale.getPixelForValue(result.rangeHigh) : area.top;
        const bottom = result ? yScale.getPixelForValue(result.rangeLow) : area.bottom;
        geometry.push({ id: profile.Id, left, right, top: Math.min(top, bottom), bottom: Math.max(top, bottom) });

        const selected = layer.selectedId === profile.Id;
        const active = selected || layer.hoveredId === profile.Id || layer.draggingId === profile.Id;
        const width = right - left;
        const boxTop = Math.min(top, bottom);
        const boxHeight = Math.abs(bottom - top);

        // Range box
        ctx.fillStyle = FIXED_PROFILE_COLORS.boxFill;
        ctx.fillRect(left, boxTop, width, boxHeight);
        ctx.strokeStyle = active ? FIXED_PROFILE_COLORS.selectedBorder : FIXED_PROFILE_COLORS.boxBorder;
        ctx.lineWidth = active ? 1.5 : 1;
        ctx.setLineDash([]);
        ctx.strokeRect(left, boxTop, width, boxHeight);

        if (result) {
          // Histogram rows (index 0 = lowest price), anchored at the left edge.
          const maxVolume = Math.max(...result.rowVolumes);
          const maxBar = width * MAX_BAR_WIDTH_FRACTION;
          for (let i = 0; i < result.rowCount; i++) {
            const volume = result.rowVolumes[i];
            if (volume <= 0 || maxVolume <= 0) continue;
            const rowLow = result.rangeLow + i * result.rowHeight;
            const rowHigh = rowLow + result.rowHeight;
            const yTop = yScale.getPixelForValue(rowHigh);
            const yBottom = yScale.getPixelForValue(rowLow);
            const rowPx = Math.abs(yBottom - yTop);
            const gap = rowPx > 3 ? 1 : 0;
            const barH = Math.max(1, rowPx - gap);
            const inValueArea = rowLow >= result.valueAreaLow - 1e-12 && rowHigh <= result.valueAreaHigh + 1e-12;
            ctx.fillStyle = i === result.pocRow
              ? FIXED_PROFILE_COLORS.pocBar
              : inValueArea ? FIXED_PROFILE_COLORS.valueAreaBar : FIXED_PROFILE_COLORS.outsideBar;
            ctx.fillRect(left, Math.min(yTop, yBottom), (volume / maxVolume) * maxBar, barH);
          }

          // POC (solid) and value area bounds (dashed)
          drawLevel(ctx, left, lineRight, yScale.getPixelForValue(result.pocPrice), FIXED_PROFILE_COLORS.poc, 1.5, []);
          drawLevel(ctx, left, lineRight, yScale.getPixelForValue(result.valueAreaHigh), FIXED_PROFILE_COLORS.valueAreaLine, 1, [4, 3]);
          drawLevel(ctx, left, lineRight, yScale.getPixelForValue(result.valueAreaLow), FIXED_PROFILE_COLORS.valueAreaLine, 1, [4, 3]);
        }

        // Name at the top-left of the box (kept inside the plot area)
        if (profile.Name) {
          ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
          ctx.fillStyle = FIXED_PROFILE_COLORS.label;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(profile.Name, Math.max(left, area.left) + 4, Math.max(boxTop, area.top) + 4);
        }

        // Edge grips while selected: horizontal resize handles
        if (selected) {
          const midY = (Math.max(boxTop, area.top) + Math.min(boxTop + boxHeight, area.bottom)) / 2;
          for (const hx of [left, right]) {
            ctx.beginPath();
            ctx.arc(hx, midY, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = FIXED_PROFILE_COLORS.selectedBorder;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      ctx.restore();
      layer.setGeometry(geometry);
    },
  };
}

function drawLevel(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  color: string,
  width: number,
  dash: number[],
): void {
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}
