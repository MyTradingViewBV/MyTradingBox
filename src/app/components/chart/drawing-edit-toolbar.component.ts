import { AfterViewInit, Component, ChangeDetectionStrategy, Directive, ElementRef, EventEmitter, HostListener, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  DEFAULT_FIB_EXTENSION_LEVELS,
  DEFAULT_FIB_RETRACEMENT_LEVELS,
  Drawing,
  DrawingLineStyle,
  DrawingTextAlign,
  DrawingTextPosition,
  DrawingToolsService,
  DrawingToolType,
  fibLevelKey,
  ICON_EMOJIS,
  ICON_SIZES,
  ICON_SYMBOLS,
  iconSize,
  isIconSymbol,
  TEXT_DEFAULT_SIZE,
  TEXT_LABEL_SIZES,
} from './services/drawing-tools.service';
import { fibLevelColor } from './services/drawing-tools.plugin';

type EditPopover = 'color' | 'width' | 'style' | 'text' | 'fib' | 'icon' | 'size' | null;

const LINE_TYPES: DrawingToolType[] = ['horizontal-line', 'vertical-line', 'trend-line', 'arrow', 'pen', 'rectangle'];
const FIB_TYPES: DrawingToolType[] = ['fib-retracement', 'fib-extension'];

/** Swatches of the colour popover (TradingView's first palette row plus white/grey). */
export const DRAWING_COLORS = [
  '#F23645', '#FF9800', '#FFEB3B', '#4CAF50', '#089981', '#00BCD4',
  '#2962FF', '#673AB7', '#9C27B0', '#E91E63', '#FFFFFF', '#787B86',
];

/** Focuses the text field as soon as the text popover opens, caret at the end. */
@Directive({ selector: 'textarea[appAutofocus]', standalone: true })
export class AutofocusDirective implements AfterViewInit {
  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);

  ngAfterViewInit(): void {
    const ta = this.el.nativeElement;
    ta.focus();
    const end = ta.value.length;
    try {
      ta.setSelectionRange(end, end);
    } catch {
      // not every field supports a selection range
    }
  }
}

/**
 * Floating edit bar of the selected drawing (TradingView style): colour, line
 * width and style, text with its alignment, fib levels, lock and delete. Shown
 * over the chart while a drawing is selected; the grip drags it out of the way.
 */
