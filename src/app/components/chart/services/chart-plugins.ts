/* Centralized Chart.js custom plugins extracted from chart-component.ts
  Each plugin relies only on dataset flags (isBox, isKeyZone, isIndicator, isOrder)
  and the chart instance; no component state dependency.
  Lint relaxed here because these are thin wrappers over Chart.js runtime objects. */
 

import { CandlestickElement } from 'chartjs-chart-financial';

// Helper reused by multiple plugins for rounded rectangles
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: boolean,
  stroke: boolean,
): void {
  if (typeof r === 'undefined') r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// Crosshair lines following tooltip active element
// Extended dataset interface describing custom flags used by our plugins
interface ExtendedDataset {
  label?: string;
  isBox?: boolean;
  isKeyZone?: boolean;
  isIndicator?: boolean;
  isOrder?: boolean;
  glyph?: string;
  glyphColor?: string;
  glyphSize?: number;
  glyphOffsetX?: number;
  glyphOffsetY?: number;
  orderLabel?: string;
  orderColor?: string;
  keyLabel?: string;
  keyColor?: string;
  boxLabelMin?: string;
  boxLabelMax?: string;
  boxLabelText?: string; // combined min/max label
  backgroundColor?: string | CanvasGradient | CanvasPattern;
  borderColor?: string | CanvasGradient | CanvasPattern;
  borderWidth?: number;
  yAxisID?: string;
  data?: Array<{ [k: string]: any; x: any; y: any }>;
  isDivergence?: boolean;
  divLabels?: string[];
  divColor?: string;
}

export const crosshairPlugin = {
  id: 'crosshair',
  // Position is managed by ChartInteractionService (no afterEvent needed).
  // _crosshairX / _crosshairY are set/cleared by touch & mouse handlers.
  afterDraw(chart: import('chart.js').Chart): void {
    const x = (chart as any)._crosshairX;
    const y = (chart as any)._crosshairY;
    if (x == null || y == null) return;

    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale: any = (chart.scales as any)['x'];
    const yScale: any = (chart.scales as any)['y'];
    const area = chart.chartArea;
    if (!area) return;

    ctx.save();
    // Draw crosshair lines (dashed, TradingView style)
    ctx.beginPath();
    ctx.moveTo(x, area.top);
    ctx.lineTo(x, area.bottom);
    ctx.moveTo(area.left, y);
    ctx.lineTo(area.right, y);
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(150,150,150,0.6)';
    ctx.stroke();

    // Draw axis labels with price and timestamp
    if (xScale && yScale) {
      // --- Y-axis label (price) ---
      const priceValue = yScale.getValueForPixel(y);
      const abs = Math.abs(priceValue);
      let priceString = '';
      if (abs === 0) {
        priceString = '0.00';
      } else if (abs >= 1) {
        priceString = priceValue.toFixed(2);
      } else {
        const mag = -Math.log10(abs);
        const decimals = Math.min(8, Math.max(2, Math.ceil(mag + 2)));
        priceString = priceValue.toFixed(decimals);
      }

      ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
      const priceTextWidth = ctx.measureText(priceString).width;
      const priceBoxWidth = priceTextWidth + 12;
      const priceBoxHeight = 22;
      // Draw on the right axis area
      ctx.fillStyle = '#363a45';
      roundRect(ctx, area.right + 1, y - priceBoxHeight / 2, priceBoxWidth, priceBoxHeight, 3, true, false);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceString, area.right + 1 + priceBoxWidth / 2, y);

      // --- X-axis label (timestamp) ---
      // Interpolate time from pixel position
      const timeValue = xScale.getValueForPixel(x);
      const date = new Date(timeValue);
      let timeString = '';
      if (!isNaN(date.getTime())) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const mon = months[date.getMonth()];
        const dd = date.getDate();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        timeString = `${dd} ${mon} ${hh}:${min}`;
      }

      if (timeString) {
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, sans-serif';
        const textWidth = ctx.measureText(timeString).width;
        const timeBoxWidth = textWidth + 12;
        const timeBoxHeight = 22;
        const timeBoxX = Math.max(area.left, Math.min(x - timeBoxWidth / 2, area.right - timeBoxWidth));
        ctx.fillStyle = '#363a45';
        roundRect(ctx, timeBoxX, area.bottom + 1, timeBoxWidth, timeBoxHeight, 3, true, false);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(timeString, timeBoxX + timeBoxWidth / 2, area.bottom + 1 + timeBoxHeight / 2);
      }
    }

    ctx.restore();
  },
};

