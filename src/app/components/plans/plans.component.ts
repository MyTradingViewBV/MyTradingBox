import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { map, startWith } from 'rxjs';
import { ToastService } from '../../helpers/toast.service';
import { BillingPeriod, PLANS, Plan, PlanId, formatEuro, maxYearlySavingPercent } from './plans.data';

function planKeyPrefix(id: PlanId): string {
  return `PLANS.${id.toUpperCase()}`;
}

/** Plan card as shown: prices already formatted for the chosen billing period and language. */
interface PlanView {
  plan: Plan;
  /** Translation key prefix of the plan, e.g. "PLANS.BASIC" (NAME, TAGLINE, CTA). */
  keyPrefix: string;
  /** Big price, e.g. "€9,99". */
  price: string;
  /** Unit after the big price: PLANS.PER_MONTH / PLANS.PER_YEAR, or null for the trial. */
  unitKey: string | null;
  /** Small price under the big one, e.g. "€99" (yearly) or "€8,25" (monthly equivalent). */
  subPrice: string | null;
  /** Unit of subPrice (translated in the template so it follows the language). */
  subUnitKey: string | null;
}

/**
 * Subscription plans (information only). The buttons do not start a payment yet: they show a
 * "coming soon" message. Prices and features come from plans.data.ts.
 */
@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './plans.component.html',
  styleUrls: ['./plans.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlansComponent {
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  readonly planBilling = signal<BillingPeriod>('monthly');
  readonly savePercent = maxYearlySavingPercent();

  private readonly lang = toSignal(
    this.translate.onLangChange.pipe(
      map((e) => e.lang),
      startWith(this.translate.getCurrentLang() ?? 'en'),
    ),
    { initialValue: 'en' },
  );

  readonly planCards = computed<PlanView[]>(() => {
    const lang = this.lang() ?? 'en';
    const yearly = this.planBilling() === 'yearly';
    return PLANS.map((plan) => {
      const keyPrefix = planKeyPrefix(plan.id);
      if (plan.monthly === 0 || plan.yearly == null) {
        return { plan, keyPrefix, price: formatEuro(0, lang), unitKey: null, subPrice: null, subUnitKey: null };
      }
      if (yearly) {
        const monthlyEquivalent = Math.round((plan.yearly / 12) * 100) / 100;
        return {
          plan,
          keyPrefix,
          price: formatEuro(plan.yearly, lang),
          unitKey: 'PLANS.PER_YEAR_SHORT',
          subPrice: formatEuro(monthlyEquivalent, lang),
          subUnitKey: 'PLANS.PER_MONTH_SHORT',
        };
      }
      return {
        plan,
        keyPrefix,
        price: formatEuro(plan.monthly, lang),
        unitKey: 'PLANS.PER_MONTH_SHORT',
        subPrice: formatEuro(plan.yearly, lang),
        subUnitKey: 'PLANS.PER_YEAR_SHORT',
      };
    });
  });

  setBilling(period: BillingPeriod): void {
    this.planBilling.set(period);
  }

  /** Information only for now: no checkout behind the buttons yet. */
  choose(id: PlanId): void {
    const plan = this.translate.instant(`${planKeyPrefix(id)}.NAME`);
    this.toast.show(this.translate.instant('PLANS.COMING_SOON', { plan }), 'info', 4000);
  }

  close(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigateByUrl('/');
  }
}
