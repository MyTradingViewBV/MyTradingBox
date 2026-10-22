/**
 * Drawing Tools Service
 * Manages drawing tool state, active drawings, and user interaction for
 * TradingView-style drawing tools on the chart canvas.
 */
import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export type DrawingToolType =
  | 'horizontal-line'
  | 'vertical-line'
  | 'trend-line'
  | 'arrow'
  | 'fib-retracement'
  | 'fib-extension'
  | 'box-green'
  | 'box-red'
  | 'rectangle'
  | 'long-position'
  | 'short-position'
  | 'ruler'
  | 'pen'
  | 'icon'
  | 'text'
  | 'fixed-volume-profile'
  | null;

/** Pane a drawing lives on: the price chart, or the Market Cipher B panel (oscillator values). */
export type DrawingPane = 'price' | 'mcb';

export interface DrawingPoint {
  /** Data-space x (timestamp ms) */
  x: number;
  /** Data-space y (price) */
  y: number;
}

export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';
export type DrawingTextAlign = 'left' | 'center' | 'right';
/** Text above, on or below a line; top / middle / bottom inside a rectangle. */
export type DrawingTextPosition = 'above' | 'middle' | 'below';

export interface Drawing {
  id: string;
  type: DrawingToolType;
  /** Completed points defining the drawing */
  points: DrawingPoint[];
  color: string;
  lineWidth: number;
  /** Absent = solid (fib levels: the default pattern, 0.5 dashed). */
  lineStyle?: DrawingLineStyle;
  /** Custom Fib levels (defaults applied if empty) */
  fibLevels?: number[];
  /** Colour per fib level, keyed by fibLevelKey(level); absent = the built-in level colour. */
  fibLevelColors?: Record<string, string>;
  /** Text along a line or inside a rectangle (edit toolbar). */
  text?: string;
  /** Absent = 'left'. */
  textAlign?: DrawingTextAlign;
  /** Absent = 'above'. */
  textPosition?: DrawingTextPosition;
  /** Text size in px; absent = 13 (a text drawing: TEXT_DEFAULT_SIZE). An icon's size (absent = ICON_DEFAULT_SIZE). */
  fontSize?: number;
  /** Glyph of an icon drawing (emoji or symbol, see ICON_SYMBOLS / ICON_EMOJIS). */
  icon?: string;
  /** Locked drawings can be selected but not moved or resized. */
  locked?: boolean;
  /** Pane the points belong to; absent = price chart (older saved drawings have none). */
  pane?: DrawingPane;
}

/** Key of a fib level in Drawing.fibLevelColors. */
export function fibLevelKey(level: number): string {
  return String(+level.toFixed(6));
}

/** Pane of a drawing (absent = price chart). */
export function drawingPane(d: Drawing): DrawingPane {
  return d.pane ?? 'price';
}

/** Time range picked with the fixed-volume-profile tool (ms, startTime <= endTime). */
export interface FixedRangeSelection {
  startTime: number;
  endTime: number;
}

/** Two-corner rectangle drawings (plain rectangle and the green/red zones). */
export function isBoxType(type: DrawingToolType): boolean {
  return type === 'rectangle' || type === 'box-green' || type === 'box-red';
}

/** Two-point segments: the trend line and the arrow (an arrow has its head at the second point). */
export function isSegmentType(type: DrawingToolType): boolean {
  return type === 'trend-line' || type === 'arrow';
}

/**
 * Text tool (TradingView "Text"): one click places a label whose top-left corner
 * is the point; the edit bar opens on it right away so you can type.
 */
export const TEXT_DEFAULT_SIZE = 14;
export const TEXT_LABEL_SIZES = [10, 12, 14, 16, 20, 24, 32, 40];
/** Shown (greyed) while a text drawing has no text yet. */
export const TEXT_PLACEHOLDER = 'Tekst';
/** Padding (px) around the text inside its frame. */
export const TEXT_PAD = 4;

/** Font size of a text drawing. */
export function textSize(d: Drawing): number {
  return d.fontSize ?? TEXT_DEFAULT_SIZE;
}

/** Lines of a text drawing (the placeholder when empty). */
export function textLines(d: Drawing): string[] {
  const t = d.text ?? '';
  return (t.trim() ? t : TEXT_PLACEHOLDER).split('\n');
}

export interface TextBox { w: number; h: number }

