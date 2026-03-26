import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-info-step2',
  standalone: true,
  imports: [TranslateModule],
  template: `<section class="step-section">
    <h3>{{ 'ONBOARDING.STEP2.TITLE' | translate }}</h3>
    <p>{{ 'ONBOARDING.STEP2.EXCHANGE_DESC' | translate }}</p>
    <p>{{ 'ONBOARDING.STEP2.SYMBOL_DESC' | translate }}</p>
    <ul>
      <li>{{ 'ONBOARDING.STEP2.ITEM1' | translate }}</li>
      <li>{{ 'ONBOARDING.STEP2.ITEM2' | translate }}</li>
      <li>{{ 'ONBOARDING.STEP2.ITEM3' | translate }}</li>
    </ul>
    <p class="tip">{{ 'ONBOARDING.STEP2.TIP' | translate }}</p>
  </section>`
})
export class InfoStep2Component {}
