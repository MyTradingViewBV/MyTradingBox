/* Stateless chart helper utilities extracted from ChartComponent to reduce size and enable reuse. */
 

/* Stateless chart helper utilities extracted from ChartComponent */
 

/* Stateless chart helper utilities extracted from ChartComponent */
 

export function formatPriceChange(
  change: number,
  previousPrice: number,
): string {
  const changePercent = previousPrice ? (change / previousPrice) * 100 : 0;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)} (${sign}${changePercent.toFixed(2)}%)`;
}


export function resolveBoxColors(
  b: any,
  boxMode: 'boxes' | 'all',
): { bg: string; br: string } {
  // 🎨 Neon Long (Green)
  const neonLongFill = 'rgba(57,255,20,0.35)'; // neon green, bright
  const neonLongBorder = 'rgba(57,255,20,1)';

  // 🎨 Neon Short (BRIGHT RED)
  const neonShortFill = 'rgba(255,0,0,0.55)'; // pure red, no brown tint
  const neonShortBorder = 'rgba(255,0,0,1)';

  // 🎨 Neutral (Cyan / Aqua)
  const neonNeutralFill = 'rgba(0,255,255,0.28)';
  const neonNeutralBorder = 'rgba(0,255,255,1)';

  const detectSide = () => {
    const sideRaw = (
      b.PositionType ||
      b.positionType ||
      b.Side ||
      b.side ||
      b.Direction ||
      b.direction ||
      ''
    )
      .toString()
      .toLowerCase();
    return {
      isShort: /short|sell|s\b/.test(sideRaw),
      isLong: /long|buy|b\b/.test(sideRaw),
    };
  };

  if (boxMode === 'boxes') {
    const { isShort, isLong } = detectSide();
    return {
      bg: isShort ? neonShortFill : isLong ? neonLongFill : neonNeutralFill,
      br: isShort
        ? neonShortBorder
        : isLong
          ? neonLongBorder
          : neonNeutralBorder,
    };
  }

  // For 'all' mode: trade boxes (LONG/SHORT) use green/red, everything else grey
  const { isShort, isLong } = detectSide();
  if (isLong) return { bg: neonLongFill, br: neonLongBorder };
  if (isShort) return { bg: neonShortFill, br: neonShortBorder };

  // Hex color override for non-trade boxes
  const provided = (
    b.Color ||
    b.color ||
    b.ColorString ||
    b.colorString ||
    ''
  ).toString();

  const isHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(provided);
  if (provided && isHex) {
    const hex = provided.replace('#', '');
    const r = parseInt(
      hex.length === 3 ? hex[0] + hex[0] : hex.substring(0, 2),
      16,
    );
    const g = parseInt(
      hex.length === 3 ? hex[1] + hex[1] : hex.substring(2, 4),
      16,
    );
    const bl = parseInt(
      hex.length === 3 ? hex[2] + hex[2] : hex.substring(4, 6),
      16,
    );
    return {
      bg: `rgba(${r},${g},${bl},0.22)`,
      br: `rgba(${r},${g},${bl},1)`,
    };
  }

  // Neutral / other boxes → grey
  return { bg: 'rgba(128,128,128,0.22)', br: 'rgba(128,128,128,0.8)' };
}

// Dynamically format prices based on magnitude, supporting very small values.
export function formatDynamicPrice(value: number): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  const abs = Math.abs(num);
  if (abs === 0) return '0.00';
  if (abs >= 1) return num.toFixed(2);
  const mag = -Math.log10(abs);
  const decimals = Math.min(8, Math.max(2, Math.ceil(mag + 2)));
  return num.toFixed(decimals);
}

// Build box overlay datasets given base candle data and raw boxes collection.
export function buildBoxDatasets(params: {
  boxes: any[];
  baseData: any[];
  mainData: Array<{ x: number }>;
  boxMode: 'boxes' | 'all';
}): any[] {
  const { boxes, baseData, mainData, boxMode } = params;
  if (!mainData || mainData.length < 2) return [];
  let boxesToUse = boxes || [];
  // synthesize demo box if none
  if ((!boxesToUse || boxesToUse.length === 0) && baseData && baseData.length) {
    const highs = baseData.map((c: any) => c.h);
    const lows = baseData.map((c: any) => c.l);
    const minY = Math.min(...lows);
    const maxY = Math.max(...highs);
    const boxBottom = minY + (maxY - minY) * 0.25;
    const boxTop = minY + (maxY - minY) * 0.75;
    boxesToUse = [
      { Id: 1, min_zone: boxBottom, max_zone: boxTop, PositionType: 'LONG' },
    ];
  }
  const xMin = mainData[0].x;

  // Use global extended max if available, so boxes extend beyond last candle
  let xMax: number = (window as any).__chartExtendedMax;
  if (!xMax || isNaN(xMax)) {
    // fallback to last candle when extended max is not initialized
    xMax = mainData[mainData.length - 1].x;
  }

  return (boxesToUse || [])
    .map((b: any, i: number) => {
      const zoneMin =
        b.min_zone ??
        b.MinZone ??
        b.zone_min ??
        b.ZoneMin ??
        b.minZone ??
        b.ZoneMin ??
        null;
      const zoneMax =
        b.max_zone ??
        b.MaxZone ??
        b.zone_max ??
        b.ZoneMax ??
        b.maxZone ??
        b.ZoneMax ??
        null;
      if (zoneMin == null || zoneMax == null) return null;
      const numericMin = Number(zoneMin);
      const numericMax = Number(zoneMax);
      if (Number.isNaN(numericMin) || Number.isNaN(numericMax)) return null;
      const resolved = resolveBoxColors(b, boxMode);
      const label = `${boxMode === 'all' ? 'AllBox' : 'TradeBox'} ${b.Id ?? b.id ?? i}`;
      return {
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
        // Remove visible border around boxes; keep fill only
        borderColor: 'rgba(0,0,0,0)',
        borderWidth: 0,
        borderDash: [],
        backgroundColor: resolved.bg,
        fill: true,
        spanGaps: true,
        order: 9999,
        // Ensure Chart.js clips dataset render to the chart area
        clip: true,
        isBox: true,
        hidden: false,
        pointRadius: 0,
        tension: 0,
        parsing: true,
        boxLabelMin: `${numericMin >= 1000 ? numericMin.toLocaleString() : formatDynamicPrice(numericMin)}`,
        boxLabelMax: `${numericMax >= 1000 ? numericMax.toLocaleString() : formatDynamicPrice(numericMax)}`,
        boxLabelText: `MIN: ${numericMin >= 1000 ? numericMin.toLocaleString() : formatDynamicPrice(numericMin)} MAX: ${numericMax >= 1000 ? numericMax.toLocaleString() : formatDynamicPrice(numericMax)}`,
        // Carry through Strength for label rendering (optional)
        boxStrength: (b.Strength ?? b.strength ?? undefined),
      };
    })
    .filter(Boolean) as any[];
}

/**
 * ADAPTIVE X-AXIS TIME LABEL DENSITY (HIGH DENSITY)
 * Calculates how many visible bars should be skipped between time labels.
 * Dramatically increased density: 35–45px per label (vs previous 65–80px).
 * Results in 2–3× more labels when zooming.
 * 
 * Example:
 * - 200 visible bars, 800px width, mobile=false → 18 target labels → show every 11th bar
 * - 200 visible bars, 400px width, mobile=true → 11 target labels → show every 18th bar
 * - 50 visible bars, 800px width → 18 target labels → show every 3rd bar
 */
export function calculateBarsPerLabel(
  visibleBars: number,
  chartWidth: number,
  isMobile: boolean,
): number {
  if (visibleBars <= 0 || chartWidth <= 0) return 1;

  // Dense labels: 28px per label (mobile) or 40px (desktop)
  const pixelsPerLabel = isMobile ? 28 : 40;
  const targetLabels = Math.max(5, Math.floor(chartWidth / pixelsPerLabel));

  // How many bars to skip between labels
  return Math.max(1, Math.ceil(visibleBars / targetLabels));
}

/**
 * Filter X-axis tick labels to prevent overlap.
 * Given a list of ticks with (index, pixel x-position), keep only ticks
 * separated by at least minPixelSpacing to avoid label collisions.
 * 
 * Safe: pure function, no side effects.
 * 
 * Example:
 * Input: [{index: 0, x: 10}, {index: 1, x: 30}, {index: 2, x: 50}]
 * minSpacing: 25
 * Output: [{index: 0, x: 10}, {index: 2, x: 50}] (index 1 at x=30 is too close)
 */
export function filterTicksByPixelGap(
  ticks: Array<{ index: number; x: number }>,
  minPixelSpacing: number,
): Array<{ index: number; x: number }> {
  if (!ticks || ticks.length === 0) return [];
  if (minPixelSpacing <= 0) return ticks;

  const filtered: Array<{ index: number; x: number }> = [];
  let lastX = -Infinity;

  for (const tick of ticks) {
    if (!isFinite(tick.x)) continue;

    if (tick.x - lastX >= minPixelSpacing) {
      filtered.push(tick);
      lastX = tick.x;
    }
  }

  return filtered;
}


/**
 * Calculate a "nice" step value for axis ticks using standard algorithm.
 * Derived from visible range and target tick count.
 * NEVER derives from total dataset length - always from current visible min/max.
 */
export function calculateNiceStep(range: number, targetTicks: number): number {
  if (!isFinite(range) || range <= 0 || !isFinite(targetTicks) || targetTicks <= 0) {
    return 1;
  }

  const roughStep = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / magnitude;

  let niceNormalized = 1;
  if (normalized >= 7.5) niceNormalized = 10;
  else if (normalized >= 3.5) niceNormalized = 5;
  else if (normalized >= 1.5) niceNormalized = 2;

  return niceNormalized * magnitude;
}

/**
 * Generate tick values from min, max, and step.
 * Pure: no side effects or viewport modification.
 */
export function generateNumericTicks(min: number, max: number, step: number): number[] {
  if (!isFinite(min) || !isFinite(max) || !isFinite(step) || step <= 0 || max < min) {
    return [];
  }

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  const epsilon = step / 1000;

  for (let value = start; value <= max + epsilon; value += step) {
    ticks.push(Number(value.toFixed(10)));
  }

  return ticks;
}

/**
 * Filter numeric ticks by minimum pixel spacing.
 * Map each tick value to pixel position using a scaling function,
 * then keep only ticks separated by at least minPixelSpacing.
 * Used for both Y-axis (price) and X-axis (time).
 */
export function filterTicksByPixelSpacing(
  ticks: number[],
  mapToPixel: (value: number) => number,
  minPixelSpacing: number,
): number[] {
  if (!ticks || ticks.length === 0) return [];
  if (minPixelSpacing <= 0) return ticks;

  const filtered: number[] = [];
  let lastPixel = -Infinity;

  for (const tick of ticks) {
    const px = mapToPixel(tick);
    if (!isFinite(px)) continue;

    if (px - lastPixel >= minPixelSpacing) {
      filtered.push(tick);
      lastPixel = px;
    }
  }

  return filtered;
}

/**
 * Detect target tick count for mobile vs desktop.
 * Accounts for drawable pixel area to match TradingView mobile-first behavior.
 * Mobile: denser labels (1 label every 60–80 px)
 * Desktop: sparser labels (1 label every 80–100 px)
 */
export function detectMobileTickTargets(canvasWidth: number, canvasHeight: number): {
  yAxisTargetTicks: number;
  xAxisTargetTicks: number;
  yAxisMinPixelSpacing: number;
  xAxisMinPixelSpacing: number;
  isMobile: boolean;
} {
  const isMobile = canvasWidth < 768;
  
  if (isMobile) {
    // Mobile: much denser spacing to show more time labels
    const yTarget = Math.max(5, Math.floor(canvasHeight / 55)); // ~1 label every 55px
    const xTarget = Math.max(5, Math.floor(canvasWidth / 50)); // ~1 label every 50px
    const ySpacing = 40; // absolute minimum 40px per label
    const xSpacing = 40; // absolute minimum 40px per label
    return {
      yAxisTargetTicks: yTarget,
      xAxisTargetTicks: xTarget,
      yAxisMinPixelSpacing: ySpacing,
      xAxisMinPixelSpacing: xSpacing,
      isMobile: true,
    };
  } else {
    // Desktop: more generous spacing
    const yTarget = Math.max(6, Math.floor(canvasHeight / 80)); // ~1 label every 80px
    const xTarget = Math.max(5, Math.floor(canvasWidth / 90)); // ~1 label every 90px
    const ySpacing = 55; // desktop minimum 55px per label
    const xSpacing = 80; // desktop minimum 80px per label
    return {
      yAxisTargetTicks: yTarget,
      xAxisTargetTicks: xTarget,
      yAxisMinPixelSpacing: ySpacing,
      xAxisMinPixelSpacing: xSpacing,
      isMobile: false,
    };
  }
}

/**
 * Calculate major Y-axis (price) ticks using adaptive density.
 * Input: visible price range and chart height.
 * Output: filtered ticks respecting minimum pixel spacing.
 * Does NOT modify chart state; purely computational.
 */
export function calculateAdaptiveYAxisTicks(
  visibleMinPrice: number,
  visibleMaxPrice: number,
  chartHeight: number,
  chartWidth: number,
  yScalePixelMapper?: (value: number) => number,
): number[] {
  if (!isFinite(visibleMinPrice) || !isFinite(visibleMaxPrice) || chartHeight <= 0) {
    return [];
  }

  const range = visibleMaxPrice - visibleMinPrice;
  if (range <= 0) return [visibleMinPrice];

  const { yAxisTargetTicks, yAxisMinPixelSpacing } = detectMobileTickTargets(
    chartWidth,
    chartHeight,
  );

  const step = calculateNiceStep(range, yAxisTargetTicks);
  const tickValues = generateNumericTicks(visibleMinPrice, visibleMaxPrice, step);

  // If no pixel mapper provided, return all ticks (chart will apply maxTicksLimit)
  if (!yScalePixelMapper) {
    return tickValues;
  }

  // Apply pixel spacing filter
  return filterTicksByPixelSpacing(
    tickValues,
    yScalePixelMapper,
    yAxisMinPixelSpacing,
  );
}

/**
 * Calculate major X-axis (time) ticks using adaptive density.
 * Input: visible time range and chart width.
 * Output: filtered ticks respecting minimum pixel spacing.
 * Does NOT modify chart state; purely computational.
 */
export function calculateAdaptiveXAxisTicks(
  visibleMinTime: number,
  visibleMaxTime: number,
  chartWidth: number,
  chartHeight: number,
  xScalePixelMapper?: (value: number) => number,
): number[] {
  if (!isFinite(visibleMinTime) || !isFinite(visibleMaxTime) || chartWidth <= 0) {
    return [];
  }

  const range = visibleMaxTime - visibleMinTime;
  if (range <= 0) return [visibleMinTime];

  const { xAxisTargetTicks, xAxisMinPixelSpacing } = detectMobileTickTargets(
    chartWidth,
    chartHeight,
  );

  const step = calculateNiceStep(range, xAxisTargetTicks);
  const tickValues = generateNumericTicks(visibleMinTime, visibleMaxTime, step);

  // If no pixel mapper provided, return all ticks (chart will apply maxTicksLimit)
  if (!xScalePixelMapper) {
    return tickValues;
  }

  // Apply pixel spacing filter
  return filterTicksByPixelSpacing(
    tickValues,
    xScalePixelMapper,
    xAxisMinPixelSpacing,
  );
}

/**
 * ╔════════════════════════════════════════════════════════════════╗
 * ║     TRADINGVIEW-STYLE COORDINATE SYSTEM (TradingChart)        ║
 * ║  Unified transforms for candles, signals, indicators, boxes   ║
 * ╚════════════════════════════════════════════════════════════════╝
 */

/**
 * Viewport definition: describes the visible portion of the price chart
 * in both data space (indices, prices) and pixel space (width, height).
 * All overlays use this to convert data → pixels consistently.
 */
export interface ChartViewport {
  /** Index of first visible candle in data array */
  visibleStartIndex: number;
  /** Index of last visible candle in data array */
  visibleEndIndex: number;
  /** Minimum (lowest) price in viewport */
  minPrice: number;
  /** Maximum (highest) price in viewport */
  maxPrice: number;
  /** Chart drawable width in pixels */
  width: number;
  /** Chart drawable height in pixels */
  height: number;
}

/**
 * Transform: candle data index → pixel X position
 * Linear interpolation across visible bar range and canvas width.
 * TradingView-compatible: leftmost visible bar at ~0px, rightmost at width.
 *
 * @param index - Candle position in data array (0-based)
 * @param viewport - Current visible range and dimensions
 * @returns Pixel X position (0 = left edge, width = right edge)
 */
export function indexToX(index: number, viewport: ChartViewport): number {
  const visibleBars = viewport.visibleEndIndex - viewport.visibleStartIndex;
  if (visibleBars <= 0) return 0;

  const relativePosition = index - viewport.visibleStartIndex;
  return (relativePosition / visibleBars) * viewport.width;
}

/**
 * Transform: price value → pixel Y position
 * Linear interpolation from price range to canvas height.
 * TradingView-compatible: bottom = lowest price, top = highest price.
 * Y-axis is *inverted* in canvas (0 = top, height = bottom).
 *
 * @param price - Price level to locate
 * @param viewport - Current price range and dimensions
 * @returns Pixel Y position (0 = top/highest, height = bottom/lowest)
 */
export function priceToY(price: number, viewport: ChartViewport): number {
  const priceRange = viewport.maxPrice - viewport.minPrice;
  if (priceRange <= 0) return viewport.height / 2;

  const normalizedPrice = (price - viewport.minPrice) / priceRange;
  return viewport.height - normalizedPrice * viewport.height;
}

/**
 * Build a ChartViewport object from current chart state.
 * Calculates visible index range from data and scale boundaries.
 *
 * @param data - Full candlestick data array
 * @param xMin - X-scale min (timestamp, milliseconds)
 * @param xMax - X-scale max (timestamp, milliseconds)
 * @param yMin - Y-scale min (price)
 * @param yMax - Y-scale max (price)
 * @param chartWidth - Drawable canvas width (pixels)
 * @param chartHeight - Drawable canvas height (pixels)
 * @returns ChartViewport object with calculated index range and dimensions
 */
export function buildChartViewport(
  data: Array<{ x: number; h?: number; l?: number }>,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  chartWidth: number,
  chartHeight: number,
): ChartViewport {
  if (!data || data.length === 0) {
    return {
      visibleStartIndex: 0,
      visibleEndIndex: 0,
      minPrice: yMin,
      maxPrice: yMax,
      width: chartWidth,
      height: chartHeight,
    };
  }

  // Find indices of first and last visible candles
  let visibleStartIndex = 0;
  let visibleEndIndex = data.length - 1;

  for (let i = 0; i < data.length; i++) {
    if (data[i].x >= xMin) {
      visibleStartIndex = i;
      break;
    }
  }

  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].x <= xMax) {
      visibleEndIndex = i;
      break;
    }
  }

  return {
    visibleStartIndex,
    visibleEndIndex,
    minPrice: yMin,
    maxPrice: yMax,
    width: chartWidth,
    height: chartHeight,
  };
}

/**
 * Calculate display width for candles based on visible bar count.
 * Produces TradingView-like spacing: 80% candle, 20% gap.
 *
 * @param viewport - Viewport with visible bar count information
 * @returns Candle width in pixels (1–16 for typical zoom levels)
 */
export function calculateCandleWidth(viewport: ChartViewport): number {
  const visibleBars = viewport.visibleEndIndex - viewport.visibleStartIndex;
  if (visibleBars <= 0) return 2;

  // Total pixel space per candle (average)
  const pixelsPerBar = viewport.width / visibleBars;

  // Candle fills 80% of allocated space; gap is 20%
  const candleWidthPx = pixelsPerBar * 0.8;

  // Clamp to reasonable bounds
  return Math.max(2, Math.min(16, candleWidthPx));
}
