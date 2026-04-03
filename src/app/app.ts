 
import { Component, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { VersionService } from './helpers/version.service';
import { ThemeService } from './helpers/theme.service';
import { filter } from 'rxjs';

import { OnboardingComponent } from './components/onboarding/onboarding.component';
import { ToastComponent } from './components/shared/toast/toast.component';
import { Store } from '@ngrx/store';
import { SettingsService } from './modules/shared/services/services/settingsService';
import { NotificationService } from './helpers/notification.service';
import { SwUpdateService } from './helpers/sw-update.service';
import { appFeature } from './store/app/app.reducer';
import { AppActions } from './store/app/app.actions';
import { SettingsActions } from './store/settings/settings.actions';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, OnboardingComponent, ToastComponent],
  templateUrl: './app.html',
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
  private readonly darkModeMigrationKey = 'mtb.darkmode.default.v1';

  constructor() {
    this._translate.setDefaultLang('nl');
    // Language will be set from store in ngOnInit
  }

  async ngOnInit(): Promise<void> {
    this.ensureDarkModeDefaultOnce();
    this.theme.applyTheme(this.theme.activeTheme, false);
    this.settings.getDarkModeEnabled().subscribe((enabled) => {
      this.theme.applyTheme(enabled === false ? 'light' : 'dark');
    });
    await this._versionService.loadLocalVersion();
    await this.migrateLegacyServiceWorkerRegistration();

    if (environment.production) {
      // Ensure update checks actually run in-app, not only when manually triggered.
      this.swUpdateService.checkForUpdatesNow();
      this.checkForUpdates();
      window.setInterval(() => this.checkForUpdates(), 5 * 60 * 1000);
    }

    // Get the actual base path from document (works on any deployment path)
    const getBasePath = () => {
      const base = document.querySelector('base')?.getAttribute('href');
      if (!base) return '/';
      return base.endsWith('/') ? base : base + '/';
    };

    // Detect iOS installation (Add to Home Screen)
    const isIOSInstalled = () => {
      return (navigator as any).standalone === true || 
             window.matchMedia('(display-mode: standalone)').matches;
    };

    // Listen for Android install prompt
    window.addEventListener('beforeinstallprompt', (event: Event) => {
      event.preventDefault();
      (window as any).__mtbInstallPrompt = event as any;
    });

    window.addEventListener('appinstalled', () => {
      (window as any).__mtbInstallPrompt = null;
    });

    // Register custom service worker for push notifications (overrides Angular's default registration)
    // Works on both Android and iOS (after Add to Home Screen on iOS)
    if ('serviceWorker' in navigator && environment.production) {
      try {
        const basePath = getBasePath();
        const swPath = basePath + 'custom-sw.js';
        
        // Unregister the default ngsw-worker.js if registered
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          // Only unregister ngsw-worker.js, keep custom-sw.js if it's registered
          if (reg.active && reg.active.scriptURL.includes('ngsw-worker.js') && !reg.active.scriptURL.includes('custom-sw.js')) {
            await reg.unregister();
          }
        }
        
        // Register custom-sw.js which imports ngsw-worker.js and adds push notification support
        await navigator.serviceWorker.register(swPath, {
          scope: basePath,
        });
      } catch (e) {
        // Fallback: if custom-sw.js registration fails, continue with Angular's auto-registration
        console.warn('Custom SW registration failed, will use default SW', e);
      }
    }

    // Store iOS installation state
    (window as any).__mtbIOSInstalled = isIOSInstalled();

    // Restore language from persisted store (defaults to 'nl' for new users)
    this.store
      .select(appFeature.selectLanguage)
      .subscribe((lang) => {
        console.log('[App] selectLanguage emitted:', lang);
        if (lang) {
          this._translate.use(lang);
          console.log('[App] translate.use called with:', lang);
        }
      });

    this.store
      .select(appFeature.selectOnboardingDone)
      .subscribe((done) => (this.showOnboarding = !done));

    // 🔥 Fix initial render:
    const initial = this._router.url.split('?')[0].split('#')[0];
    // Footer visibility handled per component

    // 🔥 Handle future navigations:
    this._router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const cleanUrl = e.urlAfterRedirects.split('?')[0].split('#')[0];
        // Footer visibility handled per component
      });

    // Navigate to chart when user taps a push notification (signal click)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
        const msg = event?.data;
        if (!msg || msg.type !== 'mtb-sw-notificationclick') return;
        const rawUrl: string = msg.url || '';
        if (!rawUrl) return;
        try {
          const parsed = new URL(rawUrl, window.location.origin);
          let path = parsed.pathname + parsed.search + parsed.hash;
          // Strip the app base-href prefix (e.g. /MyTradingBox) so the Angular
          // router receives a root-relative path like /chart/BTCUSDT/1h
          const base = document.querySelector('base')?.getAttribute('href') || '/';
          const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
          if (cleanBase && path.startsWith(cleanBase)) {
            path = path.slice(cleanBase.length) || '/';
          }
          // authGuard on /chart/:symbol/:timeframe redirects to /login if token expired
          this._router.navigateByUrl(path || '/');
        } catch {
          this._router.navigateByUrl('/');
        }
      });
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

  private ensureDarkModeDefaultOnce(): void {
    try {
      const migrated = localStorage.getItem(this.darkModeMigrationKey) === '1';
      if (migrated) return;

      this.store.dispatch(SettingsActions.setDarkModeEnabled({ enabled: true }));
      this.theme.applyTheme('dark');
      localStorage.setItem(this.darkModeMigrationKey, '1');
    } catch {
      // Best-effort migration only.
    }
  }

  private async migrateLegacyServiceWorkerRegistration(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;

    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      let migrated = false;

      for (const reg of registrations) {
        const scriptUrl =
          reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || '';
        if (!scriptUrl) continue;

        // One-time migration: old default ngsw-worker lacks custom push handlers.
        if (scriptUrl.includes('/ngsw-worker.js')) {
          const ok = await reg.unregister();
          if (ok) migrated = true;
        }
      }

      if (migrated) {
        window.location.reload();
      }
    } catch (err) {
      console.warn('[SW] Legacy migration failed', err);
    }
  }
}
