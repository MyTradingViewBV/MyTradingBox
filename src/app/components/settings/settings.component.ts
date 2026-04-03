import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';

// Angular Material removed
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ThemeService } from 'src/app/helpers/theme.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { AppActions } from 'src/app/store/app/app.actions';
import { appFeature } from 'src/app/store/app/app.reducer';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { Router, RouterModule } from '@angular/router';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { NotificationService } from 'src/app/helpers/notification.service';
import { NotificationLogService } from 'src/app/helpers/notificationLog.service';
import { Subject, switchMap, tap, take, takeUntil } from 'rxjs';
import { Store } from '@ngrx/store';
import { VersionService } from 'src/app/helpers/version.service';
import { FooterComponent } from '../footer/footer-compenent';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { UiModeOverride } from 'src/app/store/settings/settings.reducer';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, FooterComponent, TranslateModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, OnDestroy {
  readonly releaseNotesRoute = '/settings/release-notes';
  exchanges: Exchange[] = [];
  selectedExchange = new Exchange();
  languageOptions = [
    { code: 'en', label: 'English' },
    { code: 'nl', label: 'Nederlands' },
  ];
  uiModeOptions = [
    { code: 'auto', label: 'Auto' },
    { code: 'web', label: 'Web' },
    { code: 'mobile', label: 'Mobile' },
  ];
  // Symbol selection moved to Watchlist
  userProfile = { name: 'John Trader', email: 'john.trader@email.com' };

  settingsSections: Array<{
    title: string;
    titleKey: string;
    items: Array<{
      label: string;
      labelKey: string;
      icon?: string;
      toggle?: boolean;
      enabled?: boolean;
      action?: boolean;
      value?: string;
      select?: boolean;
    }>;
  }> = [
    {
      title: 'Account',
      titleKey: 'SETTINGS.ACCOUNT',
      items: [
        { label: 'Profile Settings', labelKey: 'SETTINGS.PROFILE_SETTINGS', action: true, icon: 'user' },
        { label: 'Security & Privacy', labelKey: 'SETTINGS.SECURITY_PRIVACY', action: true, icon: 'shield' },
        { label: 'Payment Methods', labelKey: 'SETTINGS.PAYMENT_METHODS', action: true, icon: 'card' },
        { label: 'Two-Factor Auth', labelKey: 'SETTINGS.TWO_FACTOR_AUTH', action: true, icon: 'lock' },
      ],
    },
    {
      title: 'Preferences',
      titleKey: 'SETTINGS.PREFERENCES',
      items: [
        {
          label: 'Show Onboarding Wizard',
          labelKey: 'SETTINGS.SHOW_ONBOARDING',
          toggle: true,
          enabled: false,
          icon: 'info',
        },
        { label: 'Alerts', labelKey: 'SETTINGS.ALERTS', action: true, icon: 'bell' },
        { label: 'News Updates', labelKey: 'SETTINGS.NEWS_UPDATES', toggle: true, enabled: false, icon: 'bell' },
        { label: 'Dark Mode', labelKey: 'SETTINGS.DARK_MODE', toggle: true, enabled: true, icon: 'moon' },
      ],
    },
    {
      title: 'General',
      titleKey: 'SETTINGS.GENERAL',
      items: [
        { label: 'Language', labelKey: 'SETTINGS.LANGUAGE', select: true, value: 'en', icon: 'globe' },
        { label: 'Display Mode', labelKey: 'SETTINGS.DISPLAY_MODE', select: true, value: 'auto', icon: 'monitor' },
        {
          label: 'App Version',
          labelKey: 'SETTINGS.APP_VERSION',
          action: true,
          value: '',
          icon: 'smartphone',
        },
      ],
    },
  ];

  private readonly _settingsService = inject(SettingsService);
  private readonly _marketService = inject(ChartService);
  private readonly _cdr = inject(ChangeDetectorRef);
  public readonly theme = inject(ThemeService);
  private readonly _appService = inject(AppService);
  private readonly _router = inject(Router);
  private readonly _notification = inject(NotificationService);
  private readonly _notificationLog = inject(NotificationLogService);
  private readonly _store = inject(Store);
  private readonly _versionService = inject(VersionService);
  private readonly _translate = inject(TranslateService);

  readonly isAdmin = toSignal(this._appService.isAdmin(), { initialValue: false });

  constructor() {}

  private destroyed$ = new Subject<void>();

  ngOnInit(): void {
    // Populate profile from JWT and restrict admin-only settings sections
    this._appService.getUserEmail().pipe(take(1)).subscribe((email) => {
      if (email) {
        this.userProfile = { name: email, email };
        this._cdr.detectChanges();
      }
    });

    this._appService.isAdmin().pipe(take(1)).subscribe((admin) => {
      if (!admin) {
        // Hide notification-related items from non-admins
        const notificationLabels = new Set(['Alerts', 'News Updates']);
        for (const section of this.settingsSections) {
          section.items = section.items.filter((item) => !notificationLabels.has(item.label));
        }
        this._cdr.detectChanges();
      }
    });

    // Load version from version.json (sourced from package.json)
    this._versionService.loadLocalVersion().then((v) => {
      const item = this.settingsSections[2].items.find(
        (i) => i.label === 'App Version',
      );
      if (item) item.value = v ? `v${v}` : '';
      this._cdr.detectChanges();
    });

    // Initialize toggles from store
    // Alerts toggles moved to dedicated page
    this._settingsService
      .getNewsUpdatesEnabled()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((v) => {
        const item = this.settingsSections[1].items.find(
          (i) => i.label === 'News Updates',
        );
        if (item) item.enabled = !!v;
      });
    this._settingsService
      .getDarkModeEnabled()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((v) => {
        const item = this.settingsSections[1].items.find(
          (i) => i.label === 'Dark Mode',
        );
        if (item) item.enabled = !!v;
      });
    // Initialize Admin Mode from store (persisted via NgRx localStorage meta-reducer)
    this._settingsService
      .getOnboardingCompleted()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((completed) => {
        const item = this.settingsSections[1].items.find(
          (i) => i.label === 'Show Onboarding Wizard',
        );
        if (item) item.enabled = !completed; // enabled means show onboarding
        this._cdr.detectChanges();
      });
    // Initialize language value from store
    this._store
      .select(appFeature.selectLanguage)
      .pipe(takeUntil(this.destroyed$))
      .subscribe((lang) => {
        const item = this.settingsSections[2].items.find(
          (i) => i.label === 'Language',
        );
        if (item) item.value = lang;
        this._cdr.detectChanges();
      });

    this._settingsService
      .getUiModeOverride()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((mode) => {
        const item = this.settingsSections[2].items.find(
          (i) => i.label === 'Display Mode',
        );
        if (item) item.value = mode;
        this._cdr.detectChanges();
      });

    // Load exchanges first, then align selected exchange from store to list instance for proper select binding
    this._marketService
      .getExchanges()
      .pipe(
        tap((exchanges) => {
          this.exchanges = exchanges || [];
          console.log('[Settings] Exchanges loaded:', this.exchanges);
        }),
        switchMap(() => this._settingsService.getSelectedExchange()),
      )
      .pipe(takeUntil(this.destroyed$))
      .subscribe((exchange) => {
        console.log('[Settings] Store selectedExchange emitted:', exchange);
        if (exchange) {
          console.log(
            '[Settings] Attempting to map store exchange to list instance...',
          );
          const match = this.exchanges.find((ex: any) => {
            if ((exchange as any).Id != null && ex.Id === (exchange as any).Id)
              return true;
            if ((exchange as any).Name && ex.Name === (exchange as any).Name)
              return true;
            return false;
          });
          if (match) {
            this.selectedExchange = match as Exchange;
            console.log(
              '[Settings] Mapped to list instance:',
              this.selectedExchange,
            );
          } else if (this.exchanges.length) {
            this.selectedExchange = this.exchanges[0] as Exchange;
            this._settingsService.dispatchAppAction(
              SettingsActions.setSelectedExchange({
                exchange: this.selectedExchange,
              }),
            );
            // Symbol management moved to Watchlist; no symbol list loading here
            console.warn(
              '[Settings] Store exchange not found in list; falling back to first:',
              this.selectedExchange,
            );
          } else {
            this.selectedExchange = exchange;
            console.warn(
              '[Settings] Exchanges list empty; keeping store object as selection:',
              this.selectedExchange,
            );
          }
          // Symbol management moved to Watchlist
          console.log(
            '[Settings] Dropdown selection set to:',
            this.selectedExchange,
          );
        } else {
          // No exchange in store: default to first available and dispatch via NgRx
          if (this.exchanges.length) {
            this.selectedExchange = this.exchanges[0] as Exchange;
            this._settingsService.dispatchAppAction(
              SettingsActions.setSelectedExchange({
                exchange: this.selectedExchange,
              }),
            );
            // Symbol management moved to Watchlist
            console.log(
              '[Settings] Store empty; set first exchange:',
              this.selectedExchange,
            );
          }
        }
      });
  }

  // Removed duplicate ngOnDestroy; consolidated at bottom

  getExchanges(): void {
    this._marketService.getExchanges().subscribe((exchanges) => {
      if (exchanges) {
        this.exchanges = exchanges;
      }
    });
  }

  // Symbol selection UI removed

  exchangeChange(exchange: Exchange): void {
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedExchange({ exchange: exchange }),
    );
  }

  // Symbol panel removed

  // Symbol selection removed

  // Theme helpers
  setTheme(themeName: 'dark' | 'light'): void {
    this.theme.applyTheme(themeName);
  }

  isActive(themeName: 'dark' | 'light'): boolean {
    return this.theme.activeTheme === themeName;
  }

  cycleTheme(): void {
    this.theme.cycleTheme();
  }

  toggleItem(sectionIndex: number, itemIndex: number, fromInput = false): void {
    const item = this.settingsSections[sectionIndex].items[itemIndex];
    if (item.label === 'Alerts') {
      this._router.navigate(['/settings/alerts']);
      return;
    }
    if (item.label === 'App Version') {
      this._router.navigate([this.releaseNotesRoute]);
      return;
    }
    if (!item.toggle) return;
    if (!fromInput) {
      item.enabled = !item.enabled;
    }
    if (item.label === 'Dark Mode') {
      // Persist to store and apply theme
      const darkEnabled = item.enabled ?? true;
      this._settingsService.dispatchAppAction(
        SettingsActions.setDarkModeEnabled({ enabled: darkEnabled }),
      );
      this.setTheme(darkEnabled ? 'dark' : 'light');
      return;
    }
    if (item.label === 'Key Zones') {
      return;
    }
    if (item.label === 'News Updates') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setNewsUpdatesEnabled({
          enabled: item.enabled ?? false,
        }),
      );
      return;
    }
    if (item.label === 'Show Onboarding Wizard') {
      // enabled means show wizard -> store completed = !enabled
      this._settingsService.dispatchAppAction(
        SettingsActions.setOnboardingCompleted({ completed: !item.enabled }),
      );
      return;
    }
  }

  onLanguageChange(lang: string): void {
    console.log('[Settings] onLanguageChange called with:', lang);
    this._translate
      .use(lang)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this._store.dispatch(AppActions.setLanguage({ language: lang }));
          this._cdr.detectChanges();
          console.log('[Settings] Applied and dispatched language:', lang);
        },
        error: (error) => {
          console.error('[Settings] Failed to apply language:', lang, error);
        },
      });
  }

  onUiModeChange(mode: string): void {
    this._settingsService.dispatchAppAction(
      SettingsActions.setUiModeOverride({ mode: mode as UiModeOverride }),
    );
    this._cdr.detectChanges();
  }

  // Key Zones nested UI bindings
  get keyZonesEnabled(): boolean {
    const kzItem = this.settingsSections[1].items.find(
      (i) => i.label === 'Key Zones',
    );
    return !!kzItem?.enabled;
  }

  clearStorage(): void {
    try {
      this._appService.clearAppState();
      this._settingsService.dispatchAppAction(SettingsActions.clear());
      try {
        localStorage.removeItem('appState');
      } catch {}
      try {
        localStorage.removeItem('settingsState');
      } catch {}
      this._notification.requestAndShow('Storage cleared', {
        body: 'Local storage has been reset.',
        icon: 'assets/icons/icon-192x192.png',
      });
      this._notificationLog.add('Local storage cleared via Settings button');
    } catch (e) {
      this._notificationLog.add(
        'Failed to clear storage: ' + (e as any)?.message,
      );
    }
  }

  ngOnDestroy(): void {
    try {
      this.destroyed$.next();
      this.destroyed$.complete();
    } catch {}
  }

  logout(): void {
    this._appService.logout();
    this._router.parseUrl('/login');
  }

  goToAdmin(): void {
    this._router.navigateByUrl('/admin');
  }
}
