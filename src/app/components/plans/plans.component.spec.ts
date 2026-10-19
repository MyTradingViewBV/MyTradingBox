import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { ToastMessage, ToastService } from '../../helpers/toast.service';
import { PlansComponent } from './plans.component';
import { PLANS, formatEuro, maxYearlySavingPercent, yearlySavingPercent } from './plans.data';

describe('plans data', () => {
  it('formats euro per language, whole euros without decimals', () => {
    expect(formatEuro(9.99, 'nl')).toBe('€9,99');
    expect(formatEuro(9.99, 'en')).toBe('€9.99');
    expect(formatEuro(99, 'nl')).toBe('€99');
    expect(formatEuro(0, 'en')).toBe('€0');
    expect(formatEuro(8.25, 'nl')).toBe('€8,25');
  });

  it('computes the yearly saving (17% for Basic and Pro)', () => {
    const [trial, basic, pro] = PLANS;
    expect(yearlySavingPercent(trial)).toBe(0);
    expect(yearlySavingPercent(basic)).toBe(17);
    expect(yearlySavingPercent(pro)).toBe(17);
    expect(maxYearlySavingPercent()).toBe(17);
  });
});

describe('PlansComponent', () => {
  let toasts: ToastMessage[];

  beforeEach(() => {
    toasts = [];
    TestBed.configureTestingModule({
      imports: [PlansComponent, TranslateModule.forRoot()],
      providers: [provideRouter([])],
    });
    TestBed.inject(ToastService).toast$.subscribe((t) => toasts.push(t));
  });

  function render() {
    const fixture = TestBed.createComponent(PlansComponent);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('shows the three plans with monthly prices and the yearly price below', () => {
    const { el } = render();
    const cards = Array.from(el.querySelectorAll<HTMLElement>('.plan-card'));
    expect(cards.map((c) => c.dataset['plan'])).toEqual(['trial', 'basic', 'pro']);
    expect(cards[0].querySelector('.price')?.textContent).toBe('€0');
    expect(cards[1].querySelector('.price')?.textContent).toBe('€9.99');
    expect(cards[1].querySelector('.price-sub')?.textContent).toContain('€99');
    expect(cards[2].querySelector('.price')?.textContent).toBe('€19.99');
    expect(cards[2].querySelector('.popular-badge')).not.toBeNull();
    expect(cards[2].querySelectorAll('.feature-col li').length).toBe(19);
  });

  it('switches to yearly prices with the monthly equivalent below', () => {
    const { fixture, el } = render();
    el.querySelectorAll<HTMLButtonElement>('.billing-toggle button')[1].click();
    fixture.detectChanges();
    const basic = el.querySelector<HTMLElement>('[data-plan="basic"]')!;
    expect(basic.querySelector('.price')?.textContent).toBe('€99');
    expect(basic.querySelector('.price-sub')?.textContent).toContain('€8.25');
    expect(el.querySelector('[data-plan="pro"] .price')?.textContent).toBe('€199');
  });

  it('is information only: a plan button shows a coming-soon message', () => {
    const { el } = render();
    el.querySelector<HTMLButtonElement>('[data-plan="pro"] .cta')!.click();
    expect(toasts.length).toBe(1);
    expect(toasts[0].text).toBe('PLANS.COMING_SOON');
  });
});
