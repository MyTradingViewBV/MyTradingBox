import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * ChartLayoutService
 * Centralizes layout state for the chart (e.g. compact fullscreen-like mode).
 * Footer toggles compact mode; chart component consumes observable/state.
 * Usage:
 *   - Inject in footer: call toggleCompact() to switch modes.
 *   - Inject in chart: read compactMode (getter) or subscribe to compactMode$ for reactive logic.
 * Side-effects:
 *   - Chart component hides selects & settings icon when compactMode is true.
 */
@Injectable({ providedIn: 'root' })
export class ChartLayoutService {
  /** Observable for template bindings (if needed). */
  readonly compactMode$ = new BehaviorSubject<boolean>(false);

  /** Current value accessor */
  get compactMode(): boolean { return this.compactMode$.value; }

  /** Toggle compact mode */
  toggleCompact(): void { this.setCompact(!this.compactMode); }

  /** Explicit setter */
  setCompact(on: boolean): void {
    this.compactMode$.next(on);
  }
}
