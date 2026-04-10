import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { UiModeOverride } from 'src/app/store/settings/settings.reducer';

@Component({
  selector: 'app-footer',
  standalone: true,
  // Angular Material removed; using plain HTML elements now
  imports: [TranslateModule],
  templateUrl: './footer-compenent.html',
  styleUrl: './footer-compenent.scss',
})
export class FooterComponent {
  private readonly _router = inject(Router);
  private readonly _settingsService = inject(SettingsService);
  readonly isAdmin = toSignal(inject(AppService).isAdmin(), { initialValue: false });
  readonly uiModeOverride = toSignal(this._settingsService.getUiModeOverride(), {
    initialValue: 'auto' as UiModeOverride,
  });
  readonly effectiveUiMode = computed(() => {
    const override = this.uiModeOverride();
    if (override === 'web' || override === 'mobile') {
      return override;
    }
    return this.detectAutoUiMode();
  });
  readonly isWeb = computed(() => this.effectiveUiMode() === 'web');

  constructor() {}

  private detectAutoUiMode(): 'web' | 'mobile' {
    const nav = navigator as Navigator & { standalone?: boolean };
    const ua = navigator.userAgent || '';
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      nav.standalone === true;
    const isPhoneLike = /Android|iPhone|iPad|iPod/i.test(ua);

    return isStandalone || isPhoneLike ? 'mobile' : 'web';
  }

  navigate(route: string): void {
    console.log('navigating to', route);
    this._router.navigate([`/${route}`]);
  }

  navigateWebChart(): void {
    this._settingsService.dispatchAppAction(
      SettingsActions.setUiModeOverride({ mode: 'web' }),
    );
    this._router.navigate(['/web-chart']);
  }
}
