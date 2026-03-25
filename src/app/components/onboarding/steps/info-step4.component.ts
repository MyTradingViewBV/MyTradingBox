import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-info-step4',
  standalone: true,
  imports: [TranslateModule],
  template: `<section class="step-section">
    <h3>{{ 'ONBOARDING.STEP4.TITLE' | translate }}</h3>
    <p>{{ 'ONBOARDING.STEP4.INTRO' | translate }}</p>
    <ul>
      <li><strong>Boxes</strong> &ndash; {{ 'ONBOARDING.STEP4.BOXES' | translate }}</li>
      <li><strong>Key Zones</strong> &ndash; {{ 'ONBOARDING.STEP4.KEYZONES' | translate }}</li>
      <li><strong>Indicatoren</strong> &ndash; {{ 'ONBOARDING.STEP4.INDICATORS' | translate }}</li>
      <li><strong>Market Cipher</strong> &ndash; {{ 'ONBOARDING.STEP4.MARKET_CIPHER' | translate }}</li>
      <li><strong>Orders</strong> &ndash; {{ 'ONBOARDING.STEP4.ORDERS' | translate }}</li>
    </ul>
    <p>{{ 'ONBOARDING.STEP4.DRAWING_TOOLS' | translate }}</p>
    <p class="tip">{{ 'ONBOARDING.STEP4.TIP' | translate }}</p>
  </section>`
})
export class InfoStep4Component {}