/** Frames measured by the canvas while drawing, by drawing id (hit tests use them). */
const measuredTextBoxes = new Map<string, TextBox>();

export function setMeasuredTextBox(id: string, box: TextBox): void {
  measuredTextBoxes.set(id, box);
}

/**
 * Frame (px) of a text drawing: the measured one when the canvas has drawn it,
 * otherwise an estimate (0.55em per character, 1.25em per line).
 */
export function textBoxOf(d: Drawing): TextBox {
  const measured = measuredTextBoxes.get(d.id);
  if (measured) return measured;
  const size = textSize(d);
  const lines = textLines(d);
  const chars = Math.max(...lines.map(l => l.length), 1);
  return { w: chars * size * 0.55 + TEXT_PAD * 2, h: lines.length * size * 1.25 + TEXT_PAD * 2 };
}

/**
 * Left edge (px) of a text drawing's frame given its anchor pixel: the frame
 * starts at the point ('left'), is centred on it, or ends at it ('right').
 */
export function textBoxLeft(d: Drawing, anchorX: number, box: TextBox): number {
  const align = d.textAlign ?? 'left';
  return align === 'left' ? anchorX : align === 'right' ? anchorX - box.w : anchorX - box.w / 2;
}

/** True when (cx, cy) is inside the text drawing's frame (anchor pixel ax, ay = top edge). */
export function textHit(d: Drawing, cx: number, cy: number, ax: number, ay: number, pad = 0): boolean {
  const box = textBoxOf(d);
  const left = textBoxLeft(d, ax, box);
  return cx >= left - pad && cx <= left + box.w + pad && cy >= ay - pad && cy <= ay + box.h + pad;
}

/**
 * Icon tool glyphs (TradingView "Icons"). Symbols are plain text glyphs drawn in the
 * drawing's colour; emojis keep their own colours.
 */
export const ICON_SYMBOLS = ['▲', '▼', '◆', '●', '■', '★', '✓', '✕', '➜', '⚑', '↑', '↓', '!', '?', '$', '#'];
export const ICON_EMOJIS = [
  '🚀', '🔥', '💰', '📈', '📉', '🎯', '💎', '⚠️',
  '🐂', '🐻', '👀', '✅', '❌', '🛑', '⏰', '💡',
  '🐋', '🌙', '⚡', '💀', '🙌', '🤔', '😱', '🤑',
];
export const ICON_DEFAULT = '🚀';
/** Icon size in px (Drawing.fontSize). */
export const ICON_DEFAULT_SIZE = 28;
export const ICON_SIZES = [16, 20, 28, 40, 56, 80];

/** True for a colourable symbol glyph (an emoji keeps its own colours). */
export function isIconSymbol(icon: string | undefined): boolean {
  return !!icon && ICON_SYMBOLS.includes(icon);
}

/** Icon size in px. */
export function iconSize(d: Drawing): number {
  return d.fontSize ?? ICON_DEFAULT_SIZE;
}

/** Half the side (px) of the square an icon is hit in, centred on its point. */
export function iconHitHalf(d: Drawing): number {
  return iconSize(d) * 0.6;
}

// Default Fibonacci levels
export const DEFAULT_FIB_RETRACEMENT_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 0.886, 1];
export const DEFAULT_FIB_EXTENSION_LEVELS = [0, 0.618, 0.886, 1, 1.618, 2, 2.618, 3.618, 4.236];

/** Long/short position tools (one-click placement, side-enforced TP/SL). */
export function isPositionType(type: DrawingToolType): boolean {
  return type === 'long-position' || type === 'short-position';
}

// One-click position placement (TradingView-style): the click sets the entry,
// TP/SL and the right edge start at these fractions of the visible ranges.
const POSITION_DEFAULT_STOP_FRACTION = 0.1;    // SL distance = 10% of visible price range
const POSITION_DEFAULT_TARGET_FRACTION = 0.2;  // TP distance = 20% of visible price range (R:R 2)
const POSITION_DEFAULT_WIDTH_FRACTION = 0.25;  // box width = 25% of visible time range

/** Minimum TP/SL distance from entry, relative to the price magnitude. */
export function positionMinGap(entry: number, tp: number, sl: number): number {
  const magnitude = Math.max(Math.abs(entry), Math.abs(tp), Math.abs(sl));
  return magnitude > 0 ? magnitude * 1e-4 : 1e-8;
}

