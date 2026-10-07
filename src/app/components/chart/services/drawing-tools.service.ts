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
  | 'trend-line'
  | 'fib-retracement'
  | 'fib-extension'
  | 'box-green'
  | 'box-red'
  | 'rectangle'
  | 'long-position'
  | 'short-position'
  | 'ruler'
  | 'pen'
  | null;

/** Pane a drawing lives on: the price chart, or the Market Cipher B panel (oscillator values). */
export type DrawingPane = 'price' | 'mcb';

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
  /** Locked drawings can be selected but not moved or resized. */
  locked?: boolean;
  /** Pane the points belong to; absent = price chart (older saved drawings have none). */
  pane?: DrawingPane;
}

/** Pane of a drawing (absent = price chart). */
export function drawingPane(d: Drawing): DrawingPane {
  return d.pane ?? 'price';
}

/** Two-corner rectangle drawings (plain rectangle and the green/red zones). */
export function isBoxType(type: DrawingToolType): boolean {
  return type === 'rectangle' || type === 'box-green' || type === 'box-red';
}

// Default Fibonacci levels
export const DEFAULT_FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 0.886, 1];
export const DEFAULT_FIB_EXTENSION_LEVELS = [0, 0.618, 0.886, 1, 1.618, 2, 2.618, 3.618, 4.236];

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

  /** Pane the pending points were placed on (a click on the other pane starts over there). */
  private pendingPaneValue: DrawingPane = 'price';

  /** Live cursor position while drawing (pixel coords for preview) */
  private cursorPos: { x: number; y: number } | null = null;

  /** Pane whose canvas cursorPos is in. */
  private cursorPaneValue: DrawingPane = 'price';

  /** Whether the toolbox sidebar is open */
  toolboxOpen = false;

  /** Id of the currently selected drawing (shows edit panel) */
  selectedDrawingId: string | null = null;

  /** Id of the drawing currently being dragged to a new position */
  draggingId: string | null = null;

  /** Id of the drawing currently hovered by the mouse (used for visual highlight) */
  hoveredId: string | null = null;

  /** Lock all drawings (TradingView "Lock all drawings"): none can be moved while on. */
  allLocked = false;

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

  /** Drawings on one pane (hit tests and rendering of that pane). */
  paneDrawings(pane: DrawingPane): Drawing[] {
    return this.drawings$.value.filter(d => drawingPane(d) === pane);
  }

  get pendingPane(): DrawingPane {
    return this.pendingPaneValue;
  }

  get cursorPane(): DrawingPane {
    return this.cursorPaneValue;
  }

  get pendingDrawingPoints(): DrawingPoint[] {
    return this.pendingPoints;
  }

  get cursorPosition(): { x: number; y: number } | null {
    return this.cursorPos;
  }

  // --- Tool selection ---

  selectTool(tool: DrawingToolType): void {
    // Auto-activate weak magnet only for Fib tools if magnet is off.
    // Ruler should stay literal to touch/mouse placement unless user manually enables magnet.
    const autoMagnetTool =
      tool === 'fib-retracement' ||
      tool === 'fib-extension';

    if (autoMagnetTool && this.magnetMode === 'off') {
      this._savedMagnetMode = this.magnetMode;
      this.magnetMode = 'weak';
    } else if (!autoMagnetTool && this._savedMagnetMode !== null) {
      // Switching from auto-magnet tool to another tool — restore
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
  addPoint(dataX: number, dataY: number, chartRef: unknown, pane: DrawingPane = 'price'): boolean {
    void chartRef;
    const tool = this.activeTool$.value;
    if (!tool) return false;

    // A drawing's points share one pane's value space: a click on the other pane starts over there.
    if (pane !== this.pendingPaneValue) this.pendingPoints = [];
    this.pendingPaneValue = pane;
    this.pendingPoints.push({ x: dataX, y: dataY });

    const requiredPoints = this.requiredPointsForTool(tool);
    if (this.pendingPoints.length >= requiredPoints) {
      this.finalizeDrawing(tool);
      return true;
    }
    return false;
  }

  // --- Pen (freehand) ---

  /** True while a pen stroke is being drawn (pointer held down). */
  get isPenStroking(): boolean {
    return this.activeTool$.value === 'pen' && this.pendingPoints.length > 0;
  }

  startPenStroke(dataX: number, dataY: number, pane: DrawingPane = 'price'): void {
    if (this.activeTool$.value !== 'pen') return;
    this.pendingPaneValue = pane;
    this.pendingPoints = [{ x: dataX, y: dataY }];
  }

  extendPenStroke(dataX: number, dataY: number): void {
    if (!this.isPenStroking) return;
    this.pendingPoints.push({ x: dataX, y: dataY });
  }

  /** Commit the stroke; the pen stays active so several strokes can be drawn in a row. */
  finishPenStroke(): void {
    if (!this.isPenStroking) return;
    if (this.pendingPoints.length >= 2) {
      const drawing: Drawing = {
        id: this.generateId(),
        type: 'pen',
        points: [...this.pendingPoints],
        color: this.defaultColor('pen'),
        lineWidth: 2,
        ...this.paneField(),
      };
      this.drawings$.next([...this.drawings$.value, drawing]);
    }
    this.pendingPoints = [];
  }

  /** Update live cursor for preview rendering */
  updateCursor(pixelX: number, pixelY: number, pane: DrawingPane = 'price'): void {
    this.cursorPos = { x: pixelX, y: pixelY };
    this.cursorPaneValue = pane;
  }

  clearCursor(): void {
    this.cursorPos = null;
  }

  // --- Drawing management ---

  /** True when the drawing may not be moved or resized (its own lock or "lock all"). */
  isLocked(d: Drawing): boolean {
    return this.allLocked || !!d.locked;
  }

  toggleLocked(id: string): void {
    this.drawings$.next(this.drawings$.value.map(d => d.id === id ? { ...d, locked: !d.locked } : d));
  }

  toggleAllLocked(): void {
    this.allLocked = !this.allLocked;
  }

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

  /**
   * Shift all points of a drawing by a data-space delta.
   * `originPoints` is the snapshot taken at drag-start (prevents drift accumulation).
   */
  moveDrawingDelta(id: string, dx: number, dy: number, originPoints: DrawingPoint[]): void {
    const updated = this.drawings$.value.map(d => {
      if (d.id !== id) return d;
      const points = originPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
      return { ...d, points };
    });
    this.drawings$.next(updated);
  }

  /** Replace all points for a drawing (used when editing via price inputs) */
  updateDrawingPoints(id: string, points: DrawingPoint[]): void {
    const updated = this.drawings$.value.map(d =>
      d.id === id ? { ...d, points } : d
    );
    this.drawings$.next(updated);
  }

  // --- Private helpers ---

  private requiredPointsForTool(tool: DrawingToolType): number {
    switch (tool) {
      case 'horizontal-line':
      case 'vertical-line':
        return 1;
      case 'trend-line':
        return 2;
      case 'fib-retracement':
        return 2;
      case 'fib-extension':
        return 3;
      case 'box-green':
      case 'box-red':
      case 'rectangle':
        return 2;
      case 'long-position':
      case 'short-position':
        return 3;
      case 'ruler':
        return 2;
      case 'pen':
        return Number.POSITIVE_INFINITY;
      default:
        return 1;
    }
  }

  private finalizeDrawing(tool: DrawingToolType): void {
    // Restore auto-activated magnet once the drawing is complete
    if (
      (tool === 'fib-retracement' || tool === 'fib-extension') &&
      this._savedMagnetMode !== null
    ) {
      this.magnetMode = this._savedMagnetMode;
      this._savedMagnetMode = null;
    }
    const drawing: Drawing = {
      id: this.generateId(),
      type: tool,
      points: [...this.pendingPoints],
      color: this.defaultColor(tool),
      lineWidth: 1,
      ...this.paneField(),
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

  /** `pane` only for non-price drawings, so price drawings save exactly as before. */
  private paneField(): Pick<Drawing, 'pane'> {
    return this.pendingPaneValue === 'price' ? {} : { pane: this.pendingPaneValue };
  }

  private defaultColor(tool: DrawingToolType): string {
    switch (tool) {
      case 'horizontal-line': return '#2962FF';
      case 'vertical-line': return '#2962FF';
      case 'trend-line': return '#2962FF';
      case 'fib-retracement': return '#F7525F';
      case 'fib-extension': return '#089981';
      case 'box-green': return '#089981';
      case 'box-red': return '#F7525F';
      case 'rectangle': return '#9C27B0';
      case 'long-position': return '#2962FF';
      case 'ruler': return '#1E90FF';
      case 'pen': return '#FF9800';
      default: return '#787B86';
    }
  }

  private generateId(): string {
    return 'drw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}