// Filled box polygons painted behind candles
export const boxPainterPlugin = {
  id: 'boxPainter',
  beforeDatasetsDraw(chart: import('chart.js').Chart): void {
    if ((chart as any)?._isInteracting) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale: any = (chart.scales as any)['x'];
    const yScale: any = (chart.scales as any)['y'];
    if (!xScale || !yScale) return;
    const area = chart.chartArea;
    if (!area) return;

    ctx.save();
    try {
      // Clip all box drawing to the chart area so boxes don't cover axes
      ctx.beginPath();
      ctx.rect(area.left, area.top, area.right - area.left, area.bottom - area.top);
      ctx.clip();
      // Draw boxes before candles so candles appear on top; no composite override needed
      (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
        if (!ds || !ds.isBox) return;
        const pts = ds.data || [];
        if (!pts.length) return;
        ctx.beginPath();
        pts.forEach((p: any, i: number) => {
          const px = xScale.getPixelForValue(p.x);
          const py = yScale.getPixelForValue(p.y);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = ds.backgroundColor || 'rgba(0,200,0,0.12)';
        ctx.fill();
        ctx.lineWidth = ds.borderWidth ?? 2;
        ctx.strokeStyle = ds.borderColor || 'rgba(57,255,20,0.9)';
        ctx.stroke();
      });
    } finally {
      ctx.restore();
    }
  },
};

// Key zone labels stacked on right side
export const keyzonesLabelPlugin = {
  id: 'keyzonesLabels',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    if ((chart as any)?._isInteracting) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale: any = (chart.scales as any)['x'];
    const yScale: any = (chart.scales as any)['y'];
    if (!xScale || !yScale) return;
    const chartArea = chart.chartArea;
    const rightX = chartArea.right - 6;
    const labels: Array<{ yVal: number; text: string; color: string }> = [];
    (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
      if (!ds || !ds.isKeyZone) return;
      const pts = ds.data || [];
      if (!pts.length) return;
      const yVal = pts[0].y ?? (pts[0] as any)['Price'] ?? null;
      if (yVal == null) return;
      const rawText = (ds.keyLabel || ds.label || '').toString();
      const text = rawText || `${ds.keyLabel || ds.label || 'key'}`;
      const color = ds.keyColor || (ds.borderColor as any) || '#fff';
      labels.push({ yVal: Number(yVal), text, color });
    });
    if (!labels.length) return;
    let pixels = labels
      .map((l) => ({ ...l, yPx: yScale.getPixelForValue(l.yVal) }))
      .sort((a, b) => a.yPx - b.yPx);

    const canvasWidth =
      chart.width || (chart.canvas && chart.canvas.width) || 800;
    const isNarrow = canvasWidth < 480;
    const isMedium = canvasWidth < 800 && canvasWidth >= 480;
    // Tighter spacing to keep labels compact
    const minSpacing = isNarrow ? 10 : isMedium ? 12 : 14;
    // Reduce font size ~20%
    const fontSize = isNarrow ? 9 : isMedium ? 10 : 10;
    // Reduce box height ~40–60% by tightening to text line height
    const boxH = Math.max(14, Math.round(fontSize * 1.4));
    // Smaller padding: ~1px vertical, ~3px horizontal
    const paddingX = 3;
    const paddingY = 1;

    const groupingThreshold = Math.max(8, Math.round(minSpacing * 1.2));
    const groups: Array<{ yPx: number; items: typeof pixels }> = [];
    for (const p of pixels) {
      if (!groups.length) {
        groups.push({ yPx: p.yPx, items: [p] });
        continue;
      }
      const last = groups[groups.length - 1];
      const lastItem = last.items[last.items.length - 1];
      if (Math.abs(p.yPx - lastItem.yPx) <= groupingThreshold) {
        last.items.push(p);
        last.yPx =
          last.items.reduce((s, it) => s + it.yPx, 0) / last.items.length;
      } else groups.push({ yPx: p.yPx, items: [p] });
    }
    const maxGroups = isNarrow ? 6 : isMedium ? 12 : 999;
    let extraGroupCount = 0;
    let renderGroups = groups;
    if (groups.length > maxGroups) {
      const step = Math.ceil(groups.length / maxGroups);
      const sampled: typeof groups = [];
      for (let i = 0; i < groups.length; i += step) sampled.push(groups[i]);
      extraGroupCount = groups.length - sampled.length;
      renderGroups = sampled;
    }
    renderGroups.sort((a, b) => a.yPx - b.yPx);
    for (let i = 1; i < renderGroups.length; i++) {
      if (renderGroups[i].yPx - renderGroups[i - 1].yPx < minSpacing) {
        renderGroups[i].yPx = renderGroups[i - 1].yPx + minSpacing;
      }
    }
    for (let i = 0; i < renderGroups.length; i++) {
      const topLimit = chartArea.top + 6 + i * minSpacing;
      const bottomLimit =
        chartArea.bottom - 6 - (renderGroups.length - 1 - i) * minSpacing;
      if (renderGroups[i].yPx < topLimit) renderGroups[i].yPx = topLimit;
      if (renderGroups[i].yPx > bottomLimit) renderGroups[i].yPx = bottomLimit;
    }
    ctx.save();
    ctx.font = `${fontSize}px Arial`;
    ctx.textBaseline = 'middle';
    renderGroups.forEach((g) => {
      const shortTexts = g.items.map((it) =>
        it.text.replace(/retracement/gi, 'retr').replace(/extension/gi, 'ext'),
      );
      let displayText = '';
      if (shortTexts.length <= 3) displayText = shortTexts.join(' / ');
      else
        displayText = `${shortTexts.slice(0, 2).join(' / ')} (+${shortTexts.length - 2})`;
      if (isNarrow && displayText.length > 30)
        displayText = displayText.substring(0, 30) + '…';
      const colors = Array.from(new Set(g.items.map((it) => it.color)));
      const color = colors.length === 1 ? colors[0] : '#FFD700';
      const metrics = ctx.measureText(displayText);
      const textW = Math.min(metrics.width, canvasWidth * 0.3);
      const boxW = textW + paddingX * 2 + 10;
      const x = rightX - boxW;
      const y = g.yPx - boxH / 2;
      ctx.fillStyle = 'rgba(10,10,10,0.75)';
      // Smaller corner radius for compact look
      roundRect(ctx, x, y, boxW, boxH, 2, true, false);
      ctx.fillStyle = color || '#FFD700';
      ctx.fillRect(x + 2, y + 2, 6, boxH - 4);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(
        displayText,
        x + paddingX + 8,
        g.yPx,
        boxW - paddingX * 2 - 10,
      );
    });
    if (extraGroupCount > 0) {
      const badgeText = `+${extraGroupCount}`;
      ctx.font = `${Math.max(9, fontSize)}px Arial`;
      const metrics = ctx.measureText(badgeText);
      const bw = metrics.width + 8;
      const bh = Math.max(14, boxH);
      const bx = rightX - bw;
      const by = chartArea.top + 6;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      roundRect(ctx, bx, by, bw, bh, 2, true, false);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, bx + bw / 2, by + bh / 2);
    }
    ctx.restore();
  },
};