@Injectable({ providedIn: 'root' })
export class DrawingToolsService {
  /** Currently selected tool (null = no drawing mode) */
  private activeTool$ = new BehaviorSubject<DrawingToolType>(null);
  readonly activeTool = this.activeTool$.asObservable();

  /** All completed drawings */
  private drawings$ = new BehaviorSubject<Drawing[]>([]);
  readonly drawings = this.drawings$.asObservable();

  /**
   * Completed fixed-volume-profile ranges. These are saved through the
   * FixedVolumeProfiles API by the chart, never as a Drawing (ChartState).
   */
  private fixedRangeSelected$ = new Subject<FixedRangeSelection>();
  readonly fixedRangeSelected = this.fixedRangeSelected$.asObservable();

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

  private selectedDrawingIdValue: string | null = null;
  private drawingSelected$ = new Subject<string>();
  /** Emits (synchronously) whenever a drawing becomes selected; other selectable layers deselect on it. */
  readonly drawingSelected = this.drawingSelected$.asObservable();

  /** Id of the currently selected drawing (shows edit panel) */
  get selectedDrawingId(): string | null {
    return this.selectedDrawingIdValue;
  }

  set selectedDrawingId(id: string | null) {
    const previous = this.selectedDrawingIdValue;
    this.selectedDrawingIdValue = id;
    if (previous && previous !== id) this.dropEmptyText(previous);
    if (id != null) this.drawingSelected$.next(id);
  }

  /**
   * Id of the text drawing whose text editor should open (set when the text tool
   * places a label; the edit bar reads and clears it).
   */
  textEditRequestId: string | null = null;

  /** Claim the pending text-editor request for `id` (true once). */
  takeTextEditRequest(id: string): boolean {
    if (this.textEditRequestId !== id) return false;
    this.textEditRequestId = null;
    return true;
  }

  /** A text label left without text is dropped when it loses selection (TradingView does the same). */
  private dropEmptyText(id: string): void {
    const d = this.drawings$.value.find(x => x.id === id);
    if (d?.type === 'text' && !(d.text ?? '').trim()) this.removeDrawing(id);
  }

  /** Id of the drawing currently being dragged to a new position */
  draggingId: string | null = null;

  /** Id of the drawing currently hovered by the mouse (used for visual highlight) */
  hoveredId: string | null = null;

  /** Lock all drawings (TradingView "Lock all drawings"): none can be moved while on. */
  allLocked = false;

  /** Glyph the icon tool places (last one picked in the icon picker). */
  selectedIcon = ICON_DEFAULT;

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

