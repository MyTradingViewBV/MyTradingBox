import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DrawingToolboxComponent } from './drawing-toolbox.component';
import { DrawingToolsService } from './services/drawing-tools.service';

describe('DrawingToolboxComponent cursor button', () => {
  let fixture: ComponentFixture<DrawingToolboxComponent>;
  let service: DrawingToolsService;

  const cursorBtn = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('[data-testid="cursor-btn"]');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DrawingToolboxComponent] });
    fixture = TestBed.createComponent(DrawingToolboxComponent);
    service = TestBed.inject(DrawingToolsService);
    fixture.detectChanges();
  });

  it('is the first tool button and shows as selected when no tool is active', () => {
    const first = fixture.nativeElement.querySelector('button.tool-btn');
    expect(first).toBe(cursorBtn());
    expect(cursorBtn().textContent).toContain('Cursor');
    expect(cursorBtn().classList.contains('selected')).toBe(true);
  });

  it('is not selected while a drawing tool is active', () => {
    service.selectTool('trend-line');
    fixture.detectChanges();
    expect(cursorBtn().classList.contains('selected')).toBe(false);
  });

  it('calls cancelDrawing on click and returns to cursor mode', () => {
    service.selectTool('trend-line');
    const spy = vi.spyOn(service, 'cancelDrawing');
    cursorBtn().click();
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(service.activeToolValue).toBeNull();
    expect(cursorBtn().classList.contains('selected')).toBe(true);

    cursorBtn().click();
    expect(service.activeToolValue).toBeNull();
  });
});
