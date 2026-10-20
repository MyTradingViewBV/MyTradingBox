import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { Store } from '@ngrx/store';
import { appFeature } from 'src/app/store/app/app.reducer';
import { formatReleaseTime } from '../whats-new-tab/whats-new';
import { TestCountReport, toTestCountViews } from './test-counts';

/** Dashboard tab: how many automated tests each component has, counted from the code at deploy time. */
@Component({
  selector: 'app-dashboard-tests',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './tests-tab.component.html',
  styleUrl: './tests-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TestsTabComponent {
  private readonly _http = inject(HttpClient);

  private readonly report = signal<TestCountReport | null>(null);
  private readonly loaded = signal(false);
  /** App language ('en' / 'nl'): numbers and the count time follow it. */
  private readonly language = toSignal(inject(Store).select(appFeature.selectLanguage), {
    initialValue: 'nl',
  });

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly testsVm = computed(() => {
    const report = this.report();
    const lang = this.language();
    const rows = toTestCountViews(report);
    const num = new Intl.NumberFormat(lang);
    const totals = report?.totals;
    return {
      loaded: this.loaded(),
      empty: !rows.length,
      generatedAt: formatReleaseTime(report?.generatedAt, lang),
      generatedIso: report?.generatedAt ?? null,
      totals: totals
        ? [
            { labelKey: 'DASHBOARD.TESTS_TOTAL', value: num.format(totals.tests) },
            { labelKey: 'DASHBOARD.TESTS_FILES', value: num.format(totals.files) },
            { labelKey: 'DASHBOARD.TESTS_UNIT', value: num.format(totals.unit) },
            { labelKey: 'DASHBOARD.TESTS_SMOKE', value: num.format(totals.smoke) },
            { labelKey: 'DASHBOARD.TESTS_E2E', value: num.format(totals.e2e) },
          ]
        : [],
      untested: rows.filter((r) => !r.tests).length,
      rows: rows.map((r) => ({
        key: `${r.area}|${r.name}`,
        name: r.name,
        area: r.area === 'components' ? '' : r.area,
        files: num.format(r.files),
        tests: num.format(r.tests),
        none: !r.tests,
        barWidth: `${r.share}%`,
        detail: [
          r.unit ? `${num.format(r.unit)} unit` : '',
          r.smoke ? `${num.format(r.smoke)} smoke` : '',
          r.e2e ? `${num.format(r.e2e)} e2e` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    };
  });

  constructor() {
    this._http
      .get<TestCountReport>('assets/test-counts.json')
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (report) => {
          this.report.set(report && typeof report === 'object' ? report : null);
          this.loaded.set(true);
        },
        error: () => this.loaded.set(true),
      });
  }
}
