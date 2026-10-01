/**
 * Market Cipher B indicator math for the MCB panel (pure functions of the
 * candle series). Follows the open-source VuManChu Cipher B defaults:
 * WaveTrend 9/12/4, RSI+MFI area (60 × 150, offset 2.5), RSI 14 and
 * Stoch RSI 14/14 with 3/3 smoothing. Produces the Chart.js datasets and the
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
  /** Shown as a faint label in the side gutter when it does not collide with a value chip. */
  labelled: boolean;
}

export interface McbPanelData {
  chartData: { datasets: any[] };
  sideValues: McbSideValue[];
}

/** VuManChu Cipher B defaults. */
export const MCB_SETTINGS = {
  wtChannelLen: 9,
  wtAverageLen: 12,
  wtMaLen: 4,
  obLevel: 53,
  osLevel: -53,
  mfiPeriod: 60,
  mfiMultiplier: 150,
  mfiPosY: 2.5,
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
  { value: 100, color: 'rgba(255,255,255,0.3)', dash: [2, 6], width: 1, labelled: false },
  { value: 60, color: 'rgba(255,255,255,0.85)', dash: [], width: 1.2, labelled: true },
  { value: 53, color: 'rgba(255,255,255,0.45)', dash: [2, 4], width: 1, labelled: true },
  { value: 0, color: 'rgba(255,255,255,0.75)', dash: [], width: 1, labelled: true },
  { value: -53, color: 'rgba(255,255,255,0.45)', dash: [2, 4], width: 1, labelled: true },
  { value: -60, color: 'rgba(255,255,255,0.85)', dash: [], width: 1.2, labelled: true },
];

const COLORS = {
  wt1: 'rgba(193,203,255,0.95)',
  wt1Chip: '#c1cbff',
  wt2: 'rgba(0,25,250,0.92)',
  wt2Chip: '#1e3bff',
  vwap: 'rgba(255,235,59,0.7)',
  mfUp: 'rgba(83,255,30,0.95)',
  mfUpChip: '#3ee145',
  mfDown: 'rgba(255,17,0,0.92)',
  mfDownChip: '#ff3b30',
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
  // Missing opens fall back to the previous close (or the close for the first bar).
  const open = valid.map((c: any, i: number) => {
    const o = Number(c?.o);
    return Number.isFinite(o) ? o : i > 0 ? close[i - 1] : close[i];
  });
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

  // RSI+MFI area. A bar with high == low counts as 0 (Pine would give na for 60 bars).
  const mfRaw = close.map((c, i) => {
    const range = high[i] - low[i];
    return range === 0 ? 0 : ((c - open[i]) / range) * s.mfiMultiplier;
  });
  const mf = seriesSma(mfRaw, s.mfiPeriod).map((v) => (v == null ? null : v - s.mfiPosY));

  // RSI and Stoch RSI
  const rsi = seriesRsi(close, s.rsiLen);
  const stochK = seriesSma(seriesStoch(rsi, s.stochLen), s.stochK);
  const stochD = seriesSma(stochK, s.stochD);

  const crosses: McbSeries['crosses'] = [];
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

  return { x, wt1, wt2, vwap, mf, rsi, stochK, stochD, crosses, buySignals, sellSignals };
}

/** Build the MCB panel datasets; returns null when there are no usable candles. */
export function buildMcbPanelData(candles: any[]): McbPanelData | null {
  const series = computeMcbSeries(candles);
  if (!series) return null;

  const { x, wt1, wt2, vwap, mf, rsi, stochK, stochD, crosses, buySignals, sellSignals } = series;
  const s = MCB_SETTINGS;
  const toLine = (values: Array<number | null>) => x.map((xi, i) => ({ x: xi, y: values[i] }));
  const line = (label: string, values: Array<number | null>, extra: Record<string, unknown>) => ({
    label,
    data: toLine(values),
    type: 'line',
    borderWidth: 1,
    pointRadius: 0,
    spanGaps: false,
    ...extra,
  });
  const dots = (label: string, data: Array<{ x: number; y: number }>, color: string, radius: number) => ({
    label,
    data,
    type: 'scatter',
    pointRadius: radius,
    pointHoverRadius: radius,
    pointBackgroundColor: color,
    pointBorderColor: color,
    showLine: false,
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

  const chartData = {
    datasets: [
      line('mf+', mf.map((v) => (v != null && v > 0 ? v : null)), {
        borderColor: COLORS.mfUp,
        backgroundColor: 'rgba(60,255,0,0.34)',
        fill: 'origin',
      }),
      line('mf-', mf.map((v) => (v != null && v <= 0 ? v : null)), {
        borderColor: COLORS.mfDown,
        backgroundColor: 'rgba(255,17,0,0.32)',
        fill: 'origin',
      }),
      line('fast', wt1, {
        borderColor: COLORS.wt1,
        backgroundColor: 'rgba(193,203,255,0.28)',
        fill: 'origin',
        borderWidth: 1.1,
      }),
      line('slow', wt2, {
        borderColor: COLORS.wt2,
        backgroundColor: 'rgba(0,25,250,0.2)',
        fill: 'origin',
      }),
      line('vwap', vwap, {
        borderColor: COLORS.vwap,
        backgroundColor: 'rgba(255,235,59,0.17)',
        fill: 'origin',
      }),
      line('rsi', rsi, {
        borderColor: COLORS.rsi,
        segment: { borderColor: (ctx: any) => rsiColor(rsi[Number(ctx?.p1DataIndex ?? 0)]) },
      }),
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
      dots('crossUp', crosses.filter((c) => c.up).map(({ x, y }) => ({ x, y })), COLORS.buy, 2),
      dots('crossDown', crosses.filter((c) => !c.up).map(({ x, y }) => ({ x, y })), COLORS.sell, 2),
      dots('buy', buySignals.map((xi) => ({ x: xi, y: -s.signalY })), COLORS.buy, 4),
      dots('sell', sellSignals.map((xi) => ({ x: xi, y: s.signalY })), COLORS.sell, 4),
    ],
  };

  const lastMf = lastDefined(mf);
  const lastRsi = lastDefined(rsi);
  const lastK = lastDefined(stochK);
  const lastD = lastDefined(stochD);
  const chip = (key: string, value: number | null, color: string, textColor = '#111') =>
    value == null ? null : { key, value, color, textColor };

  const sideValues = [
    chip('fast', lastDefined(wt1), COLORS.wt1Chip),
    chip('slow', lastDefined(wt2), COLORS.wt2Chip, '#fff'),
    chip('mf', lastMf, lastMf != null && lastMf >= 0 ? COLORS.mfUpChip : COLORS.mfDownChip),
    chip('rsi', lastRsi, rsiColor(lastRsi), '#fff'),
    chip('stoch', lastK, stochColor(lastK, lastD)),
  ].filter((v): v is McbSideValue => v != null);

  return { chartData, sideValues };
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
