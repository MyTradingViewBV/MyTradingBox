/**
 * Market Cipher B indicator math for the MCB panel (pure functions of the
 * candle series). WaveTrend 9/12/3 and money flow follow the "Market Cipher B"
 * Pine script used on TradingView (Ovolino24); RSI 14 and Stoch RSI 14/14 with
 * 3/3 smoothing follow VuManChu Cipher B. Produces the Chart.js datasets and the
 * side values; the horizontal levels are drawn by the panel (MCB_LEVELS).
 */

export interface McbSideValue {
  key: string;
  value: number;
  /** Chip background (matches the line colour). */
  color: string;
  /** Chip text colour, readable on `color`. */
  textColor: string;
}

export interface McbLevel {
  value: number;
  color: string;
  dash: number[];
  width: number;
}

export interface McbPanelData {
  chartData: { datasets: any[] };
  sideValues: McbSideValue[];
  /** The computed series behind the datasets (prediction lines snap onto them). */
  series: McbSeries;
}

/** Which parts of the MCB panel are drawn (settings panel toggles). */
export interface McbVisibility {
  waveTrend: boolean;
  vwap: boolean;
  moneyFlow: boolean;
  rsi: boolean;
  stochRsi: boolean;
  /** Dots on wt2 at every WaveTrend cross (persisted as waveCrosses: the old 'crosses' key defaulted to off). */
  waveCrosses: boolean;
  /** Small wt2 dot on every bar, like the WPF Market Cipher view. */
  momentumDots: boolean;
  signals: boolean;
  /** DivPredictionBot divergence lines (MCB panel + candles). */
  predictionLines: boolean;
}

export type McbVisibilityKey = keyof McbVisibility;

export const MCB_DEFAULT_VISIBILITY: McbVisibility = {
  waveTrend: true,
  vwap: false,
  moneyFlow: true,
  rsi: false,
  stochRsi: false,
  waveCrosses: true,
  momentumDots: true,
  signals: false,
  predictionLines: true,
};

/** Settings-panel order, with the swatch colour shown next to each toggle. */
export const MCB_VISIBILITY_OPTIONS: Array<{ key: McbVisibilityKey; labelKey: string; color: string }> = [
  { key: 'waveTrend', labelKey: 'CHART.MCB_WAVETREND', color: '#c1cbff' },
  { key: 'vwap', labelKey: 'CHART.MCB_VWAP', color: '#ffeb3b' },
  { key: 'moneyFlow', labelKey: 'CHART.MCB_MONEY_FLOW', color: '#53ff1e' },
  { key: 'rsi', labelKey: 'CHART.MCB_RSI', color: '#c33ee1' },
  { key: 'stochRsi', labelKey: 'CHART.MCB_STOCH_RSI', color: '#00e676' },
  { key: 'waveCrosses', labelKey: 'CHART.MCB_CROSSES', color: '#ff5252' },
  { key: 'momentumDots', labelKey: 'CHART.MCB_MOMENTUM_DOTS', color: '#0019fa' },
  { key: 'signals', labelKey: 'CHART.MCB_SIGNALS', color: '#00e676' },
  { key: 'predictionLines', labelKey: 'CHART.MCB_PREDICTION_LINES', color: '#00ff77' },
];

/** Merge persisted (possibly partial / malformed) visibility over the defaults. */
export function normalizeMcbVisibility(raw: unknown): McbVisibility {
  const result = { ...MCB_DEFAULT_VISIBILITY };
  if (!raw || typeof raw !== 'object') return result;
  for (const key of Object.keys(result) as McbVisibilityKey[]) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === 'boolean') result[key] = v;
  }
  return result;
}

/** Market Cipher B (TradingView Pine) defaults. */
export const MCB_SETTINGS = {
  wtChannelLen: 9,
  wtAverageLen: 12,
  wtMaLen: 3,
  obLevel: 53,
  osLevel: -53,
  /** CCI-style length of the money flow source. */
  mfCciLen: 5,
  mfiPeriod: 60,
  rsiLen: 14,
  rsiOversold: 30,
  rsiOverbought: 60,
  stochLen: 14,
  stochRsiLen: 14,
  stochK: 3,
  stochD: 3,
  /** y of the large buy / sell signal dots. */
  signalY: 107,
} as const;

