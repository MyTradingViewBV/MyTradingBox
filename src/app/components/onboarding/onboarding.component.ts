import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InfoStep1Component } from './steps/info-step1.component';
import { InfoStep2Component } from './steps/info-step2.component';
import { InfoStep3Component } from './steps/info-step3.component';
import { InfoStep4Component } from './steps/info-step4.component';
import { InfoStep5Component } from './steps/info-step5.component';
import { Store } from '@ngrx/store';
import { AppActions } from '../../store/app/app.actions';

/**
 * Onboarding overlay shown after first successful login.
 * Displays five informational steps. After completion, sets localStorage flag 'onboardingDone'.
 */
@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, InfoStep1Component, InfoStep2Component, InfoStep3Component, InfoStep4Component, InfoStep5Component],
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.scss']
})
export class OnboardingComponent {
  @Output() completed = new EventEmitter<void>();

  /** index of current step (0..4) */
  step = 0;
  readonly total = 5;

  constructor(private store: Store) {}

  next(): void {
    if (this.step < this.total - 1) {
      this.step++;
    } else {
      // finished
      this.store.dispatch(AppActions.completeOnboarding());
      this.completed.emit();
    }
  }

  back(): void {
    if (this.step > 0) {
      this.step--;
    }
  }

  skip(): void {
    this.store.dispatch(AppActions.completeOnboarding());
    this.completed.emit();
  }
}
