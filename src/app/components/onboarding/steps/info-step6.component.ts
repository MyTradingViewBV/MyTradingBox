import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-info-step6',
  standalone: true,
  imports: [TranslateModule],
  template: `<section class="step-section">
    <h3>{{ 'ONBOARDING.STEP6.TITLE' | translate }}</h3>
    <p>{{ 'ONBOARDING.STEP6.COIN_INFO_DESC' | translate }}</p>
    <ul>
      <li>{{ 'ONBOARDING.STEP6.ITEM1' | translate }}</li>
      <li>{{ 'ONBOARDING.STEP6.ITEM2' | translate }}</li>
      <li>{{ 'ONBOARDING.STEP6.ITEM3' | translate }}</li>
    </ul>
    <p>{{ 'ONBOARDING.STEP6.ADD_DESC' | translate }}</p>
    <p>{{ 'ONBOARDING.STEP6.REMOVE_DESC' | translate }}</p>
    <p class="tip">{{ 'ONBOARDING.STEP6.TIP' | translate }}</p>
  </section>`
})
export class InfoStep6Component {}