// Indicator glyphs pinned to candles
export const indicatorLabelPlugin = {
  id: 'indicatorLabels',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    if ((chart as any)?._isInteracting) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale: any = (chart.scales as any)['x'];
    const chartArea = chart.chartArea;
    if (!xScale || !chartArea) return;
    ctx.save();
    // Keep indicator glyphs inside the plotting area only.
    ctx.beginPath();
    ctx.rect(
      chartArea.left,
      chartArea.top,
      chartArea.right - chartArea.left,
      chartArea.bottom - chartArea.top,
    );
    ctx.clip();
    ctx.textBaseline = 'middle';
    // Draw only indicator datasets and honor dataset order (higher last)
    const indicatorSets = (chart.data.datasets as ExtendedDataset[])
      .filter((ds) => !!ds && !!ds.isIndicator);
    indicatorSets.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    indicatorSets.forEach((ds) => {
      if (!ds || !ds.isIndicator) return;
      const pts = ds.data || [];
      if (!pts.length) return;
      const glyph = ds.glyph || '';
      const color = ds.glyphColor || '#fff';
      const size = ds.glyphSize ?? 14;
      ctx.fillStyle = color;
      ctx.font = `${size}px Arial`;
      const yScaleForDs: any = (chart.scales as any)[ds.yAxisID || 'y'];
      const yScaleToUse: any = yScaleForDs || (chart.scales as any)['y'];
      pts.forEach((p: any) => {
        const px = xScale.getPixelForValue(p.x);
        const py = yScaleToUse
          ? yScaleToUse.getPixelForValue(p.y)
          : ((chart.scales as any)['y']?.getPixelForValue(p.y) ?? 0);
        if (
          px < chartArea.left ||
          px > chartArea.right ||
          py < chartArea.top ||
          py > chartArea.bottom
        ) {
          return;
        }
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText(
          glyph,
          px - size / 2 + (ds.glyphOffsetX ?? 0),
          py + (ds.glyphOffsetY ?? 0),
        );
        ctx.restore();
      });
    });
    ctx.restore();
  },
};

