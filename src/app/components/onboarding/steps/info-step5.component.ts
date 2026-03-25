import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-info-step5',
  standalone: true,
  imports: [TranslateModule],
  template: `<section class="step-section">
    <h3>{{ 'ONBOARDING.STEP5.TITLE' | translate }}</h3>
    <p>{{ 'ONBOARDING.STEP5.INTRO' | translate }}</p>
    <p>{{ 'ONBOARDING.STEP5.OVERVIEW' | translate }}</p>
    <ul>
      <li>{{ 'ONBOARDING.STEP5.ITEM1' | translate }}</li>
      <li>{{ 'ONBOARDING.STEP5.ITEM2' | translate }}</li>
    </ul>
    <p>{{ 'ONBOARDING.STEP5.NAVIGATE' | translate }}</p>
    <p class="tip">{{ 'ONBOARDING.STEP5.TIP' | translate }}</p>
  </section>`
})
export class InfoStep5Component {}
