import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminComponent } from './admin.component';

describe('AdminComponent', () => {
  let component: AdminComponent;
  let fixture: ComponentFixture<AdminComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default to heartbeat segment', () => {
    expect(component.activeSegment).toBe('heartbeat');
  });

  it('should switch segment to logs', () => {
    component.setSegment('logs');
    expect(component.activeSegment).toBe('logs');
  });
});
