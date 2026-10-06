import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { VersionService } from './helpers/version.service';
import { ThemeService } from './helpers/theme.service';
import { firstValueFrom } from 'rxjs';

import { OnboardingComponent } from './components/onboarding/onboarding.component';
import { ToastComponent } from './components/shared/toast/toast.component';
import { Store } from '@ngrx/store';
import { SettingsService } from './modules/shared/services/services/settingsService';
import { NotificationService } from './helpers/notification.service';
import { SwUpdateService } from './helpers/sw-update.service';
import { ChartService } from './modules/shared/services/http/chart.service';
import { appFeature } from './store/app/app.reducer';
import { AppActions } from './store/app/app.actions';
import { environment } from '../environments/environment';
import { debugLog } from 'src/app/helpers/debug-log';

/** App-specific globals stashed on window for the Admin install flow. */
interface MtbInstallWindow {
  __mtbInstallPrompt: Event | null;
  __mtbIOSInstalled?: boolean;
}

/** iOS Safari exposes `navigator.standalone` when launched from the home screen. */
type StandaloneNavigator = Navigator & { standalone?: boolean };

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, OnboardingComponent, ToastComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./app.css'],
})
export class App implements OnInit {
  // Footer moved into feature components; not managed globally anymore
  // showFooter removed
  showOnboarding = false;
  protected title = 'pos';

