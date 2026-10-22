import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DrawingEditToolbarComponent } from './drawing-edit-toolbar.component';
import { DEFAULT_FIB_RETRACEMENT_LEVELS, Drawing, DrawingToolsService } from './services/drawing-tools.service';

describe('DrawingEditToolbarComponent', () => {
  let fixture: ComponentFixture<DrawingEditToolbarComponent>;
  let component: DrawingEditToolbarComponent;
  let service: DrawingToolsService;

  const el = (testId: string): HTMLElement | null =>
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  const drawing = (id: string): Drawing => service.drawingsValue.find(d => d.id === id)!;

  function select(d: Drawing): void {
    service.setDrawings([d]);
    service.selectedDrawingId = d.id;
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DrawingEditToolbarComponent] });
    fixture = TestBed.createComponent(DrawingEditToolbarComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(DrawingToolsService);
    fixture.detectChanges();
  });

  const trend: Drawing = {
    id: 't1', type: 'trend-line', points: [{ x: 0, y: 1 }, { x: 10, y: 2 }], color: '#2962FF', lineWidth: 1,
  };
  const fib: Drawing = {
    id: 'f1', type: 'fib-retracement', points: [{ x: 0, y: 1 }, { x: 10, y: 2 }], color: '#F7525F', lineWidth: 1,
    fibLevels: [...DEFAULT_FIB_RETRACEMENT_LEVELS],
  };

  it('renders nothing without a selected drawing', () => {
    expect(el('drawing-edit-toolbar')).toBeNull();
  });

  it('shows colour, text, width and style for a trend line, no fib button', () => {
    select(trend);
    expect(el('edit-color')).not.toBeNull();
    expect(el('edit-text')).not.toBeNull();
    expect(el('edit-width')!.textContent).toContain('1px');
    expect(el('edit-style')).not.toBeNull();
    expect(el('edit-fib')).toBeNull();
  });

  it('shows only lock and delete for a position', () => {
    select({ ...trend, id: 'p1', type: 'long-position' });
    expect(el('edit-color')).toBeNull();
    expect(el('edit-lock')).not.toBeNull();
    expect(el('edit-delete')).not.toBeNull();
  });

  it('shows text, colour and size for a text label (no line settings) and opens its editor when the tool asks', () => {
    const label: Drawing = { id: 'x1', type: 'text', points: [{ x: 0, y: 1 }], color: '#D1D4DC', lineWidth: 1, text: '' };
    service.textEditRequestId = 'x1';
    select(label);
    expect(el('edit-text')).not.toBeNull();
    expect(el('edit-color')).not.toBeNull();
    expect(el('edit-width')).toBeNull();
    expect(el('edit-style')).toBeNull();
    expect(component.popover).toBe('text');
    expect(el('edit-text-input')).not.toBeNull();
    expect(service.textEditRequestId).toBeNull();
    expect(component.fontSizesOf(label)).toContain(40);
    expect(component.fontSizeOf(label)).toBe(14);
  });

  it('treats an arrow like a trend line', () => {
    select({ ...trend, id: 'a1', type: 'arrow' });
    expect(el('edit-text')).not.toBeNull();
    expect(el('edit-width')).not.toBeNull();
    expect(el('edit-style')).not.toBeNull();
    expect(component.popover).toBeNull();
  });

  it('changes colour, width, style and text of the drawing', () => {
    select(trend);
    component.set(drawing('t1'), { color: '#FF9800' });
    component.set(drawing('t1'), { lineWidth: 3, lineStyle: 'dashed' });
    component.set(drawing('t1'), { text: 'Support', textAlign: 'center', textPosition: 'below' });
    expect(drawing('t1')).toMatchObject({
      color: '#FF9800', lineWidth: 3, lineStyle: 'dashed', text: 'Support', textAlign: 'center', textPosition: 'below',
    });
  });

  it('locks and deletes the drawing', () => {
    select(trend);
    const deleted = vi.fn();
    component.deleted.subscribe(deleted);
    (el('edit-lock') as HTMLButtonElement).click();
    expect(drawing('t1').locked).toBe(true);
    (el('edit-delete') as HTMLButtonElement).click();
    expect(service.drawingsValue).toEqual([]);
    expect(service.selectedDrawingId).toBeNull();
    expect(deleted).toHaveBeenCalledWith('t1');
  });

  it('adds, recolours, removes and resets fib levels', () => {
    select(fib);
    expect(el('edit-fib')).not.toBeNull();

    component.newLevel = 0.705;
    component.addLevel(drawing('f1'));
    expect(drawing('f1').fibLevels).toContain(0.705);

    component.setLevelColor(drawing('f1'), 0.618, '#00ff00');
    expect(drawing('f1').fibLevelColors).toEqual({ '0.618': '#00ff00' });
    expect(component.levelColor(drawing('f1'), 0.618)).toBe('#00ff00');

    component.removeLevel(drawing('f1'), 0.5);
    expect(drawing('f1').fibLevels).not.toContain(0.5);

    component.resetLevels(drawing('f1'));
    expect(drawing('f1').fibLevels).toEqual(DEFAULT_FIB_RETRACEMENT_LEVELS);
    expect(drawing('f1').fibLevelColors).toBeUndefined();
  });

  it('does not add a level twice', () => {
    select(fib);
    component.newLevel = 0.618;
    component.addLevel(drawing('f1'));
    expect(drawing('f1').fibLevels!.filter(l => l === 0.618).length).toBe(1);
  });

  it('converts colours to #rrggbb for the colour input', () => {
    expect(component.toHex('rgba(33,150,243,0.7)')).toBe('#2196f3');
    expect(component.toHex('#abc')).toBe('#aabbcc');
    expect(component.toHex('#2962FF')).toBe('#2962FF');
  });
});