export const MCB_LEVELS: McbLevel[] = [
  { value: 100, color: 'rgba(255,255,255,0.3)', dash: [2, 6], width: 1 },
  { value: 60, color: 'rgba(255,255,255,0.85)', dash: [], width: 1.2 },
  { value: 53, color: 'rgba(255,255,255,0.45)', dash: [2, 4], width: 1 },
  { value: 0, color: 'rgba(255,255,255,0.75)', dash: [], width: 1 },
  { value: -53, color: 'rgba(255,255,255,0.45)', dash: [2, 4], width: 1 },
  { value: -60, color: 'rgba(255,255,255,0.85)', dash: [], width: 1.2 },
];

const COLORS = {
  // Matched to the TradingView "MCB RealWavePred" Pine script (Bots/AIBot/pine).
  wt1: 'rgba(193,203,255,0.9)',
  wt1Fill: 'rgba(193,203,255,0.47)',
  wt1Chip: '#c1cbff',
  wt2: 'rgba(0,25,250,0.75)',
  wt2Fill: 'rgba(0,25,250,0.68)',
  wt2Chip: '#0019fa',
  vwap: 'rgba(255,235,59,0.85)',
  mfUp: 'rgba(83,255,30,0.6)',
  mfUpFill: 'rgba(83,255,30,0.48)',
  mfUpChip: '#53ff1e',
  mfDown: 'rgba(255,17,0,0.6)',
  mfDownFill: 'rgba(255,17,0,0.5)',
  mfDownChip: '#ff1100',
  rsi: '#c33ee1',
  rsiOversold: '#3ee145',
  rsiOverbought: '#e13e3e',
  stochUp: '#00e676',
  stochDown: '#ff5252',
  stochD: '#673ab7',
  buy: '#00e676',
  sell: '#ff5252',
} as const;

export interface McbSeries {
  x: number[];
  wt1: Array<number | null>;
  wt2: Array<number | null>;
  vwap: Array<number | null>;
  mf: Array<number | null>;
  rsi: Array<number | null>;
  stochK: Array<number | null>;
  stochD: Array<number | null>;
  /** Every wt1/wt2 cross, plotted at wt2. */
  crosses: Array<{ x: number; y: number; up: boolean }>;
  /** wt2 on every bar where WaveTrend is defined (WPF momentum dots). */
  momentum: Array<{ x: number; y: number }>;
  /** Crosses up while wt2 is oversold (big green dots). */
  buySignals: number[];
  /** Crosses down while wt2 is overbought (big red dots). */
  sellSignals: number[];
}

