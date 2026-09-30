/**
 * Market Cipher B indicator math for the MCB panel (pure functions of the
 * candle series). Produces the Chart.js line datasets and the side values.
 */

export interface McbSideValue {
  key: string;
  value: number;
  color: string;
}

export interface McbPanelData {
  chartData: { datasets: any[] };
  sideValues: McbSideValue[];
}

/** Build the MCB panel datasets; returns null when there are no usable candles. */
export function buildMcbPanelData(candles: any[]): McbPanelData | null {
  if (!candles?.length) {
    return null;
  }

  const validCandles = candles.filter(
    (c: any) =>
      Number.isFinite(Number(c?.x)) &&
      Number.isFinite(Number(c?.h)) &&
      Number.isFinite(Number(c?.l)) &&
      Number.isFinite(Number(c?.c)),
  );
  if (!validCandles.length) {
    return null;
  }

  const x = validCandles.map((c: any) => Number(c.x));
  const high = validCandles.map((c: any) => Number(c.h));
  const low = validCandles.map((c: any) => Number(c.l));
  const close = validCandles.map((c: any) => Number(c.c));
  const hlc3 = high.map((h, i) => (h + low[i] + close[i]) / 3);

  const ema9 = seriesEma(hlc3, 9);
  const absDev = hlc3.map((v, i) => {
    const e = ema9[i];
    return e == null ? null : Math.abs(v - e);
  });
  const emaAbsDev9 = seriesEma(absDev, 9);
  const z = hlc3.map((v, i) => {
    const e = ema9[i];
    const d = emaAbsDev9[i];
    if (e == null || d == null || d === 0) return null;
    return (v - e) / (0.015 * d);
  });
  const fast = seriesEma(z, 12);
  const slow = seriesSma(fast, 3);
  const vwap = fast.map((v, i) => (v == null || slow[i] == null ? null : v - (slow[i] as number)));

  const m = seriesSma(hlc3, 5);
  const f = seriesSma(
    hlc3.map((v, i) => (m[i] == null ? null : Math.abs(v - (m[i] as number)))),
    5,
  );
  const moneyFlowSeed = hlc3.map((v, i) => {
    const mv = m[i];
    const fv = f[i];
    if (mv == null || fv == null || fv === 0) return null;
    return (v - mv) / (0.015 * fv);
  });
  const mf = seriesSma(moneyFlowSeed, 60);

  const rsi = seriesStoch(close, high, low, 40, 2);
  const stoch = seriesStoch(close, high, low, 81, 2);

  const buyDots: Array<{ x: number; y: number }> = [];
  const sellDots: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < x.length; i++) {
    const fPrev = fast[i - 1];
    const sPrev = slow[i - 1];
    const fNow = fast[i];
    const sNow = slow[i];
    if (fPrev == null || sPrev == null || fNow == null || sNow == null) continue;
    if (fPrev <= sPrev && fNow > sNow) buyDots.push({ x: x[i], y: sNow });
    if (fPrev >= sPrev && fNow < sNow) sellDots.push({ x: x[i], y: sNow });
  }

  const toLine = (values: Array<number | null>) =>
    x.map((xi, i) => ({ x: xi, y: values[i] }));

  const mfPos = mf.map((v) => (v != null && v > 0 ? v : null));
  const mfNeg = mf.map((v) => (v != null && v <= 0 ? v : null));

  const levelSeries = (value: number) => x.map((xi) => ({ x: xi, y: value }));

  const chartData = {
    datasets: [
      {
        label: 'OB 60',
        data: levelSeries(60),
        type: 'line',
        borderColor: '#ffffff',
        borderWidth: 1.2,
        pointRadius: 0,
      },
      {
        label: 'OS -60',
        data: levelSeries(-60),
        type: 'line',
        borderColor: '#ffffff',
        borderWidth: 1.2,
        pointRadius: 0,
      },
      {
        label: '53',
        data: levelSeries(53),
        type: 'line',
        borderColor: 'rgba(255,255,255,0.45)',
        borderDash: [2, 4],
        borderWidth: 1,
        pointRadius: 0,
      },
      {
        label: '-53',
        data: levelSeries(-53),
        type: 'line',
        borderColor: 'rgba(255,255,255,0.45)',
        borderDash: [2, 4],
        borderWidth: 1,
        pointRadius: 0,
      },
      {
        label: '100',
        data: levelSeries(100),
        type: 'line',
        borderColor: 'rgba(255,255,255,0.3)',
        borderDash: [2, 6],
        borderWidth: 1,
        pointRadius: 0,
      },
      {
        label: '0',
        data: levelSeries(0),
        type: 'line',
        borderColor: 'rgba(255,255,255,0.75)',
        borderWidth: 1,
        pointRadius: 0,
      },
      {
        label: 'fast',
        data: toLine(fast),
        type: 'line',
        borderColor: 'rgba(193,203,255,0.95)',
        backgroundColor: 'rgba(193,203,255,0.28)',
        fill: 'origin',
        borderWidth: 1.1,
        pointRadius: 0,
        spanGaps: false,
      },
      {
        label: 'slow',
        data: toLine(slow),
        type: 'line',
        borderColor: 'rgba(0,25,250,0.92)',
        backgroundColor: 'rgba(0,25,250,0.2)',
        fill: 'origin',
        borderWidth: 1,
        pointRadius: 0,
        spanGaps: false,
      },
      {
        label: 'vwap',
        data: toLine(vwap),
        type: 'line',
        borderColor: 'rgba(255,235,59,0.7)',
        backgroundColor: 'rgba(255,235,59,0.17)',
        fill: 'origin',
        borderWidth: 1,
        pointRadius: 0,
        spanGaps: false,
      },
      {
        label: 'mf+',
        data: toLine(mfPos),
        type: 'line',
        borderColor: 'rgba(83,255,30,0.95)',
        backgroundColor: 'rgba(60,255,0,0.34)',
        fill: 'origin',
        borderWidth: 1,
        pointRadius: 0,
        spanGaps: false,
      },
      {
        label: 'mf-',
        data: toLine(mfNeg),
        type: 'line',
        borderColor: 'rgba(255,17,0,0.92)',
        backgroundColor: 'rgba(255,17,0,0.32)',
        fill: 'origin',
        borderWidth: 1,
        pointRadius: 0,
        spanGaps: false,
      },
      {
        label: 'rsi',
        data: toLine(rsi),
        type: 'line',
        borderColor: '#ff00ff',
        borderWidth: 1,
        pointRadius: 0,
        spanGaps: false,
      },
      {
        label: 'stoch',
        data: toLine(stoch),
        type: 'line',
        borderWidth: 1,
        pointRadius: 0,
        spanGaps: false,
        segment: {
          borderColor: (ctx: any) => {
            const idx = Number(ctx?.p0DataIndex ?? 0);
            const s = stoch[idx];
            const r = rsi[idx];
            if (s == null || r == null) return 'rgba(180,180,180,0.75)';
            return s < r ? '#00e676' : '#ff5252';
          },
        },
      },
      {
        label: 'buy',
        data: buyDots,
        type: 'scatter',
        pointRadius: 3,
        pointHoverRadius: 3,
        pointBackgroundColor: '#00e676',
        pointBorderColor: '#00e676',
        showLine: false,
      },
      {
        label: 'sell',
        data: sellDots,
        type: 'scatter',
        pointRadius: 3,
        pointHoverRadius: 3,
        pointBackgroundColor: '#ff5252',
        pointBorderColor: '#ff5252',
        showLine: false,
      },
    ],
  };

  const sideValues: McbSideValue[] = [
    { key: 'fast', value: lastDefined(fast), color: '#ff5252' },
    { key: 'overbought', value: 60, color: '#f8f8f8' },
    { key: 'stoch', value: lastDefined(stoch), color: '#2563eb' },
    { key: 'triggerPos', value: 53, color: '#f8f8f8' },
    { key: 'mf', value: lastDefined(mf), color: lastDefined(mf) >= 0 ? '#22c55e' : '#ff5252' },
    { key: 'slow', value: lastDefined(slow), color: '#b3b3b3' },
    { key: 'rsi', value: lastDefined(rsi), color: '#4ade80' },
    { key: 'zero', value: 0, color: '#f8f8f8' },
    { key: 'triggerNeg', value: -53, color: '#f8f8f8' },
    { key: 'oversold', value: -60, color: '#f8f8f8' },
  ];

  return { chartData, sideValues };
}

