import {
  applyTimeTicks,
  decimalsForStep,
  formatTimeAxisLabel,
  generateTimeTicks,
  generateValueTicks,
  pickTimeStep,
} from './axis-ticks';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('axis-ticks', () => {
  describe('time ticks', () => {
    it('places ticks on round local boundaries, not on the range start', () => {
      const min = new Date(2026, 9, 2, 13, 17).getTime();
      const max = min + 24 * HOUR;
      const ticks = generateTimeTicks(min, max, pickTimeStep(max - min, 800, 90));
      expect(ticks.length).toBeGreaterThan(3);
      for (const t of ticks) {
        const d = new Date(t);
        expect(d.getMinutes()).toBe(0);
        expect(d.getHours() % 3).toBe(0);
      }
    });

    it('keeps the same tick positions while panning', () => {
      const s = pickTimeStep(24 * HOUR, 800, 90);
      const min = new Date(2026, 9, 2, 0, 0).getTime();
      const a = generateTimeTicks(min, min + 24 * HOUR, s);
      const b = generateTimeTicks(min + 37 * 60_000, min + 24 * HOUR + 37 * 60_000, s);
      expect(b.length).toBeGreaterThan(3);
      expect(b.every((t) => a.includes(t))).toBe(true);
    });

    it('never labels finer than one candle', () => {
      const s = pickTimeStep(10 * DAY, 2000, 60, DAY);
      expect(s.approxMs).toBeGreaterThanOrEqual(DAY);
    });

    it('uses month starts for 1M candles', () => {
      const min = new Date(2024, 0, 15).getTime();
      const max = new Date(2026, 0, 15).getTime();
      const ticks = generateTimeTicks(min, max, pickTimeStep(max - min, 800, 90, 30 * DAY));
      for (const t of ticks) expect(new Date(t).getDate()).toBe(1);
    });

    it('applies ticks to a scale from its live range and width', () => {
      const min = new Date(2026, 9, 2, 0, 0).getTime();
      const scale = { min, max: min + 6 * HOUR, width: 600, height: 0, ticks: [] as Array<{ value: number }> };
      applyTimeTicks(scale, 15 * 60_000);
      expect(scale.ticks.length).toBeGreaterThan(2);
      expect(scale.ticks.length).toBeLessThanOrEqual(600 / 90 + 1);
    });
  });

  describe('time labels', () => {
    it('labels by the coarsest boundary', () => {
      expect(formatTimeAxisLabel(new Date(2026, 0, 1).getTime())).toBe('2026');
      expect(formatTimeAxisLabel(new Date(2026, 9, 1).getTime())).toBe('Oct');
      expect(formatTimeAxisLabel(new Date(2026, 9, 2).getTime())).toBe('2 Oct');
      expect(formatTimeAxisLabel(new Date(2026, 9, 2, 14, 30).getTime())).toBe('14:30');
      expect(formatTimeAxisLabel(new Date(2026, 9, 2, 14, 30).getTime(), true)).toBe('2 Oct');
    });
  });

  describe('value ticks', () => {
    it('uses nice steps strictly inside the range', () => {
      const ticks = generateValueTicks(61234.57, 62987.12, 400, 44);
      expect(ticks[0]).toBeGreaterThanOrEqual(61234.57);
      expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(62987.12);
      const step = ticks[1] - ticks[0];
      expect([100, 200, 250, 500]).toContain(step);
      for (const t of ticks) expect(t % step).toBe(0);
    });

    it('limits density to the available height', () => {
      expect(generateValueTicks(0, 1000, 200, 44).length).toBeLessThanOrEqual(5);
    });

    it('does not accumulate float error on small prices', () => {
      const ticks = generateValueTicks(0.000123, 0.000187, 400, 44);
      for (const t of ticks) expect(String(t).length).toBeLessThan(12);
    });

    it('picks enough decimals to tell ticks apart', () => {
      expect(decimalsForStep(500)).toBe(2);
      expect(decimalsForStep(0.001)).toBe(3);
      expect(decimalsForStep(0.0025)).toBe(4);
      expect(decimalsForStep(0.00000005)).toBe(8);
    });
  });
});
