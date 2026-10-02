/** Max time (ms) and distance (px) between two taps that count as a double-tap. */
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_DISTANCE_PX = 30;

/**
 * Double-tap detection for touch handlers. Needed because the charts call
 * preventDefault() on touchstart (for pan/zoom), so iOS never fires dblclick.
 */
export class DoubleTapDetector {
  private last: { x: number; y: number; time: number } | null = null;

  /** Register a tap; true when it completes a double-tap (the pair is then consumed). */
  tap(x: number, y: number, now = Date.now()): boolean {
    const prev = this.last;
    if (prev && now - prev.time <= DOUBLE_TAP_MS && Math.hypot(x - prev.x, y - prev.y) <= DOUBLE_TAP_DISTANCE_PX) {
      this.last = null;
      return true;
    }
    this.last = { x, y, time: now };
    return false;
  }

  reset(): void {
    this.last = null;
  }
}
