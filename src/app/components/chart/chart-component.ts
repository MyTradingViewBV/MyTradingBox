/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/prefer-for-of */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
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
import {
  MarketService,
  SymbolModel,
  // KeyZonesModel is defined in market.service.ts
} from '../../modules/shared/http/market.service';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AppService } from '../../modules/shared/http/appService';
import { AppActions } from '../../store/app.actions';
import { tap, switchMap, map, of, forkJoin, Observable } from 'rxjs';

//
// ?? Crosshair plugin for better interactivity
//
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
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#555';
      ctx.stroke();
      ctx.restore();
    }
  },
};

// Plugin to paint filled boxes reliably (draw fill+border behind datasets so candles fully cover them)
const boxPainterPlugin = {
  id: 'boxPainter',
  // Draw boxes after datasets but using destination-over so they appear behind candles
  afterDatasetsDraw(chart: any): void {
    const ctx = chart.ctx;
    const xScale = chart.scales?.x;
    const yScale = chart.scales?.y;
    if (!xScale || !yScale) return;

    // draw boxes behind already drawn candles
    ctx.save();
    try {
      ctx.globalCompositeOperation = 'destination-over';

      chart.data.datasets.forEach((ds: any) => {
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

        // fill then stroke
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

// Plugin to render KeyZones labels pinned to right and stacked to avoid overlap
const keyzonesLabelPlugin = {
  id: 'keyzonesLabels',
  afterDatasetsDraw(chart: any) {
    const ctx = chart.ctx;
    const xScale = chart.scales?.x;
    const yScale = chart.scales?.y;
    if (!xScale || !yScale) return;

    const chartArea = chart.chartArea;
    const rightX = chartArea.right - 6; // small inset from right edge

    // collect label entries from datasets flagged as keyzone
    const labels: Array<{ yVal: number; text: string; color: string }> = [];
    chart.data.datasets.forEach((ds: any) => {
      if (!ds || !ds.isKeyZone) return;

      const pts = ds.data || [];
      if (!pts.length) return;

      const yVal = pts[0].y ?? pts[0]?.Price ?? null;
      if (yVal == null) return;

      // Ensure there is always a readable keyLabel and color
      const rawText = (ds.keyLabel || ds.label || '').toString();
      const text = rawText || `${ds.keyLabel || ds.label || 'key'}`;
      const color = ds.keyColor || (ds.borderColor as any) || '#fff';
      labels.push({ yVal: Number(yVal), text, color });
    });

    if (!labels.length) return;

    // convert to pixel positions and sort top-to-bottom
    let pixels = labels
      .map((l) => ({ ...l, yPx: yScale.getPixelForValue(l.yVal) }))
      .sort((a, b) => a.yPx - b.yPx);

    // Responsive behavior: adjust font/spacing based on canvas width
    const canvasWidth = chart.width || (chart.canvas && chart.canvas.width) || 800;
    const isNarrow = canvasWidth < 480;
    const isMedium = canvasWidth < 800 && canvasWidth >= 480;

    const minSpacing = isNarrow ? 12 : isMedium ? 14 : 16; // px (used for stacking)
    const fontSize = isNarrow ? 10 : isMedium ? 11 : 12;
    const boxH = isNarrow ? 16 : isMedium ? 18 : 20;
    const padding = isNarrow ? 4 : 6;

    // Group nearby labels into clusters to reduce clutter
    const groupingThreshold = Math.max(10, Math.round(minSpacing * 1.2));
    const groups: Array<{ yPx: number; items: typeof pixels }> = [];

    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      if (!groups.length) {
        groups.push({ yPx: p.yPx, items: [p] });
        continue;
      }
      const last = groups[groups.length - 1];
      // if this label is close to last group's last item, add to group
      const lastItem = last.items[last.items.length - 1];
      if (Math.abs(p.yPx - lastItem.yPx) <= groupingThreshold) {
        last.items.push(p);
        // keep group's yPx as average for nicer vertical placement
        last.yPx = last.items.reduce((s, it) => s + it.yPx, 0) / last.items.length;
      } else {
        groups.push({ yPx: p.yPx, items: [p] });
      }
    }

    // After grouping, optionally sample if too many groups for narrow screens
    const maxGroups = isNarrow ? 6 : isMedium ? 12 : 999;
    let extraGroupCount = 0;
    let renderGroups = groups;
    if (groups.length > maxGroups) {
      // pick evenly spaced groups to keep distribution
      const step = Math.ceil(groups.length / maxGroups);
      const sampled: typeof groups = [];
      for (let i = 0; i < groups.length; i += step) sampled.push(groups[i]);
      extraGroupCount = groups.length - sampled.length;
      renderGroups = sampled;
    }

    // ensure stacked spacing among renderGroups
    renderGroups.sort((a, b) => a.yPx - b.yPx);
    for (let i = 1; i < renderGroups.length; i++) {
      if (renderGroups[i].yPx - renderGroups[i - 1].yPx < minSpacing) {
        renderGroups[i].yPx = renderGroups[i - 1].yPx + minSpacing;
      }
    }

    // ensure groups stay within chart area vertically
    for (let i = 0; i < renderGroups.length; i++) {
      const topLimit = chartArea.top + 6 + i * minSpacing;
      const bottomLimit = chartArea.bottom - 6 - (renderGroups.length - 1 - i) * minSpacing;
      if (renderGroups[i].yPx < topLimit) renderGroups[i].yPx = topLimit;
      if (renderGroups[i].yPx > bottomLimit) renderGroups[i].yPx = bottomLimit;
    }

    // draw labels for each group
    ctx.save();
    ctx.font = `${fontSize}px Arial`;
    ctx.textBaseline = 'middle';

    renderGroups.forEach((g) => {
      // build combined text: show up to 3 items, otherwise show first 2 + (+N)
      const items = g.items;
      const shortTexts = items.map((it) => it.text.replace(/retracement/gi, 'retr').replace(/extension/gi, 'ext'));
      let displayText = '';
      if (shortTexts.length <= 3) displayText = shortTexts.join(' / ');
      else displayText = `${shortTexts.slice(0, 2).join(' / ')} (+${shortTexts.length - 2})`;

      // for very narrow views shorten further
      if (isNarrow && displayText.length > 30) displayText = displayText.substring(0, 30) + '…';

      // color: if items have same color pick it, otherwise use gold for mixed
      const colors = Array.from(new Set(items.map((it) => it.color)));
      const color = colors.length === 1 ? colors[0] : '#FFD700';

      const metrics = ctx.measureText(displayText);
      const textW = Math.min(metrics.width, canvasWidth * 0.35); // clamp width
      const boxW = textW + padding * 2 + 10; // extra for color strip
      const x = rightX - boxW;
      const y = g.yPx - boxH / 2;

      // background
      ctx.fillStyle = 'rgba(10,10,10,0.75)';
      roundRect(ctx, x, y, boxW, boxH, 4, true, false);

      // colored strip on left of label
      ctx.fillStyle = color || '#FFD700';
      ctx.fillRect(x + 2, y + 2, 6, boxH - 4);

      // text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(displayText, x + padding + 8, g.yPx, boxW - padding * 2 - 10);
    });

    // if we sampled groups show +N badge
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
      ctx.fillText(badgeText, bx + bw / 2, by + bh / 2);
    }

    ctx.restore();

    // helper for rounded rect
    function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
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
  },
};

// Plugin to render indicator glyph labels (?, ?, ?) pinned to candles
const indicatorLabelPlugin = {
  id: 'indicatorLabels',
  afterDatasetsDraw(chart: any) {
    const ctx = chart.ctx;
    const xScale = chart.scales?.x;
    if (!xScale) return;

    ctx.save();
    ctx.textBaseline = 'middle';
    // iterate datasets marked as indicator
    chart.data.datasets.forEach((ds: any) => {
      if (!ds || !ds.isIndicator) return;
      const pts = ds.data || [];
      if (!pts.length) return;

      const glyph = ds.glyph || '';
      const color = ds.glyphColor || '#fff';
      const size = ds.glyphSize ?? 14;
      ctx.fillStyle = color;
      ctx.font = `${size}px Arial`;
      // use dataset's yAxis if present so indicator glyphs don't force main y-scale
      const yScaleForDs = chart.scales?.[ds.yAxisID || 'y'];
      const yScaleToUse = yScaleForDs || chart.scales?.y;
      pts.forEach((p: any) => {
        const px = xScale.getPixelForValue(p.x);
        const py = yScaleToUse ? yScaleToUse.getPixelForValue(p.y) : (chart.scales?.y?.getPixelForValue(p.y) ?? 0);
        // optional small shadow for contrast
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 4;
        ctx.fillText(glyph, px - size / 2 + (ds.glyphOffsetX ?? 0), py + (ds.glyphOffsetY ?? 0));
        ctx.restore();
      });
    });
    ctx.restore();
  },
};

// Plugin to render Order labels pinned to right and stacked to avoid overlap
const orderLabelPlugin = {
  id: 'orderLabels',
  afterDatasetsDraw(chart: any) {
    const ctx = chart.ctx;
    const xScale = chart.scales?.x;
    const yScale = chart.scales?.y;
    if (!xScale || !yScale) return;

    const chartArea = chart.chartArea;
    const rightX = chartArea.right - 6;

    const entries: Array<{ yVal: number; text: string; color: string }> = [];
    chart.data.datasets.forEach((ds: any) => {
      if (!ds || !ds.isOrder) return;
      const pts = ds.data || [];
      if (!pts.length) return;
      const yVal = pts[0].y ?? pts[0]?.Price ?? null;
      if (yVal == null) return;
      const text = (ds.orderLabel || ds.label || '').toString();
      const color = ds.orderColor || (ds.borderColor as any) || '#fff';
      entries.push({ yVal: Number(yVal), text, color });
    });

    if (!entries.length) return;

    // convert to pixel positions and sort top-to-bottom
    let pixels = entries.map((l) => ({ ...l, yPx: yScale.getPixelForValue(l.yVal) })).sort((a, b) => a.yPx - b.yPx);

    // stacking spacing
    const minSpacing = 14;
    const boxH = 18;
    const padding = 6;

    // adjust to avoid overlap
    for (let i = 1; i < pixels.length; i++) {
      if (pixels[i].yPx - pixels[i - 1].yPx < minSpacing) {
        pixels[i].yPx = pixels[i - 1].yPx + minSpacing;
      }
    }

    // clamp within chart area
    for (let i = 0; i < pixels.length; i++) {
      const topLimit = chartArea.top + 6 + i * minSpacing;
      const bottomLimit = chartArea.bottom - 6 - (pixels.length - 1 - i) * minSpacing;
      if (pixels[i].yPx < topLimit) pixels[i].yPx = topLimit;
      if (pixels[i].yPx > bottomLimit) pixels[i].yPx = bottomLimit;
    }

    // draw
    ctx.save();
    ctx.font = `12px Arial`;
    ctx.textBaseline = 'middle';

    pixels.forEach((p) => {
      const displayText = p.text || '';
      const metrics = ctx.measureText(displayText);
      const textW = Math.min(metrics.width, (chart.width || 800) * 0.35);
      const boxW = textW + padding * 2 + 8; // extra for color strip
      const x = rightX - boxW;
      const y = p.yPx - boxH / 2;

      // background
      ctx.fillStyle = 'rgba(10,10,10,0.8)';
      roundRect(ctx, x, y, boxW, boxH, 4, true, false);

      // color strip
      ctx.fillStyle = p.color || '#FFD700';
      ctx.fillRect(x + 2, y + 2, 6, boxH - 4);

      // text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText(displayText, x + padding + 8, p.yPx, boxW - padding * 2 - 10);
    });

    ctx.restore();

    function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
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
  },
};

// Plugin to render pinned min/max price labels for box datasets (isBox)
const boxLabelPlugin = {
  id: 'boxLabels',
  afterDatasetsDraw(chart: any) {
    try {
      const ctx = chart.ctx;
      const yScale = chart.scales?.y;
      const chartArea = chart.chartArea;
      if (!yScale || !chartArea || !ctx) return;

      // Debug: log plugin run
      console.debug && console.debug('boxLabelPlugin: running, datasets=', chart.data.datasets?.length);

      // collect box entries
      const entries: Array<{ y: number; text: string; color: string }> = [];
      chart.data.datasets.forEach((ds: any) => {
        if (!ds || !ds.isBox) return;
        const pts = ds.data || [];
        if (!pts.length) return;

        const ys = pts
          .map((p: any) => (typeof p === 'object' ? Number(p.y ?? p?.Price ?? p?.value ?? NaN) : Number(p)))
          .filter((v: number) => !Number.isNaN(v));
        if (!ys.length) return;
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const labelMin = ds.boxLabelMin ?? (typeof minY === 'number' ? (minY >= 1000 ? minY.toLocaleString() : minY.toFixed(2)) : String(minY));
        const labelMax = ds.boxLabelMax ?? (typeof maxY === 'number' ? (maxY >= 1000 ? maxY.toLocaleString() : maxY.toFixed(2)) : String(maxY));
        const color = (ds.borderColor as any) || '#fff';

        entries.push({ y: minY, text: labelMin, color });
        entries.push({ y: maxY, text: labelMax, color });
      });

      if (!entries.length) {
        console.debug && console.debug('boxLabelPlugin: no entries found');
        return;
      }

      // map to pixel positions and sort top->bottom
      let pixels = entries.map((e) => ({ ...e, yPx: yScale.getPixelForValue(e.y) })).sort((a, b) => a.yPx - b.yPx);

      // stacking spacing and sizing
      const canvasWidth = chart.width || (chart.canvas && chart.canvas.width) || 800;
      const isNarrow = canvasWidth < 480;
      const fontSize = isNarrow ? 10 : 11;
      const minSpacing = isNarrow ? 14 : 18;
      const boxH = fontSize + 8;
      const padding = 6;

      // adjust to avoid overlaps
      for (let i = 1; i < pixels.length; i++) {
        if (pixels[i].yPx - pixels[i - 1].yPx < minSpacing) {
          pixels[i].yPx = pixels[i - 1].yPx + minSpacing;
        }
      }

      // clamp within chart area
      for (let i = 0; i < pixels.length; i++) {
        const topLimit = chartArea.top + 6 + i * minSpacing;
        const bottomLimit = chartArea.bottom - 6 - (pixels.length - 1 - i) * minSpacing;
        if (pixels[i].yPx < topLimit) pixels[i].yPx = topLimit;
        if (pixels[i].yPx > bottomLimit) pixels[i].yPx = bottomLimit;
      }

      // drawing
      ctx.save();
      // ensure we draw on top
      try { ctx.globalCompositeOperation = 'source-over'; } catch (e) { }
      ctx.font = `bold ${fontSize}px Arial`;
      ctx.textBaseline = 'middle';

      const rightX = chartArea.right - 6;

      pixels.forEach((p) => {
        const text = p.text?.toString() ?? '';
        const metrics = ctx.measureText(text);
        const textW = Math.min(metrics.width, canvasWidth * 0.35);
        const w = Math.ceil(textW) + padding * 2 + 8; // extra for color strip
        const h = boxH;
        const x = rightX - w;
        const y = p.yPx - h / 2;

        // background
        ctx.fillStyle = 'rgba(10,10,10,0.9)';
        roundRect(ctx, x, y, w, h, 6, true, false);

        // color strip
        ctx.fillStyle = p.color || '#fff';
        ctx.fillRect(x + 2, y + 2, 6, h - 4);

        // text
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.fillText(text, x + padding + 8, p.yPx, w - padding * 2 - 10);
      });

      ctx.restore();

      function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
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
    } catch (err) {
      // avoid breaking chart on plugin error
      console.warn('boxLabelPlugin error', err);
    }
  },
};

//
// ?? Register Chart.js controllers and plugins
//
ChartJS.register(
  TimeScale,
  LinearScale,
  Tooltip,
  Title,
  Legend,
  CandlestickController,
  CandlestickElement,
  zoomPlugin,
  crosshairPlugin,
  boxPainterPlugin,
  keyzonesLabelPlugin,
  indicatorLabelPlugin,
  orderLabelPlugin,
  boxLabelPlugin, // ensure labels are painted on top
);

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [
    CommonModule,
    NgChartsModule,
    FormsModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
  ],
  templateUrl: './chart-component.html',
  styleUrls: ['./chart-component.scss'],
})
export class ChartComponent implements OnInit {
  // Mark static:true so it's available during ngOnInit (we access the chart soon after data loads)
  @ViewChild(BaseChartDirective, { static: true }) chart?: BaseChartDirective;
  @ViewChild('chartCanvas', { read: ElementRef }) chartCanvas?: ElementRef;
  showSettings = false;
  chartData: any = { datasets: [] };
  boxes: any[] = [];
  // store base candle data for overlays
  baseData: any[] = [];
  // Orders
  showOrders = false;
  orders: any[] = [];

  // New: mode for boxes fetching: 'boxes' = current (v2), 'all' = getBoxes (v1)
  boxMode: 'boxes' | 'all' = 'boxes';

  // KeyZones toggle and storage
  showKeyZones = false; // default off
  keyZones: any = null;

  // Touch/gesture tracking (simplified)
  isInteracting = false;
  gestureType: 'pan' | 'zoom-x' | 'zoom-y' | 'pinch' | null = null;
  touchStart: { x: number; y: number; time: number } | null = null;
  mouseStart: { x: number; y: number; time: number } | null = null;
  lastTouches: TouchList | null = null;
  initialPinchDistance = 0;
  fullDataRange: { min: number; max: number } = { min: 0, max: 0 };
  initialYRange: { min: number; max: number } = { min: 0, max: 0 };

  // TradingView-style interface data
  selectedSymbol: SymbolModel = new SymbolModel();
  // track selected symbol by name for template binding (simpler equality)
  selectedSymbolName = '';

  // compareWith function for mat-select to compare symbols by SymbolName instead of object reference
  public compareSymbols = (a: SymbolModel | null, b: SymbolModel | null): boolean => {
    if (a === b) return true;
    if (!a || !b) return false;
    return (a.SymbolName || '').toString().toUpperCase() === (b.SymbolName || '').toString().toUpperCase();
  };

  selectedTimeframe = '1d';
  availableSymbols: SymbolModel[] = [];
  currentPrice = 0;
  priceChange = 0;
  priceChangeFormatted = '';
  sellPrice = 0;
  buyPrice = 0;
  spread = 0;

  timeframes = [
    { label: '12m', value: '12m' },
    { label: '24m', value: '24m' },
    { label: '1H', value: '1h' },
    { label: '4H', value: '4h' },
    { label: '1D', value: '1d' },
    { label: '1W', value: '1w' },
    { label: '1M', value: '1M' },
  ];

  symbols: SymbolModel[] = [];
  // selectedSymbol: SymbolModel = new SymbolModel(); // ? now full object
  showBoxes = true;

  // Indicator toggle and storage
  showIndicators = true; // default ON as requested
  indicatorSignals: any[] = [];

  // Chart constraints
  readonly MIN_CANDLES_VISIBLE = 10;
  readonly PAN_SENSITIVITY = 1.0;

  //
  // ?? Simplified chart options for TradingView look
  //
  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      intersect: false,
      axis: 'x',
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false }, // Disable default tooltips for cleaner look
      datalabels: { display: false },
      zoom: {
        pan: { enabled: false },
        zoom: {
          wheel: { enabled: false },
          pinch: { enabled: false },
          drag: { enabled: false },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        display: true, // Hide x-axis for cleaner look
      },
      y: {
        position: 'right',
        beginAtZero: false,
        grid: {
          color: '#1a1a1a',
          borderColor: 'transparent',
          drawBorder: false,
        },
        ticks: {
          color: '#666',
          callback: (val: any) => Number(val).toFixed(2),
          maxTicksLimit: 8,
          padding: 10,
        },
      },
      // hidden indicator axis so indicator datasets do not affect main y-scale
      indicator: {
        display: false,
        position: 'left',
        grid: { display: false },
        ticks: { display: false },
        type: 'linear',
      },
    },
    layout: {
      backgroundColor: '#131722',
      padding: { top: 10, right: 10, bottom: 10, left: 10 },
    },
  };

  constructor(
    private marketService: MarketService,
    private _appService: AppService,
    private route: ActivatedRoute,
  ) { }

  ngOnInit(): void {
    // Read route params (symbol/timeframe) if provided; timeframe optional
    const paramSymbol = this.route.snapshot.paramMap.get('symbol');
    const paramTimeframe = this.route.snapshot.paramMap.get('timeframe');
    if (paramTimeframe) this.selectedTimeframe = paramTimeframe;
    if (paramSymbol) {
      // Pre-dispatch so loadSymbolsAndBoxes picks it up and aligns references
      const minimal = new SymbolModel();
      minimal.SymbolName = paramSymbol;
      this._appService.dispatchAppAction(AppActions.setSelectedSymbol({ symbol: minimal }));
      try { localStorage.setItem('selectedSymbol', paramSymbol); } catch { /* ignore */ }
    }
    this.loadSymbolsAndBoxes();
  }

  // Helper: safely update datasets while preserving current axis view to avoid unexpected auto-zoom
  private safeUpdateDatasets(modifier: () => void): void {
    const chartRef = this.chart?.chart as any;
    let saved: any = null;
    if (chartRef && chartRef.scales) {
      try {
        const xScale = chartRef.scales.x;
        const yScale = chartRef.scales.y;
        saved = {
          xMin: xScale && typeof xScale.min === 'number' ? xScale.min : xScale?.options?.min,
          xMax: xScale && typeof xScale.max === 'number' ? xScale.max : xScale?.options?.max,
          yMin: yScale && typeof yScale.min === 'number' ? yScale.min : yScale?.options?.min,
          yMax: yScale && typeof yScale.max === 'number' ? yScale.max : yScale?.options?.max,
        };
      } catch (e) {
        saved = null;
      }
    }

    // If we captured runtime ranges, persist them into chartOptions so ng2-charts recreation preserves view
    if (saved) {
      try {
        this.chartOptions = this.chartOptions || {};
        this.chartOptions.scales = this.chartOptions.scales || {};
        this.chartOptions.scales.x = this.chartOptions.scales.x || {};
        this.chartOptions.scales.y = this.chartOptions.scales.y || {};

        if (saved.xMin !== undefined) this.chartOptions.scales.x.min = saved.xMin;
        if (saved.xMax !== undefined) this.chartOptions.scales.x.max = saved.xMax;
        if (saved.yMin !== undefined) this.chartOptions.scales.y.min = saved.yMin;
        if (saved.yMax !== undefined) this.chartOptions.scales.y.max = saved.yMax;

        // Force change detection by replacing the object reference so ng2-charts will not recreate with default autoscale
        this.chartOptions = { ...this.chartOptions, scales: { ...(this.chartOptions.scales || {}) } };
      } catch (e) {
        // ignore
      }
    }

    // apply dataset changes
    modifier();

    // ensure change detection for ng2-charts
    this.chartData = { datasets: this.chartData.datasets.slice() };

    // reapply saved axis ranges to current chart instance as well
    if (chartRef && chartRef.scales && saved) {
      try {
        if (!chartRef.config) chartRef.config = { options: { scales: {} } };
        chartRef.config.options = chartRef.config.options || {};
        chartRef.config.options.scales = chartRef.config.options.scales || {};

        if (saved.xMin !== undefined) chartRef.config.options.scales.x = { ...(chartRef.config.options.scales.x || {}), min: saved.xMin };
        if (saved.xMax !== undefined) chartRef.config.options.scales.x = { ...(chartRef.config.options.scales.x || {}), max: saved.xMax };
        if (saved.yMin !== undefined) chartRef.config.options.scales.y = { ...(chartRef.config.options.scales.y || {}), min: saved.yMin };
        if (saved.yMax !== undefined) chartRef.config.options.scales.y = { ...(chartRef.config.options.scales.y || {}), max: saved.yMax };

        if (chartRef.scales.x) {
          chartRef.scales.x.options = chartRef.scales.x.options || {};
          if (saved.xMin !== undefined) chartRef.scales.x.options.min = saved.xMin;
          if (saved.xMax !== undefined) chartRef.scales.x.options.max = saved.xMax;
          try { if (typeof saved.xMin === 'number') chartRef.scales.x.min = saved.xMin; } catch (e) { }
          try { if (typeof saved.xMax === 'number') chartRef.scales.x.max = saved.xMax; } catch (e) { }
        }
        if (chartRef.scales.y) {
          chartRef.scales.y.options = chartRef.scales.y.options || {};
          if (saved.yMin !== undefined) chartRef.scales.y.options.min = saved.yMin;
          if (saved.yMax !== undefined) chartRef.scales.y.options.max = saved.yMax;
          try { if (typeof saved.yMin === 'number') chartRef.scales.y.min = saved.yMin; } catch (e) { }
          try { if (typeof saved.yMax === 'number') chartRef.scales.y.max = saved.yMax; } catch (e) { }
        }
      } catch (e) {
        // ignore
      }
      try { chartRef.update('none'); } catch (e) { try { this.chart?.update(); } catch (ee) { } }
    } else {
      try { this.chart?.update(); } catch (e) { /* ignore */ }
    }
  }

  // New helper: keep the hidden 'indicator' axis in sync with main y-axis so indicator glyphs remain pinned to candle prices when panning/zooming
  private syncIndicatorAxis(chartRef: any): void {
    if (!chartRef || !chartRef.scales) return;
    try {
      const yScale = chartRef.scales.y;
      if (!yScale) return;

      const yMin = typeof yScale.min === 'number' ? yScale.min : yScale.options?.min;
      const yMax = typeof yScale.max === 'number' ? yScale.max : yScale.options?.max;
      if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) return;

      // Update runtime config options
      chartRef.config = chartRef.config || {};
      chartRef.config.options = chartRef.config.options || {};
      chartRef.config.options.scales = chartRef.config.options.scales || {};
      chartRef.config.options.scales.indicator = chartRef.config.options.scales.indicator || {};
      chartRef.config.options.scales.indicator.min = yMin;
      chartRef.config.options.scales.indicator.max = yMax;

      // Update runtime scale object if present
      const indScale = chartRef.scales.indicator;
      if (indScale) {
        indScale.options = indScale.options || {};
        indScale.options.min = yMin;
        indScale.options.max = yMax;
        try { indScale.min = yMin; indScale.max = yMax; } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // ignore errors
    }
  }

  loadSymbolsAndBoxes(): void {
    this.marketService.getSymbols().pipe(
      tap((symbols: any[]) => {
        this.availableSymbols = symbols || [];
        console.log('symbols:', symbols);
      }),
      switchMap((symbols: any[]) => this._appService.getSelectedSymbol().pipe(
        map((stored: any) => {
          if (!stored || !stored.SymbolName) {
            try {
              const ls = localStorage.getItem('selectedSymbol');
              if (ls) {
                const minimal = new SymbolModel();
                minimal.SymbolName = ls;
                stored = minimal;
                this._appService.dispatchAppAction(AppActions.setSelectedSymbol({ symbol: minimal }));
              }
            } catch { /* ignore */ }
          }
          if (stored && stored.SymbolName) {
            const match = (symbols || []).find((s: any) => (s.SymbolName || '').toString().toUpperCase() === (stored.SymbolName || '').toString().toUpperCase());
            return (match as SymbolModel) || (stored as SymbolModel);
          }
          const preferred = ['BTCUSDT', 'BTC-EUR', 'BTCUSD'];
          let chosen: SymbolModel | null = null;
          if (symbols && symbols.length) {
            for (const p of preferred) {
              const found = symbols.find((s: any) => (s.SymbolName || '').toString().toUpperCase() === p.toUpperCase());
              if (found) { chosen = found as SymbolModel; break; }
            }
            if (!chosen) chosen = symbols[0] as SymbolModel;
          } else {
            chosen = new SymbolModel();
          }
          console.warn('?? No valid stored symbol, selecting:', chosen?.SymbolName || '<none>');
          this._appService.dispatchAppAction(AppActions.setSelectedSymbol({ symbol: chosen }));
          return chosen as SymbolModel;
        }),
        tap((selected: SymbolModel) => {
          this.selectedSymbol = selected;
          this.selectedSymbolName = selected?.SymbolName || '';
        }),
        map((selected: SymbolModel) => selected.SymbolName)
      )),
      switchMap((symbolName: string) => {
        console.log('?? Loading candles for:', symbolName);
        return this.loadCandles(symbolName).pipe(
          switchMap(() => forkJoin({
            boxes: this.fetchBoxes(symbolName),
            orders: this.showOrders ? this.fetchOrders(symbolName) : of([])
          }))
        );
      })
    ).subscribe({
      error: (err) => console.warn('loadSymbolsAndBoxes error', err)
    });
  }

  // Called when user switches mode in UI
  onBoxModeChange(mode: 'boxes' | 'all'): void {
    const previous = this.boxMode;
    this.boxMode = mode;
    // ensure boxes are visible when switching mode
    this.showBoxes = true;

    if (this.selectedSymbol && this.selectedSymbol.SymbolName) {
      if (previous !== mode) {
        console.log('Switching box mode to', mode, ' — fetching boxes for', this.selectedSymbol.SymbolName);
      } else {
        console.log('Box mode selected again (no change) — refreshing boxes for', this.selectedSymbol.SymbolName);
      }
      this.fetchBoxes(this.selectedSymbol.SymbolName);
    } else {
      console.warn('No selectedSymbol available when changing box mode');
    }
  }

  // New: checkbox handler to support two checkbox menu items behaving like radio buttons
  onBoxModeCheckbox(mode: 'boxes' | 'all', checked: boolean): void {
    if (!checked) return; // don't allow unchecking both
    this.onBoxModeChange(mode);
  }

  // New: fetch boxes using selected mode
  fetchBoxes(symbolName: string): Observable<any[]> {
    if (!symbolName) return of([]);

    // clear any existing box state immediately so UI updates
    this.boxes = [];
    // remove existing box datasets from chart immediately (use isBox flag)
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isBox,
      );
    });

    const useAll = this.boxMode === 'all';
    console.log(`fetchBoxes: mode=${this.boxMode} symbol=${symbolName} timeframe=1d`);

    const obs = useAll
      ? this.marketService.getBoxes(symbolName, '1d')
      : this.marketService.getBoxesV2(symbolName, '1d');
    return obs.pipe(
      tap((arr: any[]) => {
        console.log(`fetchBoxes result mode=${this.boxMode} count=${(arr || []).length}`);
        if (arr && arr.length) console.log('first box sample:', arr[0]);
        this.boxes = (arr || []).filter(
          (b: any) => ((b.Type || b.type || '') + '').toLowerCase() === 'range',
        );
        console.log('boxes (filtered, mode=' + this.boxMode + '):', this.boxes.length);
        if (this.baseData && this.baseData.length && this.showBoxes) {
          this.addBoxesDatasets();
        }
      })
    );
  }

  onBoxesToggle(): void {
    console.log('?? onBoxesToggle triggered. showBoxes =', this.showBoxes);
    if (!this.showBoxes) {
      // clear box data and remove existing box datasets immediately
      this.boxes = [];
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d: any) => !d.isBox,
        );
      });
    } else if (this.selectedSymbol && this.selectedSymbol.SymbolName) {
      this.fetchBoxes(this.selectedSymbol.SymbolName).subscribe({ error: (e) => console.warn('fetchBoxes error', e) });
    }
  }

  toggleSettings(): void {
    this.showSettings = !this.showSettings;
  }

  onSymbolChange(symbol: SymbolModel): void {
    // ensure we clear any persisted axis ranges so the new symbol auto-fits
    this.clearScaleRanges();

    // support being called with either a SymbolModel or a symbol name string

    let symbolName: string | undefined;
    let symbolObj: SymbolModel | undefined;
    if (!symbol) return;
    if (typeof symbol === 'string') {
      symbolName = symbol as string;
      symbolObj = (this.availableSymbols || []).find(s => (s.SymbolName || '').toString().toUpperCase() === symbolName?.toString().toUpperCase());
    } else {
      symbolObj = symbol as SymbolModel;
      symbolName = symbolObj?.SymbolName;
    }
    if (symbolObj) {
      this._appService.dispatchAppAction(AppActions.setSelectedSymbol({ symbol: symbolObj }));
      this.selectedSymbol = symbolObj;
      this.selectedSymbolName = symbolName || '';
    } else if (symbolName) {
      // fallback: dispatch a minimal model with the name
      const minimal = new SymbolModel();
      minimal.SymbolName = symbolName;
      this._appService.dispatchAppAction(AppActions.setSelectedSymbol({ symbol: minimal }));
      this.selectedSymbolName = symbolName;
    }
    if (symbolName) {
      this.loadCandles(symbolName).pipe(
        switchMap(() => forkJoin({
          boxes: this.fetchBoxes(symbolName),
          orders: this.showOrders ? this.fetchOrders(symbolName) : of([])
        }))
      ).subscribe({ error: (e) => console.warn('onSymbolChange chain error', e) });
    }
  }

  // Clear any stored/forced axis min/max ranges so next data load auto-fits
  private clearScaleRanges(): void {
    try {
      // Clear stored chartOptions ranges
      if (!this.chartOptions) this.chartOptions = {};
      if (!this.chartOptions.scales) this.chartOptions.scales = {};
      if (!this.chartOptions.scales.x) this.chartOptions.scales.x = this.chartOptions.scales.x || {};
      if (!this.chartOptions.scales.y) this.chartOptions.scales.y = this.chartOptions.scales.y || {};
      delete this.chartOptions.scales.x.min;
      delete this.chartOptions.scales.x.max;
      delete this.chartOptions.scales.y.min;
      delete this.chartOptions.scales.y.max;

      // Also clear runtime chart instance ranges if available
      const chartRef = this.chart?.chart as any;
      if (chartRef && chartRef.config && chartRef.config.options && chartRef.config.options.scales) {
        if (chartRef.config.options.scales.x) {
          delete chartRef.config.options.scales.x.min;
          delete chartRef.config.options.scales.x.max;
        }
        if (chartRef.config.options.scales.y) {
          delete chartRef.config.options.scales.y.min;
          delete chartRef.config.options.scales.y.max;
        }
      }
      // Clear runtime scale option objects if present
      if (chartRef && chartRef.scales) {
        try { if (chartRef.scales.x && chartRef.scales.x.options) { delete chartRef.scales.x.options.min; delete chartRef.scales.x.options.max; } } catch (e) { }
        try { if (chartRef.scales.y && chartRef.scales.y.options) { delete chartRef.scales.y.options.min; delete chartRef.scales.y.options.max; } } catch (e) { }
      }

      try { chartRef?.update?.('none'); } catch (e) { /* ignore */ }
    } catch (e) {
      // ignore any errors in cleanup
    }
  }

  onTimeframeChange(timeframe: string): void {
    this.selectedTimeframe = timeframe;
    if (this.selectedSymbol) {
      this.loadCandles(this.selectedSymbol.SymbolName).subscribe({ error: (e) => console.warn('loadCandles error', e) });
    }
  }

  //
  // ?? Load chart data and update price info
  //
  loadCandles(symbol: string): Observable<any[]> {
    console.log('SSS', symbol);
    return this.marketService
      .getCandles(symbol, this.selectedTimeframe, 1000)
      .pipe(
        map((candles: any[]) => candles.map((c: any) => ({
          x: new Date(c.Time).getTime(),
          o: c.Open,
          h: c.High,
          l: c.Low,
          c: c.Close,
        }))),
        tap((mapped: any[]) => {
          if (!mapped.length) return;
          // store base data for overlays
          this.baseData = mapped;
          const latestCandle = mapped[mapped.length - 1];
          const previousCandle = mapped[mapped.length - 2];
          this.currentPrice = latestCandle.c;
          this.priceChange = previousCandle ? latestCandle.c - previousCandle.c : 0;
          this.priceChangeFormatted = this.formatPriceChange(this.priceChange, previousCandle?.c || 0);
          this.spread = this.currentPrice * 0.001;
          this.sellPrice = this.currentPrice - this.spread / 2;
          this.buyPrice = this.currentPrice + this.spread / 2;
          this.fullDataRange = { min: mapped[0].x, max: mapped[mapped.length - 1].x };
          const allHighs = mapped.map((c: any) => c.h);
          const allLows = mapped.map((c: any) => c.l);
          this.initialYRange = { min: Math.min(...allLows), max: Math.max(...allHighs) };
          this.chartData = {
            datasets: [
              {
                label: `${symbol} ${this.selectedTimeframe.toUpperCase()}`,
                data: mapped,
                type: 'candlestick',
                borderWidth: 1,
                borderColor: { up: '#26a69a', down: '#ef5350', unchanged: '#999' },
                backgroundColor: { up: '#26a69a', down: '#ef5350', unchanged: '#999' },
                wickColor: { up: '#26a69a', down: '#ef5350', unchanged: '#999' },
                color: { up: '#26a69a', down: '#ef5350', unchanged: '#999' },
                barPercentage: 100,
                categoryPercentage: 0.9,
                maxBarThickness: 50,
              },
            ],
          };
          if (this.boxes && this.boxes.length && this.showBoxes) {
            this.addBoxesDatasets();
          }
          if (!this.showIndicators) {
            this.safeUpdateDatasets(() => {
              this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isIndicator);
            });
          }
          this.scheduleInitializeChart(mapped);
          // Auto-load indicator signals on initial data load if the toggle is ON so the first user click behaves intuitively.
          // Previously the checkbox defaulted to checked but indicators were only fetched after a manual re-check cycle.
          if (this.showIndicators) {
            // Avoid duplicate fetches: only trigger if we currently have no indicator datasets.
            const hasIndicators = (this.chartData.datasets || []).some((d: any) => d.isIndicator);
            if (!hasIndicators) {
              this.fetchIndicatorSignals(symbol).subscribe({
                error: (e) => console.warn('initial indicator fetch error', e)
              });
            }
          }
        })
      );
  }

  // Attempt to initialize chart scales once the underlying Chart.js instance is available.
  // Falls back to a few animation frame retries if the ViewChild isn't ready yet.
  private _initTries = 0;
  private scheduleInitializeChart(data: any[]): void {
    const chartRef = this.chart?.chart as any;
    if (chartRef && chartRef.scales && chartRef.scales.x && chartRef.scales.y) {
      try { this.initializeChart(data); } catch (e) { console.warn('initializeChart failed', e); }
      return;
    }
    if (this._initTries > 10) { // give up after ~10 frames
      console.warn('scheduleInitializeChart: chart not ready after retries');
      return;
    }
    this._initTries++;
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => this.scheduleInitializeChart(data));
    } else {
      setTimeout(() => this.scheduleInitializeChart(data), 32);
    }
  }

  formatPriceChange(change: number, previousPrice: number): string {
    const changePercent = previousPrice ? (change / previousPrice) * 100 : 0;
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
  }

  // New: expose only the percent portion for topbar template
  get priceChangePercent(): string {
    // priceChangeFormatted is like: "+1.23 (+0.45%)"
    // we want only the percent inside parentheses, e.g. "+0.45%" (keeping the sign)
    if (!this.priceChangeFormatted) {
      // fallback compute quickly
      const prev = 0; // cannot compute here, but keep empty
      const percent = prev ? (this.priceChange / prev) * 100 : 0;
      const sign = this.priceChange >= 0 ? '+' : '';
      return `${sign}${percent.toFixed(2)}%`;
    }
    const match = this.priceChangeFormatted.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      // ensure trailing % exists
      const text = match[1].trim();
      return text.indexOf('%') !== -1 ? text : `${text}%`;
    }
    // default
    const sign = this.priceChange >= 0 ? '+' : '';
    const prev = 0;
    const percent = prev ? (this.priceChange / prev) * 100 : 0;
    return `${sign}${percent.toFixed(2)}%`;
  }

  initializeChart(data: any[]): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef) return;

    // Show last 100 candles initially for better mobile view
    const initialVisible = Math.min(100, data.length);
    const visibleData = data.slice(-initialVisible);

    const xMin = visibleData[0].x;
    const xMax = visibleData[visibleData.length - 1].x;

    const visibleHighs = visibleData.map((c: any) => c.h);
    const visibleLows = visibleData.map((c: any) => c.l);
    const yMin = Math.min(...visibleLows);
    const yMax = Math.max(...visibleHighs);
    const yBuffer = (yMax - yMin) * 0.05;

    chartRef.scales.x.options.min = xMin;
    chartRef.scales.x.options.max = xMax;
    chartRef.scales.y.options.min = yMin - yBuffer;
    chartRef.scales.y.options.max = yMax + yBuffer;

    chartRef.update('none');
    // keep hidden indicator axis aligned with main y-axis so indicator glyphs stay pinned
    this.syncIndicatorAxis(chartRef);
  }

  // Touch handlers
  onTouchStart(event: TouchEvent): void {
    event.preventDefault();
    this.isInteracting = true;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.touchStart = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
      this.gestureType = null; // Will be determined by movement direction and location
    } else if (event.touches.length === 2) {
      this.gestureType = 'pinch';
      this.lastTouches = event.touches;
      this.initialPinchDistance = this.getTouchDistance(this.lastTouches);
    }
  }

  onTouchMove(event: TouchEvent): void {
    event.preventDefault();

    if (!this.chart?.chart || !this.touchStart) return;
    const chartRef = this.chart.chart as any;

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - this.touchStart.x;
      const deltaY = touch.clientY - this.touchStart.y;

      // Check if touch started in axis area for zoom gestures
      if (
        !this.gestureType &&
        this.isTouchInAxisArea(this.touchStart, chartRef)
      ) {
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > 15 || absY > 15) {
          // Minimum threshold before detecting direction
          if (absX > absY) {
            this.gestureType = 'zoom-x'; // Horizontal swipe = zoom X (candle width)
          } else {
            this.gestureType = 'zoom-y'; // Vertical swipe = zoom Y (candle height)
          }
        }
      } else if (
        !this.gestureType &&
        !this.isTouchInAxisArea(this.touchStart, chartRef)
      ) {
        // Touch started in canvas area - enable panning
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > 10 || absY > 10) {
          // Lower threshold for pan detection
          this.gestureType = 'pan';
        }
      }

      // Apply gesture-specific action
      if (this.gestureType === 'zoom-x') {
        // Horizontal swipe = adjust candle width (zoom X-axis) - only in axis area
        this.handleHorizontalZoomSwipe(deltaX, chartRef);
        this.touchStart.x = touch.clientX; // Update for continuous gesture
      } else if (this.gestureType === 'zoom-y') {
        // Vertical swipe = adjust candle height (zoom Y-axis) - only in axis area
        this.handleVerticalZoomSwipe(deltaY, chartRef);
        this.touchStart.y = touch.clientY; // Update for continuous gesture
      } else if (this.gestureType === 'pan') {
        // Pan functionality for canvas area
        this.handlePan(deltaX, deltaY, chartRef);
        this.touchStart.x = touch.clientX; // Update for continuous panning
        this.touchStart.y = touch.clientY;
      }
    } else if (
      event.touches.length === 2 &&
      this.lastTouches &&
      this.gestureType === 'pinch'
    ) {
      this.handlePinchZoom(event.touches, chartRef);
    }
  }

  onTouchEnd(event: TouchEvent): void {
    console.log(event);
    this.isInteracting = false;
    this.gestureType = null;
    this.touchStart = null;
    this.lastTouches = null;
    this.initialPinchDistance = 0;
  }

  // Mouse events
  onMouseDown(event: MouseEvent): void {
    if (event.button === 0) {
      this.mouseStart = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      };
      this.isInteracting = true;
      this.gestureType = 'pan';
    }
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.mouseStart || !this.chart?.chart || this.gestureType !== 'pan')
      return;

    const chartRef = this.chart.chart as any;
    const deltaX = event.clientX - this.mouseStart.x;
    const deltaY = event.clientY - this.mouseStart.y;

    this.handlePan(deltaX, deltaY, chartRef);
    this.mouseStart.x = event.clientX;
    this.mouseStart.y = event.clientY;
  }

  onMouseUp(event: MouseEvent): void {
    console.log(event);
    this.isInteracting = false;
    this.gestureType = null;
    this.mouseStart = null;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();

    if (!this.chart?.chart) return;
    const chartRef = this.chart.chart as any;

    const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
    this.zoomHorizontal(zoomFactor, chartRef);
  }

  // Helper method to detect if touch is in axis area
  isTouchInAxisArea(
    touchPoint: { x: number; y: number },
    chartRef: any,
  ): boolean {
    if (!chartRef || !chartRef.chartArea) return false;

    const canvas = chartRef.canvas;
    const rect = canvas.getBoundingClientRect();
    const chartArea = chartRef.chartArea;

    // Convert touch coordinates to canvas coordinates
    const canvasX = touchPoint.x - rect.left;
    const canvasY = touchPoint.y - rect.top;

    // Define axis areas (outside the main chart area where candles are drawn)
    const isInXAxisArea =
      canvasX >= chartArea.left &&
      canvasX <= chartArea.right &&
      (canvasY < chartArea.top || canvasY > chartArea.bottom);

    const isInYAxisArea =
      canvasY >= chartArea.top &&
      canvasY <= chartArea.bottom &&
      (canvasX < chartArea.left || canvasX > chartArea.right);

    // Allow zoom gestures only in axis areas
    return isInXAxisArea || isInYAxisArea;
  }

  // Single Finger Zoom Handlers
  handleHorizontalZoomSwipe(deltaX: number, chartRef: any): void {
    // TradingView style: Right swipe = zoom out (wider candles), Left swipe = zoom in (narrower candles)
    const sensitivity = 0.003; // Fine-tuned for natural feel
    const zoomFactor = 1 + deltaX * sensitivity;

    // Constrain zoom factor to prevent extreme changes
    const constrainedFactor = Math.max(0.95, Math.min(1.05, zoomFactor));

    this.zoomHorizontal(constrainedFactor, chartRef);
  }

  handleVerticalZoomSwipe(deltaY: number, chartRef: any): void {
    // TradingView style: Up swipe = zoom in (taller candles), Down swipe = zoom out (shorter candles)
    const sensitivity = 0.004; // Slightly higher sensitivity for Y-axis
    // Use 1 + deltaY*sensitivity so that an upward swipe (deltaY < 0) produces factor < 1 -> zoom in
    const zoomFactor = 1 + deltaY * sensitivity;

    // Constrain zoom factor to prevent extreme changes
    const constrainedFactor = Math.max(0.95, Math.min(1.05, zoomFactor));

    this.zoomVertical(constrainedFactor, chartRef);
  }

  // Core interaction methods
  handlePan(deltaX: number, deltaY: number, chartRef: any): void {
    const xScale = chartRef.scales.x;
    const yScale = chartRef.scales.y;

    if (!xScale || !yScale) return;

    const xRange = xScale.max - xScale.min;
    const yRange = yScale.max - yScale.min;

    const xPanAmount =
      (deltaX / chartRef.width) * xRange * this.PAN_SENSITIVITY;
    const yPanAmount =
      (deltaY / chartRef.height) * yRange * this.PAN_SENSITIVITY;

    const newXMin = xScale.min - xPanAmount;
    const newXMax = xScale.max - xPanAmount;

    if (
      newXMin >= this.fullDataRange.min &&
      newXMax <= this.fullDataRange.max
    ) {
      xScale.options.min = newXMin;
      xScale.options.max = newXMax;
    }

    yScale.options.min = yScale.min + yPanAmount;
    yScale.options.max = yScale.max + yPanAmount;

    chartRef.update('none');
    // ensure indicator axis follows y-scale so indicators remain at same price positions
    this.syncIndicatorAxis(chartRef);
  }

  handlePinchZoom(touches: TouchList, chartRef: any): void {
    if (!this.lastTouches) return;

    const currentDistance = this.getTouchDistance(touches);
    const zoomFactor = currentDistance / this.initialPinchDistance;

    this.zoomHorizontal(1 / zoomFactor, chartRef);
    this.zoomVertical(1 / zoomFactor, chartRef);

    this.initialPinchDistance = currentDistance;
  }

  getTouchDistance(touches: TouchList): number {
    const touch1 = touches[0];
    const touch2 = touches[1];
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2),
    );
  }

  zoomHorizontal(factor: number, chartRef: any): void {
    const xScale = chartRef.scales.x;
    if (!xScale) return;

    const currentRange = xScale.max - xScale.min;
    const center = (xScale.max + xScale.min) / 2;

    let newRange = currentRange * factor;

    const data = chartRef.data.datasets[0]?.data || [];
    if (!data.length) return;

    const totalRange = this.fullDataRange.max - this.fullDataRange.min;
    const avgCandleWidth = totalRange / data.length;
    const minRange = avgCandleWidth * this.MIN_CANDLES_VISIBLE;
    const maxRange = totalRange * 0.98;

    newRange = Math.max(minRange, Math.min(maxRange, newRange));

    let newMin = center - newRange / 2;
    let newMax = center + newRange / 2;

    if (newMin < this.fullDataRange.min) {
      newMin = this.fullDataRange.min;
      newMax = newMin + newRange;
    }
    if (newMax > this.fullDataRange.max) {
      newMax = this.fullDataRange.max;
      newMin = newMax - newRange;
    }

    xScale.options.min = newMin;
    xScale.options.max = newMax;

    this.autoFitYScale(chartRef);
    // sync indicator axis to new y-scale
    this.syncIndicatorAxis(chartRef);
    chartRef.update('none');
  }

  zoomVertical(factor: number, chartRef: any): void {
    const yScale = chartRef.scales.y;
    if (!yScale) return;

    const currentRange = yScale.max - yScale.min;
    const center = (yScale.max + yScale.min) / 2;
    const newRange = Math.max(currentRange * factor, 0.000001);

    yScale.options.min = center - newRange / 2;
    yScale.options.max = center + newRange / 2;

    // ensure indicator axis follows vertical zoom
    this.syncIndicatorAxis(chartRef);
    chartRef.update('none');
  }

  autoFitYScale(chartRef: any): void {
    const xScale = chartRef.scales.x;
    const yScale = chartRef.scales.y;
    const data = chartRef.data.datasets[0]?.data || [];

    if (!data.length || !xScale || !yScale) return;

    const visibleCandles = data.filter(
      (candle: any) => candle.x >= xScale.min && candle.x <= xScale.max,
    );

    if (!visibleCandles.length) return;

    const highs = visibleCandles.map((c: any) => c.h);
    const lows = visibleCandles.map((c: any) => c.l);
    const maxY = Math.max(...highs);
    const minY = Math.min(...lows);

    const buffer = (maxY - minY) * 0.05;

    yScale.options.min = minY - buffer;
    yScale.options.max = maxY + buffer;
    // keep indicator axis aligned with auto-fitted y-scale
    this.syncIndicatorAxis(chartRef);
  }

  //
  // ?? Public methods for toolbar
  //
  resetZoom(): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef || !this.chartData.datasets[0]?.data.length) return;

    this.initializeChart(this.chartData.datasets[0].data);
  }

  fitToData(): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef) return;

    chartRef.scales.x.options.min = this.fullDataRange.min;
    chartRef.scales.x.options.max = this.fullDataRange.max;

    const yBuffer = this.initialYRange.max - this.initialYRange.min;
    chartRef.scales.y.options.min = this.initialYRange.min - yBuffer;
    chartRef.scales.y.options.max = this.initialYRange.max + yBuffer;

    // sync indicator axis to restored y-range
    this.syncIndicatorAxis(chartRef);
    chartRef.update('none');
  }

  onChartDblClick(): void {
    if (!this.chart?.chart) return;
    this.autoFitYScale(this.chart.chart as any);
    (this.chart.chart as any).update('none');
    this.syncIndicatorAxis(this.chart?.chart);
  }

  // Compatibility noop: some templates/code expect ensureOverlaysLoaderV2
  public ensureOverlaysLoaderV2(): void { /* noop for backward compatibility */ }

  //
  // ?? Boxes overlay
  //
  private resolveBoxColors(b: any): { bg: string; br: string } {
    // When in 'boxes' (trade boxes) mode we force colors by PositionType and ignore any provided color
    if (this.boxMode === 'boxes') {
      const sideRaw = (b.PositionType || b.positionType || b.Side || b.side || b.Direction || b.direction || '')
        .toString()
        .toLowerCase();
      const isShort = /short|sell|s\b/.test(sideRaw);
      const isLong = /long|buy|b\b/.test(sideRaw);
      const bg = isShort ? 'rgba(255,0,0,0.14)' : isLong ? 'rgba(0,200,0,0.14)' : 'rgba(0,200,0,0.14)';
      const br = isShort ? 'rgba(255,0,0,0.9)' : isLong ? 'rgba(0,200,0,0.9)' : 'rgba(0,200,0,0.9)';
      return { bg, br };
    }

    // Otherwise (e.g. 'all' mode) respect provided color if present
    const provided = (b.Color || b.color || b.ColorString || b.colorString || '').toString();
    const isHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(provided);
    if (provided) {
      if (isHex) {
        // convert hex to rgba with alpha
        const hex = provided.replace('#', '');
        const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.substring(0, 2), 16);
        const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.substring(2, 4), 16);
        const bl = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.substring(4, 6), 16);
        return { bg: `rgba(${r},${g},${bl},0.14)`, br: `rgba(${r},${g},${bl},0.95)` };
      }
      // not hex: use provided color for border and a translucent version for background
      return { bg: `${provided}33`, br: provided } as any; // append simple alpha if possible
    }

    // fallback based on position if no provided color
    const sideRaw = (b.PositionType || b.positionType || b.Side || b.side || b.Direction || b.direction || '')
      .toString()
      .toLowerCase();
    const isShort = /short|sell|s\b/.test(sideRaw);
    const isLong = /long|buy|b\b/.test(sideRaw);
    const bg = isShort ? 'rgba(255,0,0,0.14)' : isLong ? 'rgba(0,200,0,0.14)' : 'rgba(0,200,0,0.14)';
    const br = isShort ? 'rgba(255,0,0,0.9)' : isLong ? 'rgba(0,200,0,0.9)' : 'rgba(0,200,0,0.9)';
    return { bg, br };
  }

  addBoxesDatasets(): void {
    // Always show at least one demo box if no boxes are present
    let boxesToUse = this.boxes || [];
    const mainDs = this.chartData.datasets[0]?.data as Array<{ x: number }>;

    if (!mainDs || mainDs.length < 2) return;

    // If there are no real boxes, synthesize a visual demo box covering 25-75% of Y range
    if ((!boxesToUse || boxesToUse.length === 0) && this.baseData && this.baseData.length) {
      const highs = this.baseData.map((c: any) => c.h);
      const lows = this.baseData.map((c: any) => c.l);
      const minY = Math.min(...lows);
      const maxY = Math.max(...highs);
      const boxBottom = minY + (maxY - minY) * 0.25;
      const boxTop = minY + (maxY - minY) * 0.75;
      boxesToUse = [
        {
          Id: 'demo',
          min_zone: boxBottom,
          max_zone: boxTop,
          PositionType: 'LONG',
        },
      ];
    }

    // remove existing box datasets
    this.chartData.datasets = this.chartData.datasets.filter(
      (d: any) => !d.isBox,
    );

    const xMin = mainDs[0].x;
    const xMax = mainDs[mainDs.length - 1].x;

    const overlays = boxesToUse
      .map((b: any, i: number) => {
        // support multiple possible property names
        const zoneMin =
          b.min_zone ?? b.MinZone ?? b.zone_min ?? b.ZoneMin ?? b.minZone ?? b.ZoneMin ?? null;
        const zoneMax =
          b.max_zone ?? b.MaxZone ?? b.zone_max ?? b.ZoneMax ?? b.maxZone ?? b.ZoneMax ?? null;

        if (zoneMin == null || zoneMax == null) return null;

        const numericMin = Number(zoneMin);
        const numericMax = Number(zoneMax);
        if (Number.isNaN(numericMin) || Number.isNaN(numericMax)) return null;

        const resolved = this.resolveBoxColors(b);
        const label = `${this.boxMode === 'all' ? 'AllBox' : 'TradeBox'} ${b.Id ?? b.id ?? i}`;

        // Use line dataset to draw a closed polygon so Chart.js reliably fills the interior.
        const boxDataset = {
          type: 'line' as const,
          label,
          data: [
            { x: xMin, y: numericMin },
            { x: xMax, y: numericMin },
            { x: xMax, y: numericMax },
            { x: xMin, y: numericMax },
            { x: xMin, y: numericMin },
          ],
          showLine: true,
          // border = solid opaque color, background = translucent fill
          borderColor: resolved.br,
          borderWidth: 2,
          borderDash: this.boxMode === 'all' ? [6, 4] : [],
          backgroundColor: resolved.bg,
          fill: true,
          spanGaps: true,
          order: 9999, // ensure box labels are drawn on top
          clip: false,
          // flag for our custom plugin to paint stable filled boxes
          isBox: true,
          // allow Chart.js to render dataset so users see boxes
          hidden: false,
          pointRadius: 0,
          tension: 0,
          parsing: true,
          // provide explicit box label values used by label plugin
          // pinned labels: show textual label plus formatted price
          boxLabelMin: `${numericMin >= 1000 ? numericMin.toLocaleString() : numericMin.toFixed(2)}`,
          boxLabelMax: `${numericMax >= 1000 ? numericMax.toLocaleString() : numericMax.toFixed(2)}`,
        };

        return boxDataset;
      })
      .filter(Boolean) as any[];

    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.concat(overlays);
    });

    console.log('addBoxesDatasets: added', overlays.length, 'overlays, total datasets=', this.chartData.datasets.length);
  }
  
  //
  // ?? KeyZones support
  //

  // New method to fetch and toggle KeyZones
  onToggleKeyZones(): void {
    // ngModel already updates `showKeyZones` from the checkbox input.
    // Respect the current model value and act accordingly (do not flip it again).
    if (this.showKeyZones && this.selectedSymbol && this.selectedSymbol.SymbolName) {
      this.fetchKeyZones(this.selectedSymbol.SymbolName).subscribe({ error: (e) => console.warn('fetchKeyZones error', e) });
    } else {
      // remove existing keyzone datasets
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter(
          (d: any) => !d.isKeyZone,
        );
      });
    }
  }

  // New method to fetch key zones
  fetchKeyZones(symbolName: string): Observable<any> {
    if (!symbolName) return of(null);

    // clear any existing key zone state immediately so UI updates
    this.keyZones = null;
    // remove existing key zone datasets from chart immediately (use isKeyZone flag)
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.filter(
        (d: any) => !d.isKeyZone,
      );
    });

    console.log(`fetchKeyZones: symbol=${symbolName}`);

    // KeyZones endpoint returns an object with VolumeProfiles and FibLevels
    return this.marketService.getKeyZones(symbolName).pipe(
      tap((kz: any) => {
        if (!kz) return;
        console.log('fetchKeyZones result', kz);
        this.keyZones = kz;
        if (!this.showKeyZones) return;
        this.addKeyZoneDatasets();
      })
    );
  }

  // New: method to add KeyZones datasets
  addKeyZoneDatasets(): void {
    if (!this.keyZones) return;
    const mainDs = this.chartData.datasets[0]?.data as Array<{ x: number }>;

    if (!mainDs || mainDs.length < 2) return;

    // remove existing key zone datasets
    this.chartData.datasets = this.chartData.datasets.filter(
      (d: any) => !d.isKeyZone,
    );

    const xMin = mainDs[0].x;
    const xMax = mainDs[mainDs.length - 1].x;

    const lines: any[] = [];

    // VolumeProfiles -> POC, VAH, VAL
    const vps = this.keyZones.VolumeProfiles || [];
    vps.forEach((vp: any) => {
      const tf = vp.Timeframe || vp.timeframe || '';
      if (vp.Poc != null) {
        lines.push({
          type: 'line' as const,
          label: `${tf} POC`,
          data: [{ x: xMin, y: vp.Poc }, { x: xMax, y: vp.Poc }],
          borderColor: 'rgba(0,200,0,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tf} POC`,
          keyColor: 'rgba(0,200,0,0.9)',
        });
      }
      if (vp.Vah != null) {
        lines.push({
          type: 'line' as const,
          label: `${tf} VAH`,
          data: [{ x: xMin, y: vp.Vah }, { x: xMax, y: vp.Vah }],
          borderColor: 'rgba(200,0,200,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tf} VAH`,
          keyColor: 'rgba(200,0,200,0.9)',
        });
      }
      if (vp.Val != null) {
        lines.push({
          type: 'line' as const,
          label: `${tf} VAL`,
          data: [{ x: xMin, y: vp.Val }, { x: xMax, y: vp.Val }],
          borderColor: 'rgba(200,200,0,0.9)',
          borderWidth: 1,
          pointRadius: 0,
          isKeyZone: true,
          keyLabel: `${tf} VAL`,
          keyColor: 'rgba(200,200,0,0.9)',
        });
      }
    });

    // FibLevels -> label with timeframe,type,level and gold for 0.618
    const fibs = this.keyZones.FibLevels || [];
    fibs.forEach((f: any) => {
      const tf = f.Timeframe || f.timeframe || '';
      const type = f.Type || f.type || '';
      const level = f.Level ?? f.level ?? null;
      const price = f.Price ?? f.price ?? null;
      if (price == null) return;

      const levelStr = level != null ? `${level}` : '';
      const label = `${tf} ${type} ${levelStr}`.trim();
      const isGold = ('' + level).indexOf('0.618') !== -1 || Number(level) === 0.618;

      lines.push({
        type: 'line' as const,
        label,
        data: [{ x: xMin, y: price }, { x: xMax, y: price }],
        borderColor: isGold ? '#FFD700' : 'rgba(255,165,0,0.9)',
        borderWidth: 1,
        borderDash: [6, 4],
        pointRadius: 0,
        isKeyZone: true,
        keyLabel: label,
        keyColor: isGold ? '#FFD700' : 'rgba(255,165,0,0.9)',
      });
    });

    if (!lines.length) return;

    // add keyzone lines but preserve current view
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.concat(lines);
    });

    console.log('addKeyZoneDatasets: added', lines.length, 'key zone lines, total datasets=', this.chartData.datasets.length);
  }

  // Toggle handler exposed to UI
  onToggleIndicators(): void {
    // ngModel already updates `showIndicators` from the checkbox input.
    // Respect the current model value and act accordingly (do not flip it again).
    if (!this.showIndicators) {
      // remove indicator datasets ONLY, do NOT reset chartData/datasets
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isIndicator);
        this.ensureCandleWidth();
      });

      // After removing indicator datasets, re-fit Y scale to visible candles so candles keep correct height
      try {
        const chartRef = this.chart?.chart as any;
        if (chartRef) {
          // recalc y-scale based on visible candles
          this.autoFitYScale(chartRef);
          chartRef.update('none');
        }
      } catch (e) {
        // ignore errors
      }

      return;
    }
    if (this.selectedSymbol && this.selectedSymbol.SymbolName) {
      this.fetchIndicatorSignals(this.selectedSymbol.SymbolName).subscribe({ error: (e) => console.warn('indicator fetch error', e) });
    }
  }

  // Fetch indicator signals from backend and add datasets
  fetchIndicatorSignals(symbolName: string): Observable<any[]> {
    if (!symbolName) return of([]);
    // remove any existing indicator datasets immediately
    this.safeUpdateDatasets(() => { this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isIndicator); });

    console.log('fetchIndicatorSignals for', symbolName, 'tf', this.selectedTimeframe);
    return this.marketService.getIndicatorSignals(symbolName, this.selectedTimeframe).pipe(tap((arr: any[]) => {
      if (!arr || !arr.length) return;
      // if user toggled indicators off while we were fetching, abort
      if (!this.showIndicators) return;
      console.log('indicator signals count', arr.length);
      // backend returns signals for BTCUSDT + the altcoin; filter for relevant symbol entries
      const relevant = (arr || []).filter((s: any) => (s.Symbol || '').toString() && (s.Timeframe || '').toString() === this.selectedTimeframe);
      if (!relevant.length) return;

      // map signals to nearest candle index
      const candles = this.baseData || [];
      if (!candles.length) return;

      const firstTime = candles[0].x;
      const lastTime = candles[candles.length - 1].x;
      const signalsInRange = relevant.filter((s: any) => {
        const t = new Date(s.EndTime).getTime();
        return t >= firstTime && t <= lastTime;
      });
      if (!signalsInRange.length) return;

      const grouped: Record<number, any[]> = {};
      signalsInRange.forEach((sig: any) => {
        const t = new Date(sig.EndTime).getTime();
        // find nearest index
        let bestIdx = -1;
        let bestDiff = Number.MAX_SAFE_INTEGER;
        for (let i = 0; i < candles.length; i++) {
          const diff = Math.abs(candles[i].x - t);
          if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
        }
        if (bestIdx < 0) return;
        if (!grouped[bestIdx]) grouped[bestIdx] = [];
        grouped[bestIdx].push(sig);
      });

      if (Object.keys(grouped).length === 0) return;

      // compute median candle range
      const ranges = candles.map(c => Math.max(0, (c.h - c.l))).filter(r => r > 0).sort((a, b) => a - b);
      let medianRange = 1.0;
      if (ranges.length === 1) medianRange = ranges[0];
      else if (ranges.length > 1) {
        const mid = Math.floor(ranges.length / 2);
        medianRange = ranges.length % 2 === 1 ? ranges[mid] : 0.5 * (ranges[mid - 1] + ranges[mid]);
      }
      if (medianRange <= 0) medianRange = 1.0;

      const UnitFactor = 0.18;
      const FirstOffsetUnits = 4.0;
      const BetweenUnits = 0.8;
      const MinPct = 0.00003;
      const MaxPct = 0.004;
      const FallbackPct = 0.00004;

      const newDatasets: any[] = [];

      Object.keys(grouped).map(k => Number(k)).sort((a, b) => a - b).forEach((ci) => {
        const list = grouped[ci];
        const candle = candles[ci];
        let rawRange = candle.h - candle.l;
        if (rawRange <= 0) rawRange = Math.max((candle.h + candle.l) * 0.5, 1e-9) * FallbackPct;
        const unit = Math.max(Math.min(medianRange * UnitFactor, Math.max((candle.h + candle.l) * MaxPct, 1e-9)), Math.max((candle.h + candle.l) * MinPct, 1e-9));

        const bulls = list.filter((s: any) => (s.Kind || '').toString().toLowerCase() === 'bullish');
        const bears = list.filter((s: any) => (s.Kind || '').toString().toLowerCase() === 'bearish');

        for (let i = 0; i < bulls.length; i++) {
          const s = bulls[i];
          const y = candle.l - unit * (FirstOffsetUnits + i * BetweenUnits);
          const glyph = this.isBtcSymbol((s.Symbol || '') as string) ? '₿' : '▽';
          const color = s.HasMcb ? '#00C853' : '#00A040';
          newDatasets.push({
            isIndicator: true,
            yAxisID: 'indicator',
            label: `IND_BULL_${ci}_${i}_EX${s.ExchangeId}`,
            data: [{ x: candle.x, y }],
            glyph,
            glyphColor: color,
            glyphSize: 18,
            pointRadius: 0,
            order: 1000,
          });
        }
        for (let i = 0; i < bears.length; i++) {
          const s = bears[i];
          const y = candle.h + unit * (FirstOffsetUnits + i * BetweenUnits);
          const glyph = this.isBtcSymbol((s.Symbol || '') as string) ? '₿' : '▽';
          const color = s.HasMcb ? '#D50000' : '#B00000';
          newDatasets.push({
            isIndicator: true,
            yAxisID: 'indicator',
            label: `IND_BEAR_${ci}_${i}_EX${s.ExchangeId}`,
            data: [{ x: candle.x, y }],
            glyph,
            glyphColor: color,
            glyphSize: 18,
            pointRadius: 0,
            order: 1000,
          });
        }
      });

      if (!newDatasets.length) return;

      // If user toggled indicators off in the meantime, do not add
      if (!this.showIndicators) return;

      // compute tight min/max for hidden indicator axis to avoid autoscaling surprises
      const allYs = newDatasets.flatMap(ds => (ds.data || []).map((p: any) => p.y));
      try {
        const chartRef = this.chart?.chart as any;
        // Determine base y-range to mirror: prefer current runtime y-scale, fall back to initialYRange
        let baseMin = this.initialYRange?.min ?? NaN;
        let baseMax = this.initialYRange?.max ?? NaN;
        if (chartRef && chartRef.scales && chartRef.scales.y) {
          const ry = chartRef.scales.y;
          if (typeof ry.min === 'number' && typeof ry.max === 'number') {
            baseMin = ry.min;
            baseMax = ry.max;
          } else if (ry.options && typeof ry.options.min === 'number' && typeof ry.options.max === 'number') {
            baseMin = ry.options.min;
            baseMax = ry.options.max;
          }
        }

        if (!Number.isFinite(baseMin) || !Number.isFinite(baseMax)) {
          // fallback to compute from baseData
          if (this.baseData && this.baseData.length) {
            const highs = this.baseData.map((c: any) => c.h);
            const lows = this.baseData.map((c: any) => c.l);
            const minY = Math.min(...lows);
            const maxY = Math.max(...highs);
            const pad = (maxY - minY) * 0.05;
            baseMin = minY - pad;
            baseMax = maxY + pad;
          } else if (allYs.length) {
            // last resort: base on indicator values but with small padding
            const minY = Math.min(...allYs);
            const maxY = Math.max(...allYs);
            const pad = Math.max((maxY - minY) * 0.02, 1e-6);
            baseMin = minY - pad;
            baseMax = maxY + pad;
          }
        }

        if (Number.isFinite(baseMin) && Number.isFinite(baseMax)) {
          this.chartOptions = this.chartOptions || {};
          this.chartOptions.scales = this.chartOptions.scales || {};
          this.chartOptions.scales.indicator = {
            display: false,
            position: 'left',
            grid: { display: false },
            ticks: { display: false },
            type: 'linear',
            min: baseMin,
            max: baseMax,
          };

          // Also update the runtime chart instance to ensure it uses the same hidden axis
          if (chartRef) {
            chartRef.config = chartRef.config || {};
            chartRef.config.options = chartRef.config.options || {};
            chartRef.config.options.scales = chartRef.config.options.scales || {};
            chartRef.config.options.scales.indicator = { ...this.chartOptions.scales.indicator };

            if (chartRef.scales && chartRef.scales.indicator) {
              chartRef.scales.indicator.options = chartRef.scales.indicator.options || {};
              chartRef.scales.indicator.options.min = baseMin;
              chartRef.scales.indicator.options.max = baseMax;
              try { chartRef.scales.indicator.min = baseMin; } catch (e) { }
              try { chartRef.scales.indicator.max = baseMax; } catch (e) { }
            }

            try { chartRef.update('none'); } catch (e) { }
          }
        }
      } catch (e) {
        // ignore
      }

      // add indicator datasets but preserve current view (do not force full-range zoom)
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.concat(newDatasets);
      });

      // Ensure main y-scale is re-fitted to visible candles (ignore indicator datasets)
      try {
        const chartRef = this.chart?.chart as any;
        if (chartRef && chartRef.scales && chartRef.scales.y) {
          // recompute visible y-range based on main candlestick dataset only
          this.autoFitYScale(chartRef);

          // also set options on runtime scale to persist
          const yMin = chartRef.scales.y.options.min ?? chartRef.scales.y.min;
          const yMax = chartRef.scales.y.options.max ?? chartRef.scales.y.max;
          if (chartRef.config && chartRef.config.options && chartRef.config.options.scales) {
            chartRef.config.options.scales.y = chartRef.config.options.scales.y || {};
            chartRef.config.options.scales.y.min = yMin;
            chartRef.config.options.scales.y.max = yMax;
          }
          try { chartRef.scales.y.options.min = yMin; chartRef.scales.y.options.max = yMax; } catch (e) { }
          try { chartRef.scales.y.min = yMin; chartRef.scales.y.max = yMax; } catch (e) { }
          try { chartRef.update('none'); } catch (e) { }
        }
      } catch (e) {
        // ignore
      }
    }), map((arr: any[]) => arr || []));
  }

  // helper to detect BTC symbol (reuse C# logic idea)
  isBtcSymbol(sym: string): boolean {
    console.log('isBtcSymbol check for', sym);
    if (!sym) return false;
    return sym.toUpperCase().indexOf('BTC') !== -1;
  }

  // Orders
  onOrdersToggle(): void {
    // ngModel already updates `showOrders`
    if (!this.showOrders) {
      // clear orders and remove related datasets
      this.orders = [];
      this.safeUpdateDatasets(() => {
        this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isOrder);
      });
      return;
    }
    if (this.selectedSymbol && this.selectedSymbol.SymbolName) {
      this.fetchOrders(this.selectedSymbol.SymbolName);
    }
  }

  fetchOrders(symbolName: string): Observable<any[]> {
    if (!symbolName) return of([]);
    this.orders = [];
    this.safeUpdateDatasets(() => { this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isOrder); });
    console.log('fetchOrders for', symbolName);
    return this.marketService.getTradeOrders(symbolName).pipe(
      tap((arr: any[]) => {
        if (!arr || !arr.length) return;
        const relevant = arr.filter(o => (o.Symbol || '').toString().toUpperCase() === symbolName.toString().toUpperCase());
        if (!relevant.length) return;
        this.orders = relevant;
        if (!this.baseData || !this.baseData.length) return;
        this.addOrderDatasets();
      }),
      map((arr: any[]) => arr || [])
    );
  }

  addOrderDatasets(): void {
    if (!this.orders || !this.orders.length) return;
    const mainDs = this.chartData.datasets[0]?.data as Array<{ x: number }>;


    if (!mainDs || mainDs.length < 2) return;

    // remove existing order datasets
    this.chartData.datasets = this.chartData.datasets.filter((d: any) => !d.isOrder);

    const xMin = mainDs[0].x;
    const xMax = mainDs[mainDs.length - 1].x;

    const lines: any[] = [];

    this.orders.forEach((o: any) => {
      const entry = Number(o.EntryPrice ?? o.Entryprice ?? o.entryPrice ?? null);
      const sl = Number(o.StopLoss ?? o.Stoploss ?? o.stopLoss ?? null);
      const t1 = Number(o.TargetPrice ?? o.Target1Price ?? o.Target1price ?? null);
      const t2 = Number(o.Target2Price ?? o.Target2price ?? o.Target2 ?? null);

      const side = ((o.Direction || o.direction || '') + '').toString().toLowerCase();
      const isLong = /long|buy/.test(side);

      const entryColor = isLong ? '#00C853' : '#FF8F00';
      const slColor = '#FF4444';
      const tColor = '#00C8FF';

      if (!Number.isNaN(entry)) {
        lines.push({
          type: 'line' as const,
          label: `Order ${o.Id} Entry`,
          orderLabel: 'Entry',
          orderColor: entryColor,
          data: [{ x: xMin, y: entry }, { x: xMax, y: entry }],
          borderColor: entryColor,
          borderWidth: 1,
          pointRadius: 0,
          isOrder: true,
          order: 950,
        });
      }
      if (!Number.isNaN(sl)) {
        lines.push({
          type: 'line' as const,
          label: `Order ${o.Id} SL`,
          orderLabel: 'Stoploss',
          orderColor: slColor,
          data: [{ x: xMin, y: sl }, { x: xMax, y: sl }],
          borderColor: slColor,
          borderWidth: 1,
          borderDash: [4, 4],
          pointRadius: 0,
          isOrder: true,
          order: 950,
        });
      }
      if (!Number.isNaN(t1)) {
        lines.push({
          type: 'line' as const,
          label: `Order ${o.Id} T1`,
          orderLabel: 'Target1',
          orderColor: tColor,
          data: [{ x: xMin, y: t1 }, { x: xMax, y: t1 }],
          borderColor: tColor,
          borderWidth: 1,
          pointRadius: 0,
          isOrder: true,
          order: 950,
        });
      }
      if (!Number.isNaN(t2)) {
        lines.push({
          type: 'line' as const,
          label: `Order ${o.Id} T2`,
          orderLabel: 'Target2',
          orderColor: tColor,
          data: [{ x: xMin, y: t2 }, { x: xMax, y: t2 }],
          borderColor: tColor,
          borderWidth: 1,
          borderDash: [2, 4],
          pointRadius: 0,
          isOrder: true,
          order: 950,
        });
      }
    });

    if (!lines.length) return;

    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets.concat(lines);
    });

    console.log('addOrderDatasets: added', lines.length, 'order lines.');
  } 
  // ensure candle width options set (compat function kept from earlier)
  private ensureCandleWidth(): void {
    const candleDs = this.chartData.datasets.find((d: any) => d.type === 'candlestick');
    if (candleDs) {
      candleDs.barPercentage = candleDs.barPercentage ?? 100;
      candleDs.categoryPercentage = candleDs.categoryPercentage ?? 0.9;
      candleDs.maxBarThickness = candleDs.maxBarThickness ?? 50;
      this.chartData = { datasets: this.chartData.datasets.slice() };
    }
  }
  }
  // ... rest of file unchanged ...
