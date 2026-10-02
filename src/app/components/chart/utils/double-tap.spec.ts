import { DOUBLE_TAP_DISTANCE_PX, DOUBLE_TAP_MS, DoubleTapDetector } from './double-tap';

describe('DoubleTapDetector', () => {
  it('detects two quick taps at the same spot', () => {
    const d = new DoubleTapDetector();
    expect(d.tap(100, 100, 1000)).toBe(false);
    expect(d.tap(105, 102, 1000 + DOUBLE_TAP_MS - 50)).toBe(true);
  });

  it('ignores taps that are too slow or too far apart', () => {
    const d = new DoubleTapDetector();
    d.tap(100, 100, 1000);
    expect(d.tap(100, 100, 1000 + DOUBLE_TAP_MS + 1)).toBe(false);
    expect(d.tap(100 + DOUBLE_TAP_DISTANCE_PX + 1, 100, 1000 + DOUBLE_TAP_MS + 50)).toBe(false);
  });

  it('consumes the pair, so a third tap starts over', () => {
    const d = new DoubleTapDetector();
    d.tap(0, 0, 0);
    expect(d.tap(0, 0, 100)).toBe(true);
    expect(d.tap(0, 0, 200)).toBe(false);
  });

  it('reset() forgets the previous tap', () => {
    const d = new DoubleTapDetector();
    d.tap(0, 0, 0);
    d.reset();
    expect(d.tap(0, 0, 100)).toBe(false);
  });
});
