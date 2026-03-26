import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-info-step7',
  standalone: true,
  imports: [TranslateModule],
  template: `<section class="step-section">
    <h3>{{ 'ONBOARDING.STEP7.TITLE' | translate }}</h3>
    <p>{{ 'ONBOARDING.STEP7.INTRO' | translate }}</p>
    <ul>
      <li>&#x1F3E6; {{ 'ONBOARDING.STEP7.ITEM1' | translate }}</li>
      <li>&#x23F1; {{ 'ONBOARDING.STEP7.ITEM2' | translate }}</li>
      <li>&#x2699; {{ 'ONBOARDING.STEP7.ITEM3' | translate }}</li>
      <li>&#x2B50; {{ 'ONBOARDING.STEP7.ITEM4' | translate }}</li>
      <li>&#x1F50D; {{ 'ONBOARDING.STEP7.ITEM5' | translate }}</li>
    </ul>
    <p>{{ 'ONBOARDING.STEP7.PUSH_NOTE' | translate }}</p>
    <p style="margin-top:1rem;font-size:1rem;color:#f0b90b;font-weight:600">{{ 'ONBOARDING.STEP7.GOODBYE' | translate }}</p>
  </section>`
})
export class InfoStep7Component {}