// Order labels stacked on right side
export const orderLabelPlugin = {
  id: 'orderLabels',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    if ((chart as any)?._isInteracting) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale: any = (chart.scales as any)['x'];
    const yScale: any = (chart.scales as any)['y'];
    if (!xScale || !yScale) return;
    const chartArea = chart.chartArea;
    const rightX = chartArea.right - 6;
    const entries: Array<{ yVal: number; text: string; color: string }> = [];
    (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
      if (!ds || !ds.isOrder) return;
      const pts = ds.data || [];
      if (!pts.length) return;
      const yVal = pts[0].y ?? (pts[0] as any)['Price'] ?? null;
      if (yVal == null) return;
      const text = (ds.orderLabel || ds.label || '').toString();
      const color = ds.orderColor || (ds.borderColor as any) || '#fff';
      entries.push({ yVal: Number(yVal), text, color });
    });
    if (!entries.length) return;
    let pixels = entries
      .map((l) => ({ ...l, yPx: yScale.getPixelForValue(l.yVal) }))
      .sort((a, b) => a.yPx - b.yPx);
    const minSpacing = 14;
    const boxH = 18;
    const padding = 6;
    for (let i = 1; i < pixels.length; i++) {
      if (pixels[i].yPx - pixels[i - 1].yPx < minSpacing)
        pixels[i].yPx = pixels[i - 1].yPx + minSpacing;
    }
    for (let i = 0; i < pixels.length; i++) {
      const topLimit = chartArea.top + 6 + i * minSpacing;
      const bottomLimit =
        chartArea.bottom - 6 - (pixels.length - 1 - i) * minSpacing;
      if (pixels[i].yPx < topLimit) pixels[i].yPx = topLimit;
      if (pixels[i].yPx > bottomLimit) pixels[i].yPx = bottomLimit;
    }
    ctx.save();
    ctx.font = '12px Arial';
    ctx.textBaseline = 'middle';
    pixels.forEach((p) => {
      const displayText = p.text || '';
      const metrics = ctx.measureText(displayText);
      const textW = Math.min(metrics.width, (chart.width || 800) * 0.35);
      const boxW = textW + padding * 2 + 8;
      const x = rightX - boxW;
      const y = p.yPx - boxH / 2;
      ctx.fillStyle = 'rgba(10,10,10,0.8)';
      roundRect(ctx, x, y, boxW, boxH, 4, true, false);
      ctx.fillStyle = p.color || '#FFD700';
      ctx.fillRect(x + 2, y + 2, 6, boxH - 4);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(
        displayText,
        x + padding + 8,
        p.yPx,
        boxW - padding * 2 - 10,
      );
    });
    ctx.restore();
  },
};