  /**
   * Drawings on one pane (hit tests and rendering of that pane). A vertical line
   * marks a time, not a value: it spans every pane, wherever it was drawn (TradingView).
   */
  paneDrawings(pane: DrawingPane): Drawing[] {
    return this.drawings$.value.filter(d => d.type === 'vertical-line' || drawingPane(d) === pane);
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

  /** Pick a glyph in the icon picker and arm the icon tool (one click places it). */
  selectIcon(icon: string): void {
    this.selectedIcon = icon;
    this.selectTool('icon');
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
    const tool = this.activeTool$.value;
    if (!tool) return false;

    // A drawing's points share one pane's value space: a click on the other pane starts over there.
    if (pane !== this.pendingPaneValue) this.pendingPoints = [];
    this.pendingPaneValue = pane;

    // Long/short position: one click places the whole tool (TradingView behaviour).
    // The click is the entry; TP, SL and the right edge start at defaults derived
    // from the visible ranges and are adjusted afterwards by dragging the handles.
    if (isPositionType(tool)) {
      this.pendingPoints = this.buildPositionPoints(tool, dataX, dataY, chartRef);
      this.finalizeDrawing(tool);
      return true;
    }

    // A zero-width time range is no profile: wait for a second click at another time.
    if (tool === 'fixed-volume-profile' && this.pendingPoints.length === 1 && this.pendingPoints[0].x === dataX) {
      return false;
    }

    this.pendingPoints.push({ x: dataX, y: dataY });

    const requiredPoints = this.requiredPointsForTool(tool);
    if (this.pendingPoints.length >= requiredPoints) {
      if (tool === 'fixed-volume-profile') {
        this.finalizeFixedRange();
        return true;
      }
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

  /** Drop the stroke in progress without saving it (a pinch took over the press); the pen stays active. */
  cancelPenStroke(): void {
    if (!this.isPenStroking) return;
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

  /** Change style fields of a drawing (edit toolbar: colour, width, text, fib levels...). */
  updateDrawing(id: string, patch: Partial<Omit<Drawing, 'id' | 'type' | 'points'>>): void {
    this.drawings$.next(this.drawings$.value.map(d => d.id === id ? { ...d, ...patch } : d));
  }

  /** Switch a position drawing between long and short (the editor's flip button). */
  setDrawingType(id: string, type: DrawingToolType): void {
    this.drawings$.next(this.drawings$.value.map(d => d.id === id ? { ...d, type } : d));
  }

  // --- Private helpers ---

  /**
   * Entry/TP/SL/right-edge for a one-click position placement. The side is fixed
   * by the tool: a long always starts with TP above entry and SL below (a short
   * mirrored). Falls back to percent-of-price defaults when the chart's visible
   * ranges are not available.
   */
  private buildPositionPoints(tool: DrawingToolType, entryX: number, entryY: number, chartRef: unknown): DrawingPoint[] {
    const scales = (chartRef as { scales?: Record<string, { min?: number; max?: number }> } | null)?.scales;
    const xScale = scales?.['x'];
    const yScale = scales?.['y'];
    const ySpan = yScale != null && Number.isFinite(yScale.min) && Number.isFinite(yScale.max)
      ? (yScale.max as number) - (yScale.min as number) : 0;
    const xSpan = xScale != null && Number.isFinite(xScale.min) && Number.isFinite(xScale.max)
      ? (xScale.max as number) - (xScale.min as number) : 0;

    const slDist = ySpan > 0 ? ySpan * POSITION_DEFAULT_STOP_FRACTION : (Math.abs(entryY) * 0.01 || 1);
    const tpDist = ySpan > 0 ? ySpan * POSITION_DEFAULT_TARGET_FRACTION : (Math.abs(entryY) * 0.02 || 2);
    const width = xSpan > 0 ? xSpan * POSITION_DEFAULT_WIDTH_FRACTION : 3_600_000;

    const isLong = tool === 'long-position';
    return [
      { x: entryX, y: entryY },
      { x: entryX + width, y: isLong ? entryY + tpDist : entryY - tpDist },
      { x: entryX + width, y: isLong ? entryY - slDist : entryY + slDist },
    ];
  }

  private requiredPointsForTool(tool: DrawingToolType): number {
    switch (tool) {
      case 'horizontal-line':
      case 'vertical-line':
        return 1;
      case 'trend-line':
      case 'arrow':
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
      case 'icon':
      case 'text':
        return 1;
      case 'ruler':
      case 'fixed-volume-profile':
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
    } else if (tool === 'icon') {
      drawing.icon = this.selectedIcon;
      drawing.fontSize = ICON_DEFAULT_SIZE;
    } else if (tool === 'text') {
      drawing.text = '';
      drawing.fontSize = TEXT_DEFAULT_SIZE;
    }

    this.drawings$.next([...this.drawings$.value, drawing]);
    this.pendingPoints = [];
    this.cursorPos = null;
    // Deselect tool after placing
    this.activeTool$.next(null);

    // A fresh text label is selected with its editor open, so typing can start at once.
    if (tool === 'text') {
      this.textEditRequestId = drawing.id;
      this.selectedDrawingId = drawing.id;
    }
  }

  /** Only the x values of the two clicks matter: the price range comes from the candles. */
  private finalizeFixedRange(): void {
    const [a, b] = this.pendingPoints;
    this.pendingPoints = [];
    this.cursorPos = null;
    this.activeTool$.next(null);
    this.fixedRangeSelected$.next({ startTime: Math.min(a.x, b.x), endTime: Math.max(a.x, b.x) });
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
      case 'arrow': return '#2962FF';
      case 'fib-retracement': return '#F7525F';
      case 'fib-extension': return '#089981';
      case 'box-green': return '#089981';
      case 'box-red': return '#F7525F';
      case 'rectangle': return '#9C27B0';
      case 'long-position': return '#2962FF';
      case 'short-position': return '#2962FF';
      case 'ruler': return '#1E90FF';
      case 'pen': return '#FF9800';
      case 'icon': return '#FF9800';
      case 'text': return '#D1D4DC';
      default: return '#787B86';
    }
  }

  private generateId(): string {
    return 'drw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
}
