import {
  Component,
  computed,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import {
  SettingsService,
  detectAutoUiMode,
} from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { UiModeOverride } from 'src/app/store/settings/settings.reducer';
import { debugLog } from 'src/app/helpers/debug-log';

@Component({
  selector: 'app-footer',
  standalone: true,
  // Angular Material removed; using plain HTML elements now
  imports: [TranslateModule],
  templateUrl: './footer.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './footer.component.scss',
})
export class FooterComponent {
  private readonly _router = inject(Router);
  private readonly _settingsService = inject(SettingsService);
  showWebOptions = false;
  private readonly _url = toSignal(
    this._router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
      startWith(this._router.url),
    ),
    { initialValue: this._router.url },
  );
  readonly isAdmin = toSignal(inject(AppService).isAdmin(), {
    initialValue: false,
  });
  readonly uiModeOverride = toSignal(
    this._settingsService.getUiModeOverride(),
    {
      initialValue: 'auto' as UiModeOverride,
    },
  );
  readonly effectiveUiMode = computed(() => {
    const override = this.uiModeOverride();
    if (override === 'web' || override === 'mobile') {
      return override;
    }
    return detectAutoUiMode();
  });
  readonly isWeb = computed(() => this.effectiveUiMode() === 'web');

  /** First URL segment; /settings maps to the 'dashboard' settings button. */
  readonly activeRoute = computed(() => {
    const segment = this._url().split(/[/?#]/)[1] ?? '';
    return segment === 'settings' ? 'dashboard' : segment;
  });

  navigate(route: string): void {
    this.showWebOptions = false;
    debugLog('navigating to', route);
    this._router.navigate([`/${route}`]);
  }

  toggleWebOptions(): void {
    this.showWebOptions = !this.showWebOptions;
  }

  closeWebOptions(): void {
    this.showWebOptions = false;
  }

  openWebOption(
    route: 'mcb-chart' | 'chart',
  ): void {
    this._settingsService.dispatchAppAction(
      SettingsActions.setUiModeOverride({ mode: 'web' }),
    );
    this.showWebOptions = false;
    this._router.navigate([`/${route}`]);
  }
}