function seriesEma(values: Array<number | null>, length: number): Array<number | null> {
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

function seriesSma(values: Array<number | null>, length: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null);
  const queue: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) {
      queue.push(NaN);
    } else {
      queue.push(v);
      sum += v;
    }
    if (queue.length > length) {
      const removed = queue.shift() as number;
      if (Number.isFinite(removed)) sum -= removed;
    }
    const finiteCount = queue.filter((n) => Number.isFinite(n)).length;
    if (queue.length === length && finiteCount === length) {
      result[i] = sum / length;
    }
  }
  return result;
}

function seriesStoch(
  close: number[],
  high: number[],
  low: number[],
  len: number,
  smooth: number,
): Array<number | null> {
  const raw: Array<number | null> = new Array(close.length).fill(null);
  for (let i = len - 1; i < close.length; i++) {
    let peak = -Infinity;
    let trough = Infinity;
    for (let j = i - len + 1; j <= i; j++) {
      const hj = high[j];
      const lj = low[j];
      if (hj > peak) peak = hj;
      if (lj < trough) trough = lj;
    }
    const range = peak - trough;
    raw[i] = range === 0 ? 0 : ((close[i] - trough) / range) * 100;
  }
  return seriesSma(raw, smooth);
}

function lastDefined(values: Array<number | null>): number {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) return Number(v.toFixed(1));
  }
  return 0;
}