// Box min/max price labels pinned to right side
export const boxLabelPlugin = {
  id: 'boxLabels',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    if ((chart as any)?._isInteracting) return;
    try {
      const ctx = chart.ctx as CanvasRenderingContext2D;
      const yScale: any = (chart.scales as any)['y'];
      const xScale: any = (chart.scales as any)['x'];
      const chartArea = chart.chartArea;
      if (!yScale || !xScale || !chartArea || !ctx) return;
      // Build combined label entries (one per box) centered vertically in each box, drawn on LEFT side
      const entries: Array<{ midY: number; text: string; color: string }> = [];
      (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
        if (!ds || !ds.isBox) return;
        const pts = ds.data || [];
        if (!pts.length) return;
        const ys = pts
          .map((p: any) =>
            typeof p === 'object'
              ? Number(p.y ?? p?.Price ?? p?.value ?? NaN)
              : Number(p),
          )
          .filter((v: number) => !Number.isNaN(v));
        if (!ys.length) return;
        // Determine box horizontal span using x values of polygon points
        const xs = pts
          .map((p: any) =>
            typeof p === 'object' ? Number(p.x ?? NaN) : Number(p),
          )
          .filter((v: number) => !Number.isNaN(v));
        if (!xs.length) return;
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        // Current visible x range from scale options/runtime
        const visXMin =
          typeof xScale.min === 'number'
            ? xScale.min
            : (xScale.options?.min ?? null);
        const visXMax =
          typeof xScale.max === 'number'
            ? xScale.max
            : (xScale.options?.max ?? null);
        // Skip label if box is completely outside horizontal viewport
        if (visXMin != null && maxX < visXMin) return;
        if (visXMax != null && minX > visXMax) return;
        // Also skip if vertical span entirely outside y visible range
        const visYMin =
          typeof yScale.min === 'number'
            ? yScale.min
            : (yScale.options?.min ?? null);
        const visYMax =
          typeof yScale.max === 'number'
            ? yScale.max
            : (yScale.options?.max ?? null);
        if (visYMin != null && maxY < visYMin) return;
        if (visYMax != null && minY > visYMax) return;
        const midY = minY + (maxY - minY) / 2;
        const combined =
          ds.boxLabelText ||
          `min: ${ds.boxLabelMin ?? (minY >= 1000 ? minY.toLocaleString() : minY.toFixed(2))} - max: ${ds.boxLabelMax ?? (maxY >= 1000 ? maxY.toLocaleString() : maxY.toFixed(2))}`;
        const color = (ds.borderColor as any) || '#fff';
        entries.push({ midY, text: combined, color });
      });
      if (!entries.length) return;
      let pixels = entries
        .map((e) => ({ ...e, yPx: yScale.getPixelForValue(e.midY) }))
        .sort((a, b) => a.yPx - b.yPx);
      const canvasWidth =
        chart.width || (chart.canvas && chart.canvas.width) || 800;
      const isNarrow = canvasWidth < 480;
      const fontSize = isNarrow ? 10 : 11;
      const minSpacing = isNarrow ? 24 : 28; // more spacing since labels are taller now
      const boxH = fontSize + 10;
      const padding = 6;
      for (let i = 1; i < pixels.length; i++) {
        if (pixels[i].yPx - pixels[i - 1].yPx < minSpacing)
          pixels[i].yPx = pixels[i - 1].yPx + minSpacing;
      }
      for (let i = 0; i < pixels.length; i++) {
        const topLimit = chartArea.top + 6 + i * minSpacing;
        const bottomLimit =
          chartArea.bottom - 6 - (pixels.length - 1 - i) * minSpacing;
        if (pixels[i].yPx < topLimit) pixels[i].yPx = topLimit;
        if (pixels[i].yPx > bottomLimit) pixels[i].yPx = bottomLimit;
      }
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textBaseline = 'middle';
      const leftX = chartArea.left + 6; // draw at left side
      pixels.forEach((p) => {
        const text = p.text?.toString() ?? '';
        // measureText retained only if needed for future truncation; currently unused so omitted
        const h = boxH;
        const x = leftX; // left aligned container
        const y = p.yPx - h / 2;
        // Removed background: just draw a slim color bar and the text directly.
        const barColor = p.color || '#fff';
        ctx.fillStyle = barColor;
        ctx.fillRect(x, y + 2, 4, h - 4); // slim vertical bar
        ctx.fillStyle = '#fff';
        // Optional slight shadow for readability over box fill
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 3;
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 6 + padding, p.yPx);
        ctx.shadowBlur = 0;
      });
      ctx.restore();
    } catch (err) {
      console.warn('boxLabelPlugin error', err);
    }
  },
};

