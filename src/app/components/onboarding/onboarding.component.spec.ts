import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingComponent } from './onboarding.component';
import { appFeature } from 'src/app/store/app/app.reducer';
import { provideComponentTestEnvironment } from 'src/testing/test-providers';

describe('OnboardingComponent', () => {
  const storageKey = 'mtb.onboarding.complete';
  let fixture: ComponentFixture<OnboardingComponent>;
  let component: OnboardingComponent;
  let store: Store;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [provideComponentTestEnvironment()],
    }).compileComponents();

    store = TestBed.inject(Store);
    fixture = TestBed.createComponent(OnboardingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('creates on the first step', () => {
    expect(component).toBeTruthy();
    expect(component.step).toBe(0);
    expect(
      fixture.nativeElement.querySelector('app-info-step1'),
    ).not.toBeNull();
  });

  it('moves between steps without going below the first one', () => {
    component.back();
    expect(component.step).toBe(0);

    component.next();
    component.next();
    component.back();
    expect(component.step).toBe(1);
  });

  it('completes after the last step: updates the store, persists the flag and emits', async () => {
    const completed = vi.fn();
    component.completed.subscribe(completed);

    for (let i = 0; i < component.total; i++) component.next();

    expect(completed).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(storageKey)).toBe('1');
    expect(
      await firstValueFrom(store.select(appFeature.selectOnboardingDone)),
    ).toBe(true);
  });

  it('skip completes immediately', () => {
    const completed = vi.fn();
    component.completed.subscribe(completed);

    component.skip();

    expect(completed).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(storageKey)).toBe('1');
  });
});
