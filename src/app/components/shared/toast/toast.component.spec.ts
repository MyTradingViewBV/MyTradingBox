import { TestBed } from '@angular/core/testing';
import { ToastService } from '../../../helpers/toast.service';
import { ToastComponent } from './toast.component';

describe('ToastComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [ToastComponent] });
  });

  afterEach(() => vi.useRealTimers());

  function create() {
    const fixture = TestBed.createComponent(ToastComponent);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, toast: TestBed.inject(ToastService) };
  }

  it('hides a normal toast after its duration', () => {
    const { fixture, el, toast } = create();
    toast.show('hello', 'info', 1000);
    fixture.detectChanges();
    expect(el.textContent).toContain('hello');
    vi.advanceTimersByTime(1000);
    fixture.detectChanges();
    expect(el.querySelector('.toast-container')).toBeNull();
  });

  it('keeps a duration-0 toast open and runs its action once on click', () => {
    const { fixture, el, toast } = create();
    const run = vi.fn();
    toast.show('reload me', 'warning', 0, { label: 'Reload', run });
    fixture.detectChanges();
    vi.advanceTimersByTime(60_000);
    fixture.detectChanges();
    const button = el.querySelector<HTMLButtonElement>('.toast-action');
    expect(button?.textContent?.trim()).toBe('Reload');
    button!.click();
    fixture.detectChanges();
    expect(run).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.toast-container')).toBeNull();
  });

  it('shows no action button without an action', () => {
    const { fixture, el, toast } = create();
    toast.error('oops');
    fixture.detectChanges();
    expect(el.querySelector('.toast-action')).toBeNull();
  });
});
