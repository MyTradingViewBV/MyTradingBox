import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { OnboardingComponent } from './onboarding.component';
import { provideStore, Store } from '@ngrx/store';
import { appFeature } from '../../store/app/app.reducer';

describe('OnboardingComponent', () => {
  let component: OnboardingComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [provideStore({ [appFeature.name]: appFeature.reducer })]
    });
    const fixture = TestBed.createComponent(OnboardingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // no cleanup needed

  it('should start at step 0', () => {
    expect(component.step).toBe(0);
  });

  it('should advance through steps and set flag when finished', async () => {
    for (let i = 0; i < 4; i++) {
      component.next();
    }
    expect(component.step).toBe(4);
    component.next(); // finish
    // Expect store state updated (await first emission of true)
    const store = TestBed.inject(Store);
    const done = await firstValueFrom(store.select(appFeature.selectOnboardingDone));
    expect(done).toBeTrue();
  });

  it('should not go below step 0 when back is called at start', () => {
    component.back();
    expect(component.step).toBe(0);
  });
});
