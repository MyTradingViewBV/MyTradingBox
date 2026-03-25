import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-info-step1',
  standalone: true,
  imports: [TranslateModule],
  template: `<section class="step-section">
    <h3>{{ 'ONBOARDING.STEP1.TITLE' | translate }}</h3>
    <p>{{ 'ONBOARDING.STEP1.INTRO' | translate }}</p>
    <ul>
      <li>&#x1F4C8; <strong>Chart</strong> &ndash; {{ 'ONBOARDING.STEP1.CHART' | translate }}</li>
      <li>&#x23F1; <strong>Tijdsframe</strong> &ndash; {{ 'ONBOARDING.STEP1.TIMEFRAME' | translate }}</li>
      <li>&#x1F3E6; <strong>Exchange</strong> &ndash; {{ 'ONBOARDING.STEP1.EXCHANGE' | translate }}</li>
      <li>&#x1F50D; <strong>Coin info</strong> &ndash; {{ 'ONBOARDING.STEP1.COIN_INFO' | translate }}</li>
      <li>&#x2B50; <strong>Watchlist</strong> &ndash; {{ 'ONBOARDING.STEP1.WATCHLIST' | translate }}</li>
    </ul>
    <p class="tip">{{ 'ONBOARDING.STEP1.TIP' | translate }}</p>
  </section>`
})
export class InfoStep1Component {}