// User-provided MIN/MAX dual line label plugin (renders two lines: MIN and MAX)
export const minMaxLabelPlugin = {
  id: 'minMaxLabelPlugin',

  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const yScale: any = chart.scales?.['y'];
    const xScale: any = chart.scales?.['x'];
    const chartArea = chart.chartArea;

    if (!yScale || !chartArea) return;

    const datasets: any[] = chart.data?.datasets || [];

    datasets.forEach((dataset: any, dsIndex: number) => {
      if (!dataset?.isBox) return;

      const meta = chart.getDatasetMeta(dsIndex);
      if (!meta || !meta.data || meta.data.length < 1) return;

      const pts: Array<{ x: number; y: number }> = dataset.data || [];
      if (!pts.length) return;

      // Extract numeric Y values
      const ys: number[] = pts
        .map((p: { y: any }) => Number(p.y))
        .filter((v: number): v is number => !Number.isNaN(v));

      if (!ys.length) return;

      // Extract numeric X values for viewport checks
      const xs: number[] = pts
        .map((p: { x: any }) => Number(p.x))
        .filter((v: number): v is number => !Number.isNaN(v));

      // If scales provide visible ranges, skip labels when box is fully outside
      if (xScale) {
        const visXMin =
          typeof xScale.min === 'number' ? xScale.min : (xScale.options?.min ?? null);
        const visXMax =
          typeof xScale.max === 'number' ? xScale.max : (xScale.options?.max ?? null);
        if (xs.length) {
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          if (visXMin != null && maxX < visXMin) return; // entirely left of view
          if (visXMax != null && minX > visXMax) return; // entirely right of view
        }
      }

      const visYMin =
        typeof yScale.min === 'number' ? yScale.min : (yScale.options?.min ?? null);
      const visYMax =
        typeof yScale.max === 'number' ? yScale.max : (yScale.options?.max ?? null);
      const boxMinValue: number = Math.min(...ys);
      const boxMaxValue: number = Math.max(...ys);
      if (visYMin != null && boxMaxValue < visYMin) return; // entirely below view
      if (visYMax != null && boxMinValue > visYMax) return; // entirely above view
      // Compute vertical center of the box in data coordinates
      const boxMidValue: number = boxMinValue + (boxMaxValue - boxMinValue) / 2;
      let y: number = yScale.getPixelForValue(boxMidValue);
      // Keep label inside chart area bounds
      const minInset = 12;
      if (y < chartArea.top + minInset) y = chartArea.top + minInset;
      if (y > chartArea.bottom - minInset) y = chartArea.bottom - minInset;

      // Build display text using pre-formatted min/max when available
      const rawText: string = dataset.boxLabelText;
      let minValue: string | undefined = dataset.boxLabelMin as any;
      let maxValue: string | undefined = dataset.boxLabelMax as any;

      if (!minValue || !maxValue) {
        if (!rawText) return;
        // Expect formats like "0.02 / 0.02" or "MIN: x MAX: y"
        const match = rawText.match(/([0-9.,]+)\s*(?:\/|MAX:\s*)\s*([0-9.,]+)/);
        if (!match) return;
        minValue = match[1];
        maxValue = match[2];
      }

      let displayText = `${minValue} / ${maxValue}`;
      const strength = (dataset as any).boxStrength;
      if (strength !== undefined && strength !== null && strength !== '') {
        displayText = `${displayText}  S: ${strength}`;
      }

      // Slightly larger for readability on most screens
      const fontSize = 9;
      const padding = 4;
      const textPaddingX = 4;
      const textPaddingY = 2;

      // Label X position
      let x = chartArea.left + padding;

      ctx.save();
      ctx.textBaseline = 'middle';
      ctx.font = `${fontSize}px Roboto`;

      //
      // 1. Draw HIGH-VISIBILITY BACKGROUND PLATE
      //

      const metrics = ctx.measureText(displayText);
      const textWidth = metrics.width;

      // Background rect geometry
      const bgX = x + 14; // leave room for the small colored icon
      const bgY = y - fontSize / 2 - textPaddingY;
      const bgW = textWidth + textPaddingX * 2;
      const bgH = fontSize + textPaddingY * 2;

      // Rounded box
      ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;

      const radius = 3;

      ctx.beginPath();
      ctx.moveTo(bgX + radius, bgY);
      ctx.lineTo(bgX + bgW - radius, bgY);
      ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + radius);
      ctx.lineTo(bgX + bgW, bgY + bgH - radius);
      ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - radius, bgY + bgH);
      ctx.lineTo(bgX + radius, bgY + bgH);
      ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + radius);
      ctx.lineTo(bgX, bgY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      //
      // 2. Draw small icon showing box color
      //
      const iconSize = 10;
      const iconX = x;
      const iconY = y - iconSize / 2;

      const fillColor =
        typeof dataset.backgroundColor === 'string'
          ? dataset.backgroundColor
          : 'rgba(255,255,255,0.15)';

      const strokeColor =
        typeof dataset.borderColor === 'string'
          ? dataset.borderColor
          : '#ffffff';

      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.rect(iconX, iconY, iconSize, iconSize);
      ctx.fill();
      ctx.stroke();

      //
      // 3. Draw high-contrast text with glow
      //
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#ffffff';

      const textX = bgX + textPaddingX;
      ctx.fillText(displayText, textX, y);

      ctx.restore();
    });
  },
};

