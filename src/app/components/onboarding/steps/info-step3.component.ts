import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-info-step3',
  standalone: true,
  imports: [TranslateModule],
  template: `<section class="step-section">
    <h3>{{ 'ONBOARDING.STEP3.TITLE' | translate }}</h3>
    <p>{{ 'ONBOARDING.STEP3.INTRO' | translate }}</p>
    <p><strong>{{ 'ONBOARDING.STEP3.TIMEFRAME_SWITCH' | translate }}</strong></p>
    <ul>
      <li><strong>12m / 24m</strong> &ndash; {{ 'ONBOARDING.STEP3.TF_12M' | translate }}</li>
      <li><strong>1H</strong> &ndash; {{ 'ONBOARDING.STEP3.TF_1H' | translate }}</li>
      <li><strong>4H</strong> &ndash; {{ 'ONBOARDING.STEP3.TF_4H' | translate }}</li>
      <li><strong>1D / 1W / 1M</strong> &ndash; {{ 'ONBOARDING.STEP3.TF_1D' | translate }}</li>
    </ul>
    <p><strong>{{ 'ONBOARDING.STEP3.NAVIGATE' | translate }}</strong></p>
    <ul>
      <li>{{ 'ONBOARDING.STEP3.NAV_ZOOM' | translate }}</li>
      <li>{{ 'ONBOARDING.STEP3.NAV_PAN' | translate }}</li>
      <li>{{ 'ONBOARDING.STEP3.NAV_DOUBLE' | translate }}</li>
    </ul>
  </section>`
})
export class InfoStep3Component {}