/** Compute the raw MCB series; returns null when there are no usable candles. */
export function computeMcbSeries(candles: any[]): McbSeries | null {
  if (!candles?.length) return null;

  const valid = candles.filter(
    (c: any) =>
      Number.isFinite(Number(c?.x)) &&
      Number.isFinite(Number(c?.h)) &&
      Number.isFinite(Number(c?.l)) &&
      Number.isFinite(Number(c?.c)),
  );
  if (!valid.length) return null;

  const s = MCB_SETTINGS;
  const x = valid.map((c: any) => Number(c.x));
  const high = valid.map((c: any) => Number(c.h));
  const low = valid.map((c: any) => Number(c.l));
  const close = valid.map((c: any) => Number(c.c));
  const hlc3 = high.map((h, i) => (h + low[i] + close[i]) / 3);

  // WaveTrend
  const esa = seriesEma(hlc3, s.wtChannelLen);
  const de = seriesEma(
    hlc3.map((v, i) => (esa[i] == null ? null : Math.abs(v - (esa[i] as number)))),
    s.wtChannelLen,
  );
  const ci = hlc3.map((v, i) => {
    const e = esa[i];
    const d = de[i];
    if (e == null || d == null || d === 0) return null;
    return (v - e) / (0.015 * d);
  });
  const wt1 = seriesEma(ci, s.wtAverageLen);
  const wt2 = seriesSma(wt1, s.wtMaLen);
  const vwap = wt1.map((v, i) => (v == null || wt2[i] == null ? null : v - (wt2[i] as number)));

  // Money flow: SMA(60) of a CCI-like value, m = sma(hlc3, 5), f = sma(|hlc3 - m|, 5),
  // i = (hlc3 - m) / (0.015 * f). A zero deviation gives na, like Pine's division by zero.
  const mfMean = seriesSma(hlc3, s.mfCciLen);
  const mfDev = seriesSma(
    hlc3.map((v, i) => (mfMean[i] == null ? null : Math.abs(v - (mfMean[i] as number)))),
    s.mfCciLen,
  );
  const mfCci = hlc3.map((v, i) => {
    const m = mfMean[i];
    const f = mfDev[i];
    if (m == null || f == null || f === 0) return null;
    return (v - m) / (0.015 * f);
  });
  const mf = seriesSma(mfCci, s.mfiPeriod);

  // RSI and Stoch RSI
  const rsi = seriesRsi(close, s.rsiLen);
  const stochK = seriesSma(seriesStoch(rsi, s.stochLen), s.stochK);
  const stochD = seriesSma(stochK, s.stochD);

  const crosses: McbSeries['crosses'] = [];
  const momentum: McbSeries['momentum'] = [];
  for (let i = 0; i < x.length; i++) {
    const v = wt2[i];
    if (v != null && wt1[i] != null) momentum.push({ x: x[i], y: v });
  }
  const buySignals: number[] = [];
  const sellSignals: number[] = [];
  for (let i = 1; i < x.length; i++) {
    const f0 = wt1[i - 1];
    const s0 = wt2[i - 1];
    const f1 = wt1[i];
    const s1 = wt2[i];
    if (f0 == null || s0 == null || f1 == null || s1 == null) continue;
    const crossedUp = f0 <= s0 && f1 > s1;
    const crossedDown = f0 >= s0 && f1 < s1;
    if (!crossedUp && !crossedDown) continue;
    crosses.push({ x: x[i], y: s1, up: crossedUp });
    if (crossedUp && s1 <= s.osLevel) buySignals.push(x[i]);
    if (crossedDown && s1 >= s.obLevel) sellSignals.push(x[i]);
  }

  return { x, wt1, wt2, vwap, mf, rsi, stochK, stochD, crosses, momentum, buySignals, sellSignals };
}

type XYPoint = { x: number; y: number | null };

/**
 * Split a series into its positive and non-positive parts for two filled areas.
 * Where it crosses zero between two candles both parts get a point at y=0 at the
 * interpolated time, so the areas meet without a gap and a one-candle run still
 * shows (a plain sign split leaves that segment, and single points, undrawn).
 */
export function splitAtZero(
  x: number[],
  values: Array<number | null>,
): { up: XYPoint[]; down: XYPoint[] } {
  const up: XYPoint[] = [];
  const down: XYPoint[] = [];
  for (let i = 0; i < x.length; i++) {
    const v = values[i];
    if (v == null) {
      up.push({ x: x[i], y: null });
      down.push({ x: x[i], y: null });
      continue;
    }
    const prev = i > 0 ? values[i - 1] : null;
    if (prev != null && prev > 0 !== v > 0) {
      const t = prev / (prev - v);
      const crossing = { x: x[i - 1] + (x[i] - x[i - 1]) * t, y: 0 };
      up.push(crossing);
      down.push({ ...crossing });
    }
    up.push({ x: x[i], y: v > 0 ? v : null });
    down.push({ x: x[i], y: v > 0 ? null : v });
  }
  return { up, down };
}

/**
 * Build the MCB panel datasets; returns null when there are no usable candles.
 * Hidden parts get neither datasets nor side chips.
 */
