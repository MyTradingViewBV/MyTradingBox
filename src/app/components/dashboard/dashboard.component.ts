import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { FooterComponent } from '../footer/footer.component';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { RefreshButtonComponent } from '../shared/refresh-button/refresh-button.component';
import { OverviewTabComponent } from './overview-tab/overview-tab.component';
import { WhatsNewTabComponent } from './whats-new-tab/whats-new-tab.component';
import { TimeframesTabComponent } from './timeframes-tab/timeframes-tab.component';
import { TestsTabComponent } from './tests-tab/tests-tab.component';
import { ReportTabComponent } from './report-tab/report-tab.component';

export type DashboardTab = 'overview' | 'whats-new' | 'timeframes' | 'tests' | 'report';
export const DASHBOARD_TABS: DashboardTab[] = ['overview', 'whats-new', 'timeframes', 'tests', 'report'];
const TAB_KEY = 'mtb.dashboard.tab';

/** Dashboard page (/overview): market and system overview, what's new, all timeframes, test counts, and issue reporting. */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    TranslateModule,
    FooterComponent,
    BackButtonComponent,
    RefreshButtonComponent,
    OverviewTabComponent,
    WhatsNewTabComponent,
    TimeframesTabComponent,
    TestsTabComponent,
    ReportTabComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);

  readonly tab = signal<DashboardTab>(this.initialTab());

  /** Tab buttons for the template, precomputed (templates must not call methods). */
  readonly dashboardTabs = computed(() =>
    DASHBOARD_TABS.map((id) => ({
      id,
      active: id === this.tab(),
      // Only the data tabs have something to reload.
      refreshable: id === 'overview' || id === 'timeframes',
      labelKey: `DASHBOARD.TAB_${id.toUpperCase().replace('-', '_')}`,
    })),
  );
  readonly isAdmin = toSignal(inject(AppService).isAdmin(), { initialValue: false });

  private readonly _overview = viewChild(OverviewTabComponent);
  private readonly _timeframes = viewChild(TimeframesTabComponent);

  select(tab: DashboardTab): void {
    if (tab === this.tab()) return;
    this.tab.set(tab);
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      // Storage blocked: the tab just isn't remembered.
    }
    this._router.navigate([], {
      relativeTo: this._route,
      queryParams: { tab },
      replaceUrl: true,
    });
  }

  /** Arrow keys move between tabs (WAI-ARIA tabs pattern). */
  onTabKey(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const count = DASHBOARD_TABS.length;
    const next = DASHBOARD_TABS[(DASHBOARD_TABS.indexOf(this.tab()) + step + count) % count];
    this.select(next);
    document.getElementById(`dash-tab-${next}`)?.focus();
  }

  refresh(): void {
    this._overview()?.refresh();
    this._timeframes()?.refresh();
  }

  private initialTab(): DashboardTab {
    const fromUrl = this._route.snapshot.queryParamMap.get('tab') as DashboardTab | null;
    if (fromUrl && DASHBOARD_TABS.includes(fromUrl)) return fromUrl;
    try {
      const stored = localStorage.getItem(TAB_KEY) as DashboardTab | null;
      if (stored && DASHBOARD_TABS.includes(stored)) return stored;
    } catch {
      // Storage blocked: fall back to the overview.
    }
    return 'overview';
  }
}
