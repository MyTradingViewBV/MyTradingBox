 
import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { VersionService } from './helpers/version.service';
import { ThemeService } from './helpers/theme.service';
import { filter } from 'rxjs';

import { OnboardingComponent } from './components/onboarding/onboarding.component';
import { Store } from '@ngrx/store';
import { SettingsService } from './modules/shared/services/services/settingsService';
import { HeartbeatService } from './components/admin/services/heartbeat.service';
import { NotificationService } from './helpers/notification.service';
import { appFeature } from './store/app/app.reducer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, OnboardingComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit {
  // Footer moved into feature components; not managed globally anymore
  // showFooter removed
  showOnboarding = false;
  protected title = 'pos';
  constructor(
    private _translate: TranslateService,
    private _versionService: VersionService,
    public theme: ThemeService,
    private _router: Router,
    private store: Store,
    private settings: SettingsService,
    private heartbeats: HeartbeatService,
    private notify: NotificationService,
  ) {
    _translate.setDefaultLang('nl');
    _translate.use('nl');
  }

  async ngOnInit(): Promise<void> {
    this.theme.applyTheme(this.theme.activeTheme, false);
    await this._versionService.loadLocalVersion();

    window.addEventListener('beforeinstallprompt', (event: Event) => {
      event.preventDefault();
      (window as any).__mtbInstallPrompt = event as any;
    });

    window.addEventListener('appinstalled', () => {
      (window as any).__mtbInstallPrompt = null;
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

    // Background heartbeat loading and failure notifications
    this.settings.getExchangeId$().subscribe((exchangeId) => {
      this.heartbeats.load(exchangeId);
    });
    this.heartbeats.items$.subscribe((items) => {
      const failed = items.filter((i) => !i.ok);
      if (failed.length > 0) {
        const title = 'Bot heartbeat issue';
        const names = failed.slice(0, 3).map((f) => f.name).join(', ');
        const body = failed.length > 1
          ? `${failed.length} bots failing: ${names}${failed.length > 3 ? '…' : ''}`
          : `${failed[0].name} failing heartbeat/messages`;
        this.notify.requestAndShow(title, { body });
      }
    });
  }

  checkForUpdates(): void {
    this._versionService.checkRemoteVersion();
  }

  useLanguage(language: string): void {
    this._translate.use(language);
  }

  onOnboardingCompleted(): void {
    this.showOnboarding = false;
  }
}
