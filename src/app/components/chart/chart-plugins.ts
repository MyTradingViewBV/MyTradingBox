/* Centralized Chart.js custom plugins extracted from chart-component.ts
  Each plugin relies only on dataset flags (isBox, isKeyZone, isIndicator, isOrder)
  and the chart instance; no component state dependency.
  Lint relaxed here because these are thin wrappers over Chart.js runtime objects. */
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  backgroundColor?: string | CanvasGradient | CanvasPattern;
  borderColor?: string | CanvasGradient | CanvasPattern;
  borderWidth?: number;
  yAxisID?: string;
  data?: Array<{ [k: string]: any; x: any; y: any }>;
}

export const crosshairPlugin = {
  id: 'crosshair',
  afterDraw(chart: import('chart.js').Chart): void {
    const tooltip: any = chart.tooltip;
    const active = tooltip?.getActiveElements?.() || tooltip?.active;
    if (active?.length) {
      const ctx = chart.ctx as CanvasRenderingContext2D;
      const x = active[0].element.x;
      const y = active[0].element.y;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, chart.chartArea.top);
      ctx.lineTo(x, chart.chartArea.bottom);
      ctx.moveTo(chart.chartArea.left, y);
      ctx.lineTo(chart.chartArea.right, y);
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#555';
      ctx.stroke();
      ctx.restore();
    }
  },
};