  private readonly _translate = inject(TranslateService);
  private readonly _versionService = inject(VersionService);
  public readonly theme = inject(ThemeService);
  private readonly _router = inject(Router);
  private readonly store = inject(Store);
  private readonly settings = inject(SettingsService);
  private readonly notify = inject(NotificationService);
  private readonly swUpdateService = inject(SwUpdateService);
  private readonly chartService = inject(ChartService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly swMigrationReloadKey = 'mtb.sw.migration.reload.v1';

  constructor() {
    this._translate.setDefaultLang('nl');
    // Language will be set from store in ngOnInit
  }

  async ngOnInit(): Promise<void> {
    // Persisted state (session, exchange, dark mode, onboarding) is hydrated by
    // the store's persistence meta-reducer; ThemeService follows the store.
    await this._versionService.loadLocalVersion();
    await this.migrateLegacyServiceWorkerRegistration();

    if (environment.production) {
      // Ensure update checks actually run in-app, not only when manually triggered.
      this.swUpdateService.checkForUpdatesNow();
      this.checkForUpdates();
      const updateTimer = window.setInterval(
        () => this.checkForUpdates(),
        5 * 60 * 1000,
      );
      this.destroyRef.onDestroy(() => window.clearInterval(updateTimer));
    }

    // Detect iOS installation (Add to Home Screen)
    const isIOSInstalled = () => {
      return (
        (navigator as StandaloneNavigator).standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches
      );
    };

    // Listen for Android install prompt.
    // Do not suppress the browser prompt globally; Admin can still intercept for manual testing.
    const onBeforeInstallPrompt = (event: Event) => {
      (window as MtbInstallWindow).__mtbInstallPrompt = event;
    };
    const onAppInstalled = () => {
      (window as MtbInstallWindow).__mtbInstallPrompt = null;
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    });

    // Store iOS installation state
    (window as MtbInstallWindow).__mtbIOSInstalled = isIOSInstalled();

    // Restore language from persisted store (defaults to 'nl' for new users)
    this.store
      .select(appFeature.selectLanguage)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lang) => {
        if (lang) {
          this._translate.use(lang);
        }
      });

    this.store
      .select(appFeature.selectOnboardingDone)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((done) => (this.showOnboarding = !done));

    // Navigate to chart when user taps a push notification (signal click)
    if ('serviceWorker' in navigator) {
      // Notify service worker about disablePush setting
      navigator.serviceWorker.ready
        .then((registration) => {
          registration.active?.postMessage({
            type: 'mtb-push-disabled',
            disabled: environment.disablePush,
          });
          debugLog('[App] Notified SW: disablePush =', environment.disablePush);
        })
        .catch((err) => console.warn('[App] SW ready failed:', err));

      const onSwMessage = (event: MessageEvent) => {
        const msg = event?.data;
        if (!msg || msg.type !== 'mtb-sw-notificationclick') return;

        (async () => {
          const rawUrl: string = msg.url || '';
          const msgExchangeId = Number(msg.exchangeId || 0);
          const msgSymbol = String(msg.symbol || '')
            .trim()
            .toUpperCase();

          try {
            const parsed = new URL(rawUrl || '/', window.location.origin);
            const urlExchangeId = Number(
              parsed.searchParams.get('exchangeId') || 0,
            );
            const targetExchangeId =
              msgExchangeId > 0 ? msgExchangeId : urlExchangeId;
            const symbolFromPath = (() => {
              const parts = parsed.pathname.split('/').filter(Boolean);
              const chartIdx = parts.findIndex(
                (p) => p.toLowerCase() === 'chart',
              );
              if (chartIdx >= 0 && parts.length > chartIdx + 1) {
                return decodeURIComponent(parts[chartIdx + 1] || '')
                  .trim()
                  .toUpperCase();
              }
              return '';
            })();
            const targetSymbol = msgSymbol || symbolFromPath;

            if (targetExchangeId > 0) {
              await this.setSelectedExchangeById(targetExchangeId);
            }

            let path = parsed.pathname + parsed.search + parsed.hash;
            const base =
              document.querySelector('base')?.getAttribute('href') || '/';
            const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
            if (cleanBase && path.startsWith(cleanBase)) {
              path = path.slice(cleanBase.length) || '/';
            }

            if (targetSymbol) {
              await this._router.navigate(['/chart', targetSymbol, '1h']);
              return;
            }

            await this._router.navigateByUrl(path || '/');
          } catch {
            this._router.navigateByUrl('/');
          }
        })();
      };
      navigator.serviceWorker.addEventListener('message', onSwMessage);
      this.destroyRef.onDestroy(() =>
        navigator.serviceWorker.removeEventListener('message', onSwMessage),
      );
    }
  }

  checkForUpdates(): void {
    this._versionService.checkRemoteVersion();
  }

  useLanguage(language: string): void {
    this.store.dispatch(AppActions.setLanguage({ language }));
  }

  onOnboardingCompleted(): void {
    this.showOnboarding = false;
  }

  private async migrateLegacyServiceWorkerRegistration(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      let migrated = false;

      for (const reg of registrations) {
        const scriptUrl =
          reg.active?.scriptURL ||
          reg.waiting?.scriptURL ||
          reg.installing?.scriptURL ||
          '';
        if (!scriptUrl) continue;

        // One-time migration: old default ngsw-worker lacks custom push handlers.
        if (scriptUrl.includes('/ngsw-worker.js')) {
          const ok = await reg.unregister();
          if (ok) migrated = true;
        }
      }

      if (migrated) {
        // Prevent reload loops on devices where legacy registrations persist unexpectedly.
        const alreadyReloaded =
          sessionStorage.getItem(this.swMigrationReloadKey) === '1';
        if (!alreadyReloaded) {
          sessionStorage.setItem(this.swMigrationReloadKey, '1');
          window.location.reload();
        }
      }
    } catch (err) {
      console.warn('[SW] Legacy migration failed', err);
    }
  }

  private async setSelectedExchangeById(exchangeId: number): Promise<void> {
    if (!exchangeId || exchangeId <= 0) return;
    try {
      const exchanges = await firstValueFrom(this.chartService.getExchanges());
      const selected = (exchanges || []).find((ex) => ex.Id === exchangeId);
      if (!selected) return;
      this.settings.setSelectedExchange(selected);
    } catch (err) {
      console.warn(
        '[App] Failed to apply exchange from notification payload',
        err,
      );
    }
  }
}