export function buildMcbPanelData(
  candles: any[],
  visibility: McbVisibility = MCB_DEFAULT_VISIBILITY,
): McbPanelData | null {
  const series = computeMcbSeries(candles);
  if (!series) return null;

  const { x, wt1, wt2, vwap, mf, rsi, stochK, stochD, crosses, momentum, buySignals, sellSignals } = series;
  const s = MCB_SETTINGS;
  const toLine = (values: Array<number | null>) => x.map((xi, i) => ({ x: xi, y: values[i] }));
  const pointsLine = (label: string, data: XYPoint[], extra: Record<string, unknown>) => ({
    label,
    data,
    type: 'line',
    borderWidth: 1,
    pointRadius: 0,
    spanGaps: false,
    ...extra,
  });
  const line = (label: string, values: Array<number | null>, extra: Record<string, unknown>) =>
    pointsLine(label, toLine(values), extra);
  const dots = (
    label: string,
    data: Array<{ x: number; y: number }>,
    color: string,
    radius: number,
    borderColor = color,
    order = -1,
  ) => ({
    label,
    data,
    type: 'scatter',
    pointRadius: radius,
    pointHoverRadius: radius,
    pointBackgroundColor: color,
    pointBorderColor: borderColor,
    pointBorderWidth: 1,
    showLine: false,
    // Above the waves (Chart.js draws lower `order` on top).
    order,
  });

  const rsiColor = (v: number | null | undefined) =>
    v == null
      ? COLORS.rsi
      : v <= s.rsiOversold
        ? COLORS.rsiOversold
        : v >= s.rsiOverbought
          ? COLORS.rsiOverbought
          : COLORS.rsi;
  const stochColor = (k: number | null | undefined, d: number | null | undefined) =>
    k == null || d == null ? 'rgba(180,180,180,0.75)' : k >= d ? COLORS.stochUp : COLORS.stochDown;

  const show = visibility;
  const datasets: any[] = [];
  if (show.moneyFlow) {
    const mfSides = splitAtZero(x, mf);
    datasets.push(
      pointsLine('mf+', mfSides.up, {
        borderColor: COLORS.mfUp,
        backgroundColor: COLORS.mfUpFill,
        fill: 'origin',
        // No overshoot past zero next to the crossing points.
        cubicInterpolationMode: 'monotone',
      }),
      pointsLine('mf-', mfSides.down, {
        borderColor: COLORS.mfDown,
        backgroundColor: COLORS.mfDownFill,
        fill: 'origin',
        // No overshoot past zero next to the crossing points.
        cubicInterpolationMode: 'monotone',
      }),
    );
  }
  if (show.waveTrend) {
    datasets.push(
      line('fast', wt1, {
        borderColor: COLORS.wt1,
        backgroundColor: COLORS.wt1Fill,
        fill: 'origin',
        borderWidth: 1.1,
        // Chart.js draws lower `order` on top; keep the grey wave under the blue one.
        order: 1,
      }),
      line('slow', wt2, {
        borderColor: COLORS.wt2,
        backgroundColor: COLORS.wt2Fill,
        fill: 'origin',
      }),
    );
  }
  if (show.vwap) {
    datasets.push(
      line('vwap', vwap, {
        borderColor: COLORS.vwap,
        backgroundColor: 'rgba(255,235,59,0.17)',
        fill: 'origin',
      }),
    );
  }
  if (show.rsi) {
    datasets.push(
      line('rsi', rsi, {
        borderColor: COLORS.rsi,
        segment: { borderColor: (ctx: any) => rsiColor(rsi[Number(ctx?.p1DataIndex ?? 0)]) },
      }),
    );
  }
  if (show.stochRsi) {
    datasets.push(
      line('stochD', stochD, { borderColor: COLORS.stochD }),
      line('stoch', stochK, {
        borderWidth: 1.2,
        segment: {
          borderColor: (ctx: any) => {
            const i = Number(ctx?.p1DataIndex ?? 0);
            return stochColor(stochK[i], stochD[i]);
          },
        },
      }),
    );
  }
  if (show.momentumDots) {
    // WPF: GeometrySize 3 in the wt2 colour, under the cross circles.
    datasets.push({ ...dots('momentum', momentum, COLORS.wt2Chip, 1.5, COLORS.wt2Chip, -0.5), pointBorderWidth: 0 });
  }
  if (show.waveCrosses) {
    datasets.push(
      // VuManChu "buy and sell circles" on wt2 at every WaveTrend cross; dark rim keeps them visible on the waves.
      dots('crossUp', crosses.filter((c) => c.up).map(({ x, y }) => ({ x, y })), COLORS.buy, 3.5, 'rgba(0,0,0,0.55)'),
      dots('crossDown', crosses.filter((c) => !c.up).map(({ x, y }) => ({ x, y })), COLORS.sell, 3.5, 'rgba(0,0,0,0.55)'),
    );
  }
  if (show.signals) {
    datasets.push(
      dots('buy', buySignals.map((xi) => ({ x: xi, y: -s.signalY })), COLORS.buy, 4),
      dots('sell', sellSignals.map((xi) => ({ x: xi, y: s.signalY })), COLORS.sell, 4),
    );
  }
  // Everything hidden: keep an invisible line so the panel (and its time axis) stays.
  if (!datasets.length) {
    datasets.push(line('anchor', x.map(() => null), { borderColor: 'transparent' }));
  }
  const chartData = { datasets };

  const lastMf = lastDefined(mf);
  const lastRsi = lastDefined(rsi);
  const lastK = lastDefined(stochK);
  const lastD = lastDefined(stochD);
  const chip = (key: string, value: number | null, color: string, textColor = '#111') =>
    value == null ? null : { key, value, color, textColor };

  const sideValues = [
    show.waveTrend ? chip('fast', lastDefined(wt1), COLORS.wt1Chip) : null,
    show.waveTrend ? chip('slow', lastDefined(wt2), COLORS.wt2Chip, '#fff') : null,
    show.moneyFlow
      ? chip('mf', lastMf, lastMf != null && lastMf >= 0 ? COLORS.mfUpChip : COLORS.mfDownChip)
      : null,
    show.rsi ? chip('rsi', lastRsi, rsiColor(lastRsi), '#fff') : null,
    show.stochRsi ? chip('stoch', lastK, stochColor(lastK, lastD)) : null,
  ].filter((v): v is McbSideValue => v != null);

  return { chartData, sideValues, series };
}