// Divergence dot plugin — draws filled circles with indicator label text inside
export const divergenceDotPlugin = {
  id: 'divergenceDots',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    if ((chart as any)?._isInteracting) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale: any = (chart.scales as any)['x'];
    const yScale: any = (chart.scales as any)['y'];
    if (!xScale || !yScale) return;

    ctx.save();
    (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
      if (!ds?.isDivergence) return;
      const pts = ds.data || [];
      if (!pts.length) return;

      const labels: string[] = ds.divLabels || [];
      const color = ds.divColor || '#FF1744';
      const radius = 12;
      const fontSize = Math.max(7, Math.min(10, Math.floor(radius * 0.8)));

      pts.forEach((p: any) => {
        const px = xScale.getPixelForValue(p.x);
        const py = yScale.getPixelForValue(p.y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return;

        // Draw filled circle
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Draw indicator label(s) inside the circle
        const text = labels.join('/');
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 3;
        ctx.fillText(text, px, py);
        ctx.shadowBlur = 0;
      });
    });
    ctx.restore();
  },
};

// TradingView-style canvas background fill
const chartBackgroundPlugin = {
  id: 'chartBackground',
  beforeDraw(chart: import('chart.js').Chart): void {
    const ctx = chart.ctx as CanvasRenderingContext2D;
    ctx.save();
    ctx.fillStyle = '#131722';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  },
};

// Aggregate export for easy import
export const chartCustomPlugins = [
  chartBackgroundPlugin,
  crosshairPlugin,
  boxPainterPlugin,
  keyzonesLabelPlugin,
  indicatorLabelPlugin,
  divergenceDotPlugin,
  orderLabelPlugin,
  // boxLabelPlugin removed to avoid duplicate min/max text rendering
  minMaxLabelPlugin,
  // Watermark plugin (added dynamically)
  {
    id: 'watermark',
    afterDraw(chart: import('chart.js').Chart): void {
      try {
        const ctx = chart.ctx as CanvasRenderingContext2D;
        const area = chart.chartArea;
        if (!area || !ctx) return;
        // Avoid drawing during interaction for performance
        if ((chart as any)?._isInteracting) return;
        const imgCache = (chart as any)._watermarkImg as
          | HTMLImageElement
          | undefined;
        let img = imgCache;
        if (!img) {
          img = new Image();
          img.src = 'assets/watermark.png'; // relative to app root
          (chart as any)._watermarkImg = img;
        }
        if (!img.complete) {
          img.onload = (): void => {
            try {
              chart.draw();
            } catch {
              /* ignore */
            }
          };
          return;
        }
        const maxWidth = area.width * 0.35; // scale relative to chart width
        const aspect = img.naturalWidth / (img.naturalHeight || 1);
        let drawW = Math.min(img.naturalWidth, maxWidth);
        let drawH = drawW / aspect;
        const maxHeight = area.height * 0.35;
        if (drawH > maxHeight) {
          drawH = maxHeight;
          drawW = drawH * aspect;
        }
        const cx = area.left + area.width / 2;
        const cy = area.top + area.height / 2;
        const x = cx - drawW / 2;
        const y = cy - drawH / 2;
        ctx.save();
        // Brighten watermark: previously 0.08 (very subtle). Increased alpha for more visibility.
        ctx.globalAlpha = 0.15; // brighter watermark
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, drawW, drawH);
        ctx.restore();
      } catch {
        // swallow errors
      }
    },
  },
];