@Component({
  selector: 'app-drawing-edit-toolbar',
  standalone: true,
  imports: [FormsModule, AutofocusDirective],
  host: {
    '[style.transform]': '"translate(calc(-50% + " + offsetX + "px), " + offsetY + "px)"',
  },
  template: `
    @if (drawing; as d) {
      <div class="bar" data-testid="drawing-edit-toolbar">
        <span class="grip" (pointerdown)="startDrag($event)" title="Verplaatsen">
          <svg width="10" height="18" viewBox="0 0 10 18" fill="currentColor">
            <circle cx="2" cy="3" r="1.5" /><circle cx="8" cy="3" r="1.5" />
            <circle cx="2" cy="9" r="1.5" /><circle cx="8" cy="9" r="1.5" />
            <circle cx="2" cy="15" r="1.5" /><circle cx="8" cy="15" r="1.5" />
          </svg>
        </span>

        @if (isIcon(d)) {
          <button type="button" class="btn icon-glyph" data-testid="edit-icon" [class.open]="popover === 'icon'"
            (click)="toggle('icon')" title="Icoon wijzigen" [style.color]="d.color">{{ d.icon }}</button>
          <button type="button" class="btn label" data-testid="edit-size" [class.open]="popover === 'size'"
            (click)="toggle('size')" title="Grootte">{{ iconSizeOf(d) }}px</button>
        }

        @if (hasColor(d)) {
          <button type="button" class="btn" data-testid="edit-color" [class.open]="popover === 'color'"
            (click)="toggle('color')" title="Kleur">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            <span class="underline" [style.background]="d.color"></span>
          </button>
        }

        @if (hasText(d)) {
          <button type="button" class="btn" data-testid="edit-text" [class.open]="popover === 'text'"
            (click)="toggle('text')" title="Tekst">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <path d="M5 5h14" /><path d="M12 5v15" /><path d="M9 20h6" />
            </svg>
            @if (d.text) { <span class="underline" [style.background]="d.color"></span> }
          </button>
        }

        @if (hasLine(d)) {
          <button type="button" class="btn label" data-testid="edit-width" [class.open]="popover === 'width'"
            (click)="toggle('width')" title="Lijndikte">{{ d.lineWidth }}px</button>
          <button type="button" class="btn" data-testid="edit-style" [class.open]="popover === 'style'"
            (click)="toggle('style')" title="Lijnstijl">
            <svg width="24" height="20" viewBox="0 0 24 20" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="2" y1="10" x2="22" y2="10" [attr.stroke-dasharray]="dashAttr(d.lineStyle)" />
            </svg>
          </button>
        }

        @if (isFib(d)) {
          <button type="button" class="btn" data-testid="edit-fib" [class.open]="popover === 'fib'"
            (click)="toggle('fib')" title="Fib levels">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <line x1="3" y1="5" x2="21" y2="5" /><line x1="3" y1="10" x2="21" y2="10" />
              <line x1="3" y1="14" x2="21" y2="14" /><line x1="3" y1="19" x2="21" y2="19" />
            </svg>
          </button>
        }

        <button type="button" class="btn" data-testid="edit-lock" [class.active]="d.locked"
          (click)="toggleLock(d)" [title]="d.locked ? 'Ontgrendelen' : 'Vergrendelen'">
          @if (d.locked) {
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          } @else {
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.5-2" />
            </svg>
          }
        </button>

        <button type="button" class="btn danger" data-testid="edit-delete" (click)="remove(d)" title="Verwijderen (Delete)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>

      @switch (popover) {
        @case ('color') {
          <div class="pop" data-testid="edit-color-pop">
            <div class="swatches">
              @for (c of colors; track c) {
                <button type="button" class="swatch" [style.background]="c" [class.current]="sameColor(c, d.color)"
                  (click)="set(d, { color: c })" [attr.aria-label]="c"></button>
              }
              <label class="swatch custom" title="Eigen kleur">
                +
                <input type="color" [ngModel]="toHex(d.color)" (ngModelChange)="set(d, { color: $event })" />
              </label>
            </div>
          </div>
        }
        @case ('width') {
          <div class="pop row">
            @for (w of widths; track w) {
              <button type="button" class="opt" [class.current]="d.lineWidth === w" (click)="set(d, { lineWidth: w }, true)">
                <span class="width-sample" [style.height.px]="w"></span>{{ w }}px
              </button>
            }
          </div>
        }
        @case ('style') {
          <div class="pop row">
            @for (s of lineStyles; track s.value) {
              <button type="button" class="opt" [class.current]="(d.lineStyle ?? 'solid') === s.value"
                (click)="set(d, { lineStyle: s.value }, true)" [title]="s.label">
                <svg width="36" height="12" viewBox="0 0 36 12" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="2" y1="6" x2="34" y2="6" [attr.stroke-dasharray]="dashAttr(s.value)" />
                </svg>
              </button>
            }
          </div>
        }
        @case ('text') {
          <div class="pop text-pop">
            <textarea data-testid="edit-text-input" rows="2" placeholder="Tekst toevoegen" appAutofocus
              [ngModel]="d.text ?? ''" (ngModelChange)="set(d, { text: $event })"></textarea>
            <div class="row">
              @for (a of textAligns; track a.value) {
                <button type="button" class="opt icon" [class.current]="(d.textAlign ?? 'left') === a.value"
                  (click)="set(d, { textAlign: a.value })" [title]="a.label">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line [attr.x1]="a.short[0]" y1="12" [attr.x2]="a.short[1]" y2="12" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                </button>
              }
              @if (!isTextLabel(d)) {
                <span class="sep"></span>
                @for (p of textPositions(d); track p.value) {
                  <button type="button" class="opt" [class.current]="(d.textPosition ?? 'above') === p.value"
                    (click)="set(d, { textPosition: p.value })">{{ p.label }}</button>
                }
              }
            </div>
            <div class="row">
              <span class="caption">Grootte</span>
              @for (f of fontSizesOf(d); track f) {
                <button type="button" class="opt" [class.current]="fontSizeOf(d) === f" (click)="set(d, { fontSize: f })">{{ f }}</button>
              }
            </div>
          </div>
        }
        @case ('icon') {
          <div class="pop" data-testid="edit-icon-pop">
            <div class="icon-grid">
              @for (g of iconGlyphs; track g) {
                <button type="button" class="icon-opt" [class.current]="d.icon === g"
                  [style.color]="isSymbol(g) ? d.color : null" (click)="set(d, { icon: g }, true)">{{ g }}</button>
              }
            </div>
          </div>
        }
        @case ('size') {
          <div class="pop row">
            @for (z of iconSizes; track z) {
              <button type="button" class="opt" [class.current]="iconSizeOf(d) === z" (click)="set(d, { fontSize: z }, true)">{{ z }}px</button>
            }
          </div>
        }
        @case ('fib') {
          <div class="pop fib-pop" data-testid="edit-fib-pop">
            @for (level of fibLevels(d); track level) {
              <div class="fib-row">
                <label class="swatch small" [style.background]="levelColor(d, level)">
                  <input type="color" [ngModel]="toHex(levelColor(d, level))" (ngModelChange)="setLevelColor(d, level, $event)" />
                </label>
                <span class="fib-value">{{ level }}</span>
                <button type="button" class="fib-remove" (click)="removeLevel(d, level)" title="Level verwijderen">✕</button>
              </div>
            }
            <div class="fib-add">
              <input type="number" step="0.001" placeholder="bv. 0.705" data-testid="fib-new-level"
                [(ngModel)]="newLevel" (keydown.enter)="addLevel(d)" />
              <button type="button" class="opt" (click)="addLevel(d)">Toevoegen</button>
            </div>
            <button type="button" class="opt reset" (click)="resetLevels(d)">Standaard levels</button>
          </div>
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [
    `
      :host {
        position: absolute;
        top: 8px;
        left: 50%;
        z-index: 30;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        max-width: calc(100% - 16px);
        color: #d1d5db;
        font-size: 13px;
        touch-action: none;
      }
      .bar, .pop {
        background: #1e222d;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: 2px;
        padding: 4px 6px;
        max-width: 100%;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .grip {
        display: flex;
        align-items: center;
        padding: 0 6px 0 2px;
        color: #6b7280;
        cursor: grab;
      }
      .btn {
        position: relative;
        flex-shrink: 0;
        min-width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .btn:hover, .btn.open { background: rgba(255, 255, 255, 0.08); color: #fff; }
      .btn.active { color: #fbbf24; }
      .btn.danger:hover { color: #f87171; }
      .btn.label { font-size: 14px; }
      .btn.icon-glyph { font-size: 20px; font-weight: 700; }
      .icon-grid { display: grid; grid-template-columns: repeat(8, 34px); gap: 2px; }
      .icon-opt {
        width: 34px;
        height: 34px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: #d1d5db;
        font-size: 20px;
        font-weight: 700;
        cursor: pointer;
        padding: 0;
      }
      .icon-opt:hover { background: rgba(255, 255, 255, 0.08); }
      .icon-opt.current { border-color: rgba(41, 98, 255, 0.6); background: rgba(41, 98, 255, 0.18); }
      .underline {
        position: absolute;
        left: 9px;
        right: 9px;
        bottom: 4px;
        height: 3px;
        border-radius: 2px;
      }
      .pop { padding: 8px; max-width: 100%; }
      .row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .opt {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 8px;
        border: 1px solid transparent;
        border-radius: 6px;
        background: transparent;
        color: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      .opt.icon { padding: 0 5px; }
      .opt:hover { background: rgba(255, 255, 255, 0.08); }
      .opt.current { border-color: rgba(41, 98, 255, 0.6); background: rgba(41, 98, 255, 0.18); color: #fff; }
      .width-sample { display: inline-block; width: 18px; background: currentColor; border-radius: 2px; }
      .swatches { display: grid; grid-template-columns: repeat(7, 28px); gap: 6px; }
      .swatch {
        position: relative;
        width: 28px;
        height: 28px;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        cursor: pointer;
        padding: 0;
      }
      .swatch.current { outline: 2px solid #2962ff; outline-offset: 1px; }
      .swatch.custom {
        display: flex;
        align-items: center;
        justify-content: center;
        background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
        color: #fff;
        font-weight: 700;
        text-shadow: 0 0 2px #000;
      }
      .swatch.small { width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0; }
      .swatch input[type='color'] { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
      .text-pop { display: flex; flex-direction: column; gap: 6px; width: 340px; }
      textarea, .fib-add input {
        width: 100%;
        box-sizing: border-box;
        background: #131722;
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        padding: 6px 8px;
        font: inherit;
        font-size: 16px;
        resize: vertical;
      }
      .sep { width: 1px; height: 20px; background: rgba(255, 255, 255, 0.12); margin: 0 4px; }
      .caption { font-size: 11px; color: #6b7280; margin-right: 4px; }
      .fib-pop { display: flex; flex-direction: column; gap: 2px; width: 220px; max-height: 50vh; overflow-y: auto; }
      .fib-row { display: flex; align-items: center; gap: 8px; padding: 2px 4px; }
      .fib-value { flex: 1; font-variant-numeric: tabular-nums; }
      .fib-remove { border: none; background: transparent; color: #f87171; cursor: pointer; padding: 4px 6px; border-radius: 4px; }
      .fib-remove:hover { background: rgba(248, 113, 113, 0.12); }
      .fib-add { display: flex; gap: 4px; margin-top: 6px; }
      .fib-add input { font-size: 14px; }
      .reset { justify-content: center; margin-top: 4px; color: #9ca3af; }
    `,
  ],
})
export class DrawingEditToolbarComponent {
  readonly service = inject(DrawingToolsService);

  /** Emits the id of a drawing deleted from the toolbar. */
  @Output() deleted = new EventEmitter<string>();

  readonly colors = DRAWING_COLORS;
  readonly widths = [1, 2, 3, 4];
  readonly lineStyles: Array<{ value: DrawingLineStyle; label: string }> = [
    { value: 'solid', label: 'Doorgetrokken' },
    { value: 'dashed', label: 'Gestreept' },
    { value: 'dotted', label: 'Gestippeld' },
  ];
  readonly textAligns: Array<{ value: DrawingTextAlign; label: string; short: [number, number] }> = [
    { value: 'left', label: 'Links', short: [3, 14] },
    { value: 'center', label: 'Midden', short: [7, 17] },
    { value: 'right', label: 'Rechts', short: [10, 21] },
  ];
  readonly fontSizes = [10, 12, 13, 16, 20, 24];
  readonly iconGlyphs = [...ICON_SYMBOLS, ...ICON_EMOJIS];
  readonly iconSizes = ICON_SIZES;

  popover: EditPopover = null;
  newLevel: number | null = null;
  offsetX = 0;
  offsetY = 0;
  private lastId: string | null = null;

  /**
   * The selected drawing; a newly selected drawing closes the open popover,
   * except a text label the text tool just placed: its text field opens at once.
   */
  get drawing(): Drawing | null {
    const id = this.service.selectedDrawingId;
    const d = id ? this.service.drawingsValue.find(x => x.id === id) ?? null : null;
    if ((d?.id ?? null) !== this.lastId) {
      this.lastId = d?.id ?? null;
      this.popover = d && this.service.takeTextEditRequest(d.id) ? 'text' : null;
    }
    return d;
  }

  /** An icon has a colour only when it is a symbol glyph (an emoji keeps its own colours). */
  hasColor(d: Drawing): boolean {
    return LINE_TYPES.includes(d.type) || FIB_TYPES.includes(d.type) || this.isTextLabel(d) || (this.isIcon(d) && isIconSymbol(d.icon));
  }
  hasLine(d: Drawing): boolean { return LINE_TYPES.includes(d.type) || FIB_TYPES.includes(d.type); }
  isIcon(d: Drawing): boolean { return d.type === 'icon'; }
  isSymbol(g: string): boolean { return isIconSymbol(g); }
  iconSizeOf(d: Drawing): number { return iconSize(d); }
  /** The text tool's label: text, colour and size, no line settings. */
  isTextLabel(d: Drawing): boolean { return d.type === 'text'; }
  hasText(d: Drawing): boolean { return LINE_TYPES.includes(d.type) || this.isTextLabel(d); }
  isFib(d: Drawing): boolean { return FIB_TYPES.includes(d.type); }
  fontSizesOf(d: Drawing): number[] { return this.isTextLabel(d) ? TEXT_LABEL_SIZES : this.fontSizes; }
  fontSizeOf(d: Drawing): number { return d.fontSize ?? (this.isTextLabel(d) ? TEXT_DEFAULT_SIZE : 13); }

  textPositions(d: Drawing): Array<{ value: DrawingTextPosition; label: string }> {
    return d.type === 'rectangle'
      ? [{ value: 'above', label: 'Boven' }, { value: 'middle', label: 'Midden' }, { value: 'below', label: 'Onder' }]
      : [{ value: 'above', label: 'Boven lijn' }, { value: 'middle', label: 'Op lijn' }, { value: 'below', label: 'Onder lijn' }];
  }

  toggle(p: EditPopover): void {
    this.popover = this.popover === p ? null : p;
  }

  /** Apply a style change; `close` closes the popover (single-choice pickers). */
  set(d: Drawing, patch: Partial<Drawing>, close = false): void {
    this.service.updateDrawing(d.id, patch);
    if (close) this.popover = null;
  }

  toggleLock(d: Drawing): void {
    this.service.toggleLocked(d.id);
  }

  remove(d: Drawing): void {
    this.service.removeDrawing(d.id);
    this.service.selectedDrawingId = null;
    this.popover = null;
    this.deleted.emit(d.id);
  }

  dashAttr(style: DrawingLineStyle | undefined): string | null {
    return style === 'dashed' ? '6 4' : style === 'dotted' ? '2 3' : null;
  }

  // ── Fib levels ──

  fibLevels(d: Drawing): number[] {
    return [...(d.fibLevels?.length ? d.fibLevels : this.defaultLevels(d))].sort((a, b) => a - b);
  }

  levelColor(d: Drawing, level: number): string {
    return fibLevelColor(d, level);
  }

  setLevelColor(d: Drawing, level: number, color: string): void {
    this.set(d, { fibLevelColors: { ...d.fibLevelColors, [fibLevelKey(level)]: color } });
  }

  addLevel(d: Drawing): void {
    const level = this.newLevel;
    if (level == null || !Number.isFinite(level)) return;
    const levels = this.fibLevels(d);
    if (!levels.some(l => fibLevelKey(l) === fibLevelKey(level))) {
      this.set(d, { fibLevels: [...levels, +level.toFixed(6)].sort((a, b) => a - b) });
    }
    this.newLevel = null;
  }

  removeLevel(d: Drawing, level: number): void {
    const levels = this.fibLevels(d).filter(l => l !== level);
    // An empty list would fall back to the defaults: keep at least one level.
    if (levels.length) this.set(d, { fibLevels: levels });
  }

  resetLevels(d: Drawing): void {
    this.set(d, { fibLevels: [...this.defaultLevels(d)], fibLevelColors: undefined });
  }

  private defaultLevels(d: Drawing): number[] {
    return d.type === 'fib-extension' ? DEFAULT_FIB_EXTENSION_LEVELS : DEFAULT_FIB_RETRACEMENT_LEVELS;
  }

  // ── Colours ──

  sameColor(a: string, b: string): boolean {
    return this.toHex(a).toLowerCase() === this.toHex(b).toLowerCase();
  }

  /** #rrggbb for <input type="color"> (accepts #rgb, #rrggbb and rgb[a]()). */
  toHex(color: string): string {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color;
    if (/^#[0-9a-f]{3}$/i.test(color)) return '#' + color.slice(1).split('').map(c => c + c).join('');
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(color);
    if (!m) return '#787b86';
    return '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('');
  }

  // ── Drag by the grip ──

  startDrag(e: PointerEvent): void {
    e.preventDefault();
    const startX = e.clientX - this.offsetX;
    const startY = e.clientY - this.offsetY;
    const move = (ev: PointerEvent) => {
      this.offsetX = ev.clientX - startX;
      this.offsetY = Math.max(0, ev.clientY - startY);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  // Presses on the toolbar must not reach the chart (it would deselect or start a pan).
  @HostListener('mousedown', ['$event'])
  @HostListener('touchstart', ['$event'])
  @HostListener('touchmove', ['$event'])
  @HostListener('touchend', ['$event'])
  @HostListener('click', ['$event'])
  @HostListener('dblclick', ['$event'])
  @HostListener('wheel', ['$event'])
  @HostListener('contextmenu', ['$event'])
  stop(e: Event): void {
    e.stopPropagation();
  }
}
