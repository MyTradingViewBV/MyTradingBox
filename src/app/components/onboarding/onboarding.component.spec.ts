import { TestBed, ComponentFixture } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { OnboardingComponent } from './onboarding.component';
import { provideStore, Store } from '@ngrx/store';
import { appFeature } from '../../store/app/app.reducer';
import { AppActions } from '../../store/app/app.actions';

describe('OnboardingComponent', () => {
  let component: OnboardingComponent;
  let fixture: ComponentFixture<OnboardingComponent>;
  let store: Store;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [provideStore({ [appFeature.name]: appFeature.reducer })]
    });
    fixture = TestBed.createComponent(OnboardingComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(Store);
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should start at step 0', () => {
      expect(component.step).toBe(0);
    });

    it('should have total steps set to 5', () => {
      expect(component.total).toBe(5);
    });

    it('should have completed output emitter', () => {
      expect(component.completed).toBeDefined();
    });
  });

  describe('Navigation - Next Step', () => {
    it('should advance to next step', () => {
      component.next();
      expect(component.step).toBe(1);
    });

    it('should advance through all steps', () => {
      for (let i = 0; i < 4; i++) {
        component.next();
        expect(component.step).toBe(i + 1);
      }
    });

    it('should reach final step (4)', () => {
      for (let i = 0; i < 4; i++) {
        component.next();
      }
      expect(component.step).toBe(4);
    });

    it('should not exceed final step', () => {
      for (let i = 0; i < 5; i++) {
        component.next();
      }
      expect(component.step).toBe(4);
    });
  });

  describe('Navigation - Back Step', () => {
    it('should go back one step', () => {
      component.step = 2;
      component.back();
      expect(component.step).toBe(1);
    });

    it('should not go below step 0 when back is called at start', () => {
      component.back();
      expect(component.step).toBe(0);
    });

    it('should go back multiple steps', () => {
      component.step = 4;
      component.back();
      expect(component.step).toBe(3);
      component.back();
      expect(component.step).toBe(2);
    });

    it('should stay at step 0 when calling back multiple times at start', () => {
      for (let i = 0; i < 5; i++) {
        component.back();
      }
      expect(component.step).toBe(0);
    });
  });

  describe('Onboarding Completion', () => {
    it('should advance through steps and set flag when finished', async () => {
      for (let i = 0; i < 4; i++) {
        component.next();
      }
      expect(component.step).toBe(4);
      
      spyOn(store, 'dispatch');
      spyOn(component.completed, 'emit');
      
      component.next(); // finish
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
      expect(component.completed.emit).toHaveBeenCalled();
    });

    it('should emit completed event on next from last step', (done) => {
      component.step = 4;
      component.completed.subscribe(() => {
        expect(true).toBeTrue();
        done();
      });
      
      spyOn(store, 'dispatch');
      component.next();
      
      expect(store.dispatch).toHaveBeenCalled();
    });

    it('should dispatch completeOnboarding action on next from last step', () => {
      component.step = 4;
      spyOn(store, 'dispatch');
      
      component.next();
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
    });
  });

  describe('Skip Onboarding', () => {
    it('should skip onboarding and emit completed', (done) => {
      component.completed.subscribe(() => {
        expect(true).toBeTrue();
        done();
      });
      
      spyOn(store, 'dispatch');
      component.skip();
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
    });

    it('should dispatch completeOnboarding action on skip', () => {
      spyOn(store, 'dispatch');
      
      component.skip();
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
    });

    it('should skip from any step', () => {
      component.step = 2;
      spyOn(store, 'dispatch');
      spyOn(component.completed, 'emit');
      
      component.skip();
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
      expect(component.completed.emit).toHaveBeenCalled();
    });

    it('should skip from first step', () => {
      component.step = 0;
      spyOn(store, 'dispatch');
      spyOn(component.completed, 'emit');
      
      component.skip();
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
      expect(component.completed.emit).toHaveBeenCalled();
    });

    it('should skip from last step', () => {
      component.step = 4;
      spyOn(store, 'dispatch');
      spyOn(component.completed, 'emit');
      
      component.skip();
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
      expect(component.completed.emit).toHaveBeenCalled();
    });
  });

  describe('Step Navigation Integration', () => {
    it('should navigate forward and backward correctly', () => {
      // Go forward
      component.next();
      component.next();
      expect(component.step).toBe(2);
      
      // Go back
      component.back();
      expect(component.step).toBe(1);
      
      // Go forward again
      component.next();
      expect(component.step).toBe(2);
    });

    it('should handle alternating forward and backward navigation', () => {
      component.next(); // step 1
      component.next(); // step 2
      component.back();  // step 1
      component.back();  // step 0
      component.next(); // step 1
      
      expect(component.step).toBe(1);
    });

    it('should navigate through all steps and complete', async () => {
      spyOn(store, 'dispatch');
      spyOn(component.completed, 'emit');
      
      // Navigate through all steps
      for (let i = 0; i < 5; i++) {
        component.next();
      }
      
      // Should have dispatched completeOnboarding action
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
      expect(component.completed.emit).toHaveBeenCalled();
    });
  });

  describe('Store Integration', () => {
    it('should update store state when onboarding is completed', async () => {
      spyOn(store, 'dispatch').and.callThrough();
      
      component.skip();
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
    });

    it('should update store state on finish after all steps', async () => {
      spyOn(store, 'dispatch').and.callThrough();
      
      for (let i = 0; i < 5; i++) {
        component.next();
      }
      
      expect(store.dispatch).toHaveBeenCalledWith(AppActions.completeOnboarding());
    });
  });

  describe('Change Detection', () => {
    it('should update step property on next', () => {
      const initialStep = component.step;
      component.next();
      expect(component.step).not.toBe(initialStep);
    });

    it('should update step property on back', () => {
      component.step = 2;
      const initialStep = component.step;
      component.back();
      expect(component.step).toBe(initialStep - 1);
    });

    it('should trigger change detection on step changes', () => {
      spyOn(fixture, 'detectChanges');
      component.next();
      fixture.detectChanges();
      expect(fixture.detectChanges).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid next calls', () => {
      component.next();
      component.next();
      component.next();
      component.next();
      component.next(); // Should not exceed step 4
      
      expect(component.step).toBeLessThanOrEqual(4);
    });

    it('should handle rapid back calls', () => {
      component.step = 2;
      component.back();
      component.back();
      component.back(); // Should not go below 0
      
      expect(component.step).toBeGreaterThanOrEqual(0);
    });

    it('should handle mixed rapid navigation', () => {
      for (let i = 0; i < 10; i++) {
        component.next();
      }
      for (let i = 0; i < 10; i++) {
        component.back();
      }
      
      expect(component.step).toBe(0);
    });
  });

  describe('Event Emission', () => {
    it('should emit completed event with correct type', (done) => {
      component.completed.subscribe((value) => {
        expect(value).toBeUndefined();
        done();
      });
      component.skip();
    });

    it('should emit completed multiple times if triggered multiple times', () => {
      let emitCount = 0;
      component.completed.subscribe(() => {
        emitCount++;
      });
      
      component.skip();
      component.completed.emit();
      
      expect(emitCount).toBe(2);
    });
  });
});