// Filled box polygons painted behind candles
export const boxPainterPlugin = {
  id: 'boxPainter',
  afterDatasetsDraw(chart: import('chart.js').Chart): void {
    if ((chart as any)?._isInteracting) return;
    const ctx = chart.ctx as CanvasRenderingContext2D;
    const xScale: any = (chart.scales as any)['x'];
    const yScale: any = (chart.scales as any)['y'];
    if (!xScale || !yScale) return;

    ctx.save();
    try {
      ctx.globalCompositeOperation = 'destination-over';
  (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
        if (!ds || !ds.isBox) return;
        const pts = ds.data || [];
        if (!pts.length) return;
        ctx.beginPath();
  pts.forEach((p: any, i: number) => {
          const px = xScale.getPixelForValue(p.x);
          const py = yScale.getPixelForValue(p.y);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = ds.backgroundColor || 'rgba(0,200,0,0.12)';
        ctx.fill();
        ctx.lineWidth = ds.borderWidth ?? 2;
        ctx.strokeStyle = ds.borderColor || 'rgba(0,200,0,0.9)';
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
    let pixels = labels.map(l => ({ ...l, yPx: yScale.getPixelForValue(l.yVal) }))
                       .sort((a,b) => a.yPx - b.yPx);

    const canvasWidth = chart.width || (chart.canvas && chart.canvas.width) || 800;
    const isNarrow = canvasWidth < 480;
    const isMedium = canvasWidth < 800 && canvasWidth >= 480;
    const minSpacing = isNarrow ? 12 : isMedium ? 14 : 16;
    const fontSize = isNarrow ? 10 : isMedium ? 11 : 12;
    const boxH = isNarrow ? 16 : isMedium ? 18 : 20;
    const padding = isNarrow ? 4 : 6;

    const groupingThreshold = Math.max(10, Math.round(minSpacing * 1.2));
    const groups: Array<{ yPx: number; items: typeof pixels }> = [];
    for (const p of pixels) {
      if (!groups.length) { groups.push({ yPx: p.yPx, items: [p] }); continue; }
      const last = groups[groups.length -1];
      const lastItem = last.items[last.items.length -1];
      if (Math.abs(p.yPx - lastItem.yPx) <= groupingThreshold) {
        last.items.push(p);
        last.yPx = last.items.reduce((s,it) => s + it.yPx,0) / last.items.length;
      } else groups.push({ yPx: p.yPx, items: [p] });
    }
    const maxGroups = isNarrow ? 6 : isMedium ? 12 : 999;
    let extraGroupCount = 0;
    let renderGroups = groups;
    if (groups.length > maxGroups) {
      const step = Math.ceil(groups.length / maxGroups);
      const sampled: typeof groups = [];
      for (let i=0;i<groups.length;i+=step) sampled.push(groups[i]);
      extraGroupCount = groups.length - sampled.length;
      renderGroups = sampled;
    }
    renderGroups.sort((a,b) => a.yPx - b.yPx);
    for (let i=1;i<renderGroups.length;i++) {
      if (renderGroups[i].yPx - renderGroups[i-1].yPx < minSpacing) {
        renderGroups[i].yPx = renderGroups[i-1].yPx + minSpacing;
      }
    }
    for (let i=0;i<renderGroups.length;i++) {
      const topLimit = chartArea.top + 6 + i * minSpacing;
      const bottomLimit = chartArea.bottom - 6 - (renderGroups.length -1 - i) * minSpacing;
      if (renderGroups[i].yPx < topLimit) renderGroups[i].yPx = topLimit;
      if (renderGroups[i].yPx > bottomLimit) renderGroups[i].yPx = bottomLimit;
    }
    ctx.save();
    ctx.font = `${fontSize}px Arial`;
    ctx.textBaseline = 'middle';
    renderGroups.forEach(g => {
      const shortTexts = g.items.map(it => it.text.replace(/retracement/gi,'retr').replace(/extension/gi,'ext'));
      let displayText = '';
      if (shortTexts.length <= 3) displayText = shortTexts.join(' / ');
      else displayText = `${shortTexts.slice(0,2).join(' / ')} (+${shortTexts.length - 2})`;
      if (isNarrow && displayText.length > 30) displayText = displayText.substring(0,30) + '…';
      const colors = Array.from(new Set(g.items.map(it => it.color)));
      const color = colors.length === 1 ? colors[0] : '#FFD700';
      const metrics = ctx.measureText(displayText);
      const textW = Math.min(metrics.width, canvasWidth * 0.35);
      const boxW = textW + padding * 2 + 10;
      const x = rightX - boxW;
      const y = g.yPx - boxH/2;
      ctx.fillStyle = 'rgba(10,10,10,0.75)';
      roundRect(ctx, x, y, boxW, boxH, 4, true, false);
      ctx.fillStyle = color || '#FFD700';
      ctx.fillRect(x + 2, y + 2, 6, boxH - 4);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(displayText, x + padding + 8, g.yPx, boxW - padding*2 - 10);
    });
    if (extraGroupCount > 0) {
      const badgeText = `+${extraGroupCount}`;
      ctx.font = `${Math.max(10, fontSize)}px Arial`;
      const metrics = ctx.measureText(badgeText);
      const bw = metrics.width + 10;
      const bh = Math.max(16, boxH);
      const bx = rightX - bw;
      const by = chartArea.top + 6;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      roundRect(ctx, bx, by, bw, bh, 4, true, false);
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.textAlign = 'center';
      ctx.fillText(badgeText, bx + bw/2, by + bh/2);
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
    if (!xScale) return;
    ctx.save();
    ctx.textBaseline = 'middle';
  (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
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
  const py = yScaleToUse ? yScaleToUse.getPixelForValue(p.y) : ((chart.scales as any)['y']?.getPixelForValue(p.y) ?? 0);
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText(glyph, px - size/2 + (ds.glyphOffsetX ?? 0), py + (ds.glyphOffsetY ?? 0));
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
    let pixels = entries.map(l => ({ ...l, yPx: yScale.getPixelForValue(l.yVal) }))
                        .sort((a,b) => a.yPx - b.yPx);
    const minSpacing = 14;
    const boxH = 18;
    const padding = 6;
    for (let i=1;i<pixels.length;i++) {
      if (pixels[i].yPx - pixels[i-1].yPx < minSpacing) pixels[i].yPx = pixels[i-1].yPx + minSpacing;
    }
    for (let i=0;i<pixels.length;i++) {
      const topLimit = chartArea.top + 6 + i * minSpacing;
      const bottomLimit = chartArea.bottom - 6 - (pixels.length -1 - i) * minSpacing;
      if (pixels[i].yPx < topLimit) pixels[i].yPx = topLimit;
      if (pixels[i].yPx > bottomLimit) pixels[i].yPx = bottomLimit;
    }
    ctx.save();
    ctx.font = '12px Arial';
    ctx.textBaseline = 'middle';
    pixels.forEach(p => {
      const displayText = p.text || '';
      const metrics = ctx.measureText(displayText);
      const textW = Math.min(metrics.width, (chart.width || 800) * 0.35);
      const boxW = textW + padding * 2 + 8;
      const x = rightX - boxW;
      const y = p.yPx - boxH/2;
      ctx.fillStyle = 'rgba(10,10,10,0.8)';
      roundRect(ctx, x, y, boxW, boxH, 4, true, false);
      ctx.fillStyle = p.color || '#FFD700';
      ctx.fillRect(x + 2, y + 2, 6, boxH - 4);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(displayText, x + padding + 8, p.yPx, boxW - padding*2 - 10);
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
      const chartArea = chart.chartArea;
      if (!yScale || !chartArea || !ctx) return;
      const entries: Array<{ y: number; text: string; color: string }> = [];
  (chart.data.datasets as ExtendedDataset[]).forEach((ds) => {
        if (!ds || !ds.isBox) return;
        const pts = ds.data || [];
        if (!pts.length) return;
        const ys = pts.map((p: any) => typeof p === 'object' ? Number(p.y ?? p?.Price ?? p?.value ?? NaN) : Number(p))
                      .filter((v: number) => !Number.isNaN(v));
        if (!ys.length) return;
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const labelMin = ds.boxLabelMin ?? (minY >= 1000 ? minY.toLocaleString() : minY.toFixed(2));
        const labelMax = ds.boxLabelMax ?? (maxY >= 1000 ? maxY.toLocaleString() : maxY.toFixed(2));
        const color = (ds.borderColor as any) || '#fff';
        entries.push({ y: minY, text: labelMin, color });
        entries.push({ y: maxY, text: labelMax, color });
      });
      if (!entries.length) return;
      let pixels = entries.map(e => ({ ...e, yPx: yScale.getPixelForValue(e.y) }))
                          .sort((a,b) => a.yPx - b.yPx);
      const canvasWidth = chart.width || (chart.canvas && chart.canvas.width) || 800;
      const isNarrow = canvasWidth < 480;
      const fontSize = isNarrow ? 10 : 11;
      const minSpacing = isNarrow ? 14 : 18;
      const boxH = fontSize + 8;
      const padding = 6;
      for (let i=1;i<pixels.length;i++) {
        if (pixels[i].yPx - pixels[i-1].yPx < minSpacing) pixels[i].yPx = pixels[i-1].yPx + minSpacing;
      }
      for (let i=0;i<pixels.length;i++) {
        const topLimit = chartArea.top + 6 + i * minSpacing;
        const bottomLimit = chartArea.bottom - 6 - (pixels.length -1 - i) * minSpacing;
        if (pixels[i].yPx < topLimit) pixels[i].yPx = topLimit;
        if (pixels[i].yPx > bottomLimit) pixels[i].yPx = bottomLimit;
      }
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textBaseline = 'middle';
      const rightX = chartArea.right - 6;
      pixels.forEach(p => {
        const text = p.text?.toString() ?? '';
        const metrics = ctx.measureText(text);
        const textW = Math.min(metrics.width, canvasWidth * 0.35);
        const w = Math.ceil(textW) + padding*2 + 8;
        const h = boxH;
        const x = rightX - w;
        const y = p.yPx - h/2;
        ctx.fillStyle = 'rgba(10,10,10,0.9)';
        roundRect(ctx, x, y, w, h, 6, true, false);
        ctx.fillStyle = p.color || '#fff';
        ctx.fillRect(x + 2, y + 2, 6, h - 4);
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(text, x + padding + 8, p.yPx, w - padding*2 - 10);
      });
      ctx.restore();
    } catch (err) {
      console.warn('boxLabelPlugin error', err);
    }
  },
};

// Aggregate export for easy import
export const chartCustomPlugins = [
  crosshairPlugin,
  boxPainterPlugin,
  keyzonesLabelPlugin,
  indicatorLabelPlugin,
  orderLabelPlugin,
  boxLabelPlugin,
];