export function seriesEma(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null);
  const alpha = 2 / (length + 1);
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      result[i] = prev;
      continue;
    }
    prev = prev == null ? v : alpha * v + (1 - alpha) * prev;
    result[i] = prev;
  }
  return result;
}

/** Simple moving average; null until the window holds `length` finite values. */
export function seriesSma(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;
  let finite = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) {
      sum += v;
      finite++;
    }
    if (i >= length) {
      const out = values[i - length];
      if (out != null && Number.isFinite(out)) {
        sum -= out;
        finite--;
      }
    }
    if (i >= length - 1 && finite === length) result[i] = sum / length;
  }
  return result;
}

/** Wilder RSI (Pine ta.rsi): RMA of gains / losses, seeded with their SMA. */
export function seriesRsi(close: number[], length: number): Array<number | null> {
  const result: Array<number | null> = new Array(close.length).fill(null);
  let avgUp = 0;
  let avgDown = 0;
  for (let i = 1; i < close.length; i++) {
    const change = close[i] - close[i - 1];
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (i <= length) {
      avgUp += up / length;
      avgDown += down / length;
      if (i < length) continue;
    } else {
      avgUp = (avgUp * (length - 1) + up) / length;
      avgDown = (avgDown * (length - 1) + down) / length;
    }
    result[i] = avgDown === 0 ? 100 : avgUp === 0 ? 0 : 100 - 100 / (1 + avgUp / avgDown);
  }
  return result;
}

/** Stochastic of a series against its own high / low (Pine ta.stoch(src, src, src, len)). */
export function seriesStoch(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null);
  for (let i = length - 1; i < values.length; i++) {
    let peak = -Infinity;
    let trough = Infinity;
    let complete = true;
    for (let j = i - length + 1; j <= i; j++) {
      const v = values[j];
      if (v == null || !Number.isFinite(v)) {
        complete = false;
        break;
      }
      if (v > peak) peak = v;
      if (v < trough) trough = v;
    }
    const v = values[i];
    if (!complete || v == null || peak === trough) continue;
    result[i] = ((v - trough) / (peak - trough)) * 100;
  }
  return result;
}

function lastDefined(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) return Number(v.toFixed(1));
  }
  return null;
}
