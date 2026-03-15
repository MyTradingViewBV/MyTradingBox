/**
 * Drawing Tools Service
 * Manages drawing tool state, active drawings, and user interaction for
 * TradingView-style drawing tools on the chart canvas.
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type DrawingToolType =
  | 'horizontal-line'
  | 'vertical-line'
  | 'fib-retracement'
  | 'fib-extension'
  | null;

export interface DrawingPoint {
  /** Data-space x (timestamp ms) */
  x: number;
  /** Data-space y (price) */
  y: number;
}

export interface Drawing {
  id: string;
  type: DrawingToolType;
  /** Completed points defining the drawing */
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  /** Custom Fib levels (defaults applied if empty) */
  fibLevels?: number[];
}

// Default Fibonacci levels
export const DEFAULT_FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const DEFAULT_FIB_EXTENSION_LEVELS = [0, 0.618, 1, 1.618, 2, 2.618, 3.618, 4.236];

@Injectable({ providedIn: 'root' })
export class DrawingToolsService {
  /** Currently selected tool (null = no drawing mode) */
  private activeTool$ = new BehaviorSubject<DrawingToolType>(null);
  readonly activeTool = this.activeTool$.asObservable();

  /** All completed drawings */
  private drawings$ = new BehaviorSubject<Drawing[]>([]);
  readonly drawings = this.drawings$.asObservable();

  /** Points collected so far for the drawing in progress */
  private pendingPoints: DrawingPoint[] = [];

  /** Live cursor position while drawing (pixel coords for preview) */
  private cursorPos: { x: number; y: number } | null = null;

  /** Whether the toolbox sidebar is open */
  toolboxOpen = false;

  /** Id of the drawing currently being dragged to a new position */
  draggingId: string | null = null;

  /** Id of the drawing currently hovered by the mouse (used for visual highlight) */
  hoveredId: string | null = null;

  /** Magnet snap mode */
  magnetMode: 'off' | 'weak' | 'strong' = 'off';

  /** Saved magnetMode before auto-activating for a fib tool — restored on cancel */
  private _savedMagnetMode: 'off' | 'weak' | 'strong' | null = null;

  /** Snap indicator rendered by the canvas plugin (null = no snap active) */
  snapIndicator: { px: number; py: number; label: string } | null = null;

  toggleMagnet(): void {
    if (this.magnetMode === 'off') this.magnetMode = 'weak';
    else if (this.magnetMode === 'weak') this.magnetMode = 'strong';
    else this.magnetMode = 'off';
  }

  setSnapIndicator(px: number, py: number, label: string): void {
    this.snapIndicator = { px, py, label };
  }

  clearSnapIndicator(): void {
    this.snapIndicator = null;
  }

  get activeToolValue(): DrawingToolType {
    return this.activeTool$.value;
  }

  get drawingsValue(): Drawing[] {
    return this.drawings$.value;
  }

  get pendingDrawingPoints(): DrawingPoint[] {
    return this.pendingPoints;
  }

  get cursorPosition(): { x: number; y: number } | null {
    return this.cursorPos;
  }

  // --- Tool selection ---

  selectTool(tool: DrawingToolType): void {
    // Auto-activate weak magnet for fib tools if magnet is off (TradingView behaviour)
    if ((tool === 'fib-retracement' || tool === 'fib-extension') && this.magnetMode === 'off') {
      this._savedMagnetMode = this.magnetMode;
      this.magnetMode = 'weak';
    } else if (tool !== 'fib-retracement' && tool !== 'fib-extension' && this._savedMagnetMode !== null) {
      // Switching from fib to non-fib — restore
      this.magnetMode = this._savedMagnetMode;
      this._savedMagnetMode = null;
    }
    this.activeTool$.next(tool);
    this.pendingPoints = [];
    this.cursorPos = null;
  }

