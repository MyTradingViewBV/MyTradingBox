import { describe, expect, it } from 'vitest';
import {
  FlowCandle,
  computeFlowForecast,
  projectFlow,
  selectVisibleBoxes,
  signalScore,
} from './flow-forecast';

/** Candles that move `step` per bar, starting at `start`. */
function trend(start: number, step: number, count = 40): FlowCandle[] {
  return Array.from({ length: count }, (_, i) => {
    const open = start + step * i;
    const close = open + step;
    return {
      Open: open,
      Close: close,
      High: Math.max(open, close) + Math.abs(step) * 0.2,
      Low: Math.min(open, close) - Math.abs(step) * 0.2,
    };
  });
}

describe('flow forecast', () => {
  it('reads aligned rising timeframes as trend up', () => {
    const f = computeFlowForecast({
      candles: { '12m': trend(100, 0.2), '1h': trend(100, 0.5), '4h': trend(90, 1) },
    })!;
    expect(f.state).toBe('trend-up');
    expect(f.score).toBeGreaterThan(0.5);
    expect(f.confidence).toBeGreaterThan(0.8);
    expect(f.timeframes.find((t) => t.timeframe === '1h')!.lastCandles).toEqual([1, 1, 1]);
  });

  it('flags collapse risk when lower frames turn down against a rising 4h', () => {
    const f = computeFlowForecast({
      candles: { '12m': trend(120, -0.4), '1h': trend(120, -0.6), '4h': trend(90, 1) },
      signals: [
        { Timeframe: '1d', SignalType: 'Gold Bull', IsBullish: true, IsBearish: false, BarsAgo: 1 },
      ],
    })!;
    expect(f.higherBias).toBeGreaterThan(0);
    expect(f.lowerMomentum).toBeLessThan(0);
    expect(f.state).toBe('collapse-risk');
  });

  it('weights capital-flow signals by tier and fades them by age', () => {
    const gold = signalScore(
      [{ Timeframe: '4h', SignalType: 'Gold Bear', IsBullish: false, IsBearish: true, BarsAgo: 0 }],
      '4h',
    );
    const oldBronze = signalScore(
      [{ Timeframe: '4h', SignalType: 'Bronze Bull', IsBullish: true, IsBearish: false, BarsAgo: 4 }],
      '4h',
    );
    expect(gold).toBeCloseTo(-0.8);
    expect(oldBronze).toBeGreaterThan(0);
    expect(oldBronze).toBeLessThan(0.2);
    expect(signalScore([], '4h')).toBe(0);
  });

  it('stops the projected path at a resistance box when the flow is weak', () => {
    const f = computeFlowForecast({ candles: { '1h': trend(100, 0.5) } })!;
    const weak = { ...f, score: 0.3, state: 'trend-up' as const, atr1h: 2 };
    const box = { ZoneMin: 120.5, ZoneMax: 122, PositionType: 'short' };
    const p = projectFlow(120, weak, [box])!;
    expect(p.blockedBy?.outcome).toBe('reject');
    expect(Math.max(...p.points.map((pt) => pt.price))).toBeLessThanOrEqual(120.5);
    expect(p.target).toBeLessThan(120.5);
  });

  it('lets a strong aligned flow break into the box, capped at its top', () => {
    const f = computeFlowForecast({ candles: { '1h': trend(100, 0.5) } })!;
    const strong = { ...f, score: 1, state: 'trend-up' as const, atr1h: 5 };
    const box = { ZoneMin: 121, ZoneMax: 123, PositionType: 'short' };
    const p = projectFlow(120, strong, [box])!;
    expect(p.blockedBy?.outcome).toBe('break');
    expect(p.target).toBeLessThanOrEqual(123);
    expect(p.target).toBeGreaterThan(121);
  });

  it('keeps the old two-nearest-boxes-per-side selection', () => {
    const boxes = [10, 20, 30, 50, 60, 70].map((v) => ({ ZoneMin: v, ZoneMax: v + 5 }));
    const { below, above } = selectVisibleBoxes(boxes, 45);
    expect(below.map((b) => b.ZoneMin)).toEqual([30, 20]);
    expect(above.map((b) => b.ZoneMin)).toEqual([50, 60]);
  });
});