  cancelDrawing(): void {
    // Restore magnetMode if it was auto-enabled for a fib tool
    if (this._savedMagnetMode !== null) {
      this.magnetMode = this._savedMagnetMode;
      this._savedMagnetMode = null;
    }
    this.pendingPoints = [];
    this.cursorPos = null;
    this.activeTool$.next(null);
  }

  // --- Interaction ---

  /** Called on mouse/touch click while a tool is active. Returns true if drawing completed. */
  addPoint(dataX: number, dataY: number, chartRef: any): boolean {
    const tool = this.activeTool$.value;
    if (!tool) return false;

    this.pendingPoints.push({ x: dataX, y: dataY });

    const requiredPoints = this.requiredPointsForTool(tool);
    if (this.pendingPoints.length >= requiredPoints) {
      this.finalizeDrawing(tool);
      return true;
    }
    return false;
  }

  /** Update live cursor for preview rendering */
  updateCursor(pixelX: number, pixelY: number): void {
    this.cursorPos = { x: pixelX, y: pixelY };
  }

  clearCursor(): void {
    this.cursorPos = null;
  }

  // --- Drawing management ---

  removeDrawing(id: string): void {
    this.drawings$.next(this.drawings$.value.filter(d => d.id !== id));
  }

  clearAllDrawings(): void {
    this.drawings$.next([]);
  }

  /** Replace the full drawings list (used when loading persisted state from backend). */
  setDrawings(drawings: Drawing[]): void {
    this.drawings$.next(drawings ?? []);
  }

  /** Move a horizontal-line drawing's price to a new data-space y value */
  moveDrawingY(id: string, newY: number): void {
    const updated = this.drawings$.value.map(d => {
      if (d.id !== id) return d;
      const points = d.points.map((p, i) => i === 0 ? { ...p, y: newY } : p);
      return { ...d, points };
    });
    this.drawings$.next(updated);
  }

  /** Move a vertical-line drawing's timestamp to a new data-space x value */
  moveDrawingX(id: string, newX: number): void {
    const updated = this.drawings$.value.map(d => {
      if (d.id !== id) return d;
      const points = d.points.map((p, i) => i === 0 ? { ...p, x: newX } : p);
      return { ...d, points };
    });
    this.drawings$.next(updated);
  }

  // --- Private helpers ---

  private requiredPointsForTool(tool: DrawingToolType): number {
    switch (tool) {
      case 'horizontal-line':
      case 'vertical-line':
        return 1;
      case 'fib-retracement':
        return 2;
      case 'fib-extension':
        return 3;
      default:
        return 1;
    }
  }

  private finalizeDrawing(tool: DrawingToolType): void {
    // Restore auto-activated magnet once the fib drawing is complete
    if ((tool === 'fib-retracement' || tool === 'fib-extension') && this._savedMagnetMode !== null) {
      this.magnetMode = this._savedMagnetMode;
      this._savedMagnetMode = null;
    }
    const drawing: Drawing = {
      id: this.generateId(),
      type: tool,
      points: [...this.pendingPoints],
      color: this.defaultColor(tool),
      lineWidth: 1,
    };

    if (tool === 'fib-retracement') {
      drawing.fibLevels = [...DEFAULT_FIB_RETRACEMENT_LEVELS];
    } else if (tool === 'fib-extension') {
      drawing.fibLevels = [...DEFAULT_FIB_EXTENSION_LEVELS];
    }

    this.drawings$.next([...this.drawings$.value, drawing]);
    this.pendingPoints = [];
    this.cursorPos = null;
    // Deselect tool after placing
    this.activeTool$.next(null);
  }

  private defaultColor(tool: DrawingToolType): string {
    switch (tool) {
      case 'horizontal-line': return '#2962FF';
      case 'vertical-line': return '#2962FF';
      case 'fib-retracement': return '#F7525F';
      case 'fib-extension': return '#089981';
      default: return '#787B86';
    }
  }

  private generateId(): string {
    return 'drw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}
