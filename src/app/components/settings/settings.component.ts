import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';

// Angular Material removed
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { FormsModule } from '@angular/forms';
import { ThemeService } from 'src/app/helpers/theme.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { Router, RouterModule } from '@angular/router';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { NotificationService } from 'src/app/helpers/notification.service';
import { NotificationLogService } from 'src/app/helpers/notificationLog.service';
import { Subject, switchMap, tap, takeUntil } from 'rxjs';
import { FooterComponent } from '../footer/footer-compenent';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, RouterModule, FooterComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, OnDestroy {
  exchanges: Exchange[] = [];
  selectedExchange = new Exchange();
  // Symbol selection moved to Watchlist
  userProfile = { name: 'John Trader', email: 'john.trader@email.com' };
  adminModeEnabled = false;

  settingsSections: Array<{
    title: string;
    items: Array<{
      label: string;
      icon?: string; // using simple icon class names or svg refs
      toggle?: boolean;
      enabled?: boolean;
      action?: boolean;
      value?: string;
    }>;
  }> = [
    {
      title: 'Account',
      items: [
        { label: 'Profile Settings', action: true, icon: 'user' },
        { label: 'Security & Privacy', action: true, icon: 'shield' },
        { label: 'Payment Methods', action: true, icon: 'card' },
        { label: 'Two-Factor Auth', action: true, icon: 'lock' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { label: 'Admin Mode', toggle: true, enabled: false, icon: 'shield' },
        {
          label: 'Show Onboarding Wizard',
          toggle: true,
          enabled: false,
          icon: 'info',
        },
        { label: 'Trade Alerts', toggle: true, enabled: true, icon: 'bell' },
        { label: 'Price Alerts', toggle: true, enabled: true, icon: 'bell' },
        { label: 'News Updates', toggle: true, enabled: false, icon: 'bell' },
        { label: 'Dark Mode', toggle: true, enabled: true, icon: 'moon' },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Language', action: true, value: 'English', icon: 'globe' },
        {
          label: 'App Version',
          action: true,
          value: 'v0.3.4',
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

  constructor() {}

  private destroyed$ = new Subject<void>();

  ngOnInit(): void {
    // Initialize toggles from store
    this._settingsService
      .getTradeAlertsEnabled()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((v) => {
        const item = this.settingsSections[1].items.find(
          (i) => i.label === 'Trade Alerts',
        );
        if (item) item.enabled = !!v;
      });
    this._settingsService
      .getPriceAlertsEnabled()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((v) => {
        const item = this.settingsSections[1].items.find(
          (i) => i.label === 'Price Alerts',
        );
        if (item) item.enabled = !!v;
      });
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
      .getAdminModeEnabled()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((enabled) => {
        const adminItem = this.settingsSections[1].items.find(
          (i) => i.label === 'Admin Mode',
        );
        if (typeof enabled === 'boolean') {
          this.adminModeEnabled = enabled;
          if (adminItem) adminItem.enabled = enabled;
        }
      });

    this._settingsService
      .getOnboardingCompleted()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((completed) => {
        const item = this.settingsSections[2].items.find(
          (i) => i.label === 'Show Onboarding Wizard',
        );
        if (item) item.enabled = !completed; // enabled means show onboarding
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
  setTheme(themeName: 'dark'): void {
    this.theme.applyTheme(themeName);
  }

  isActive(themeName: 'dark'): boolean {
    return this.theme.activeTheme === themeName;
  }

  cycleTheme(): void {
    this.theme.cycleTheme();
  }

  toggleItem(sectionIndex: number, itemIndex: number): void {
    const item = this.settingsSections[sectionIndex].items[itemIndex];
    if (!item.toggle) return;
    item.enabled = !item.enabled;
    if (item.label === 'Admin Mode') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setAdminModeEnabled({ enabled: item.enabled ?? false }),
      );
      this._notificationLog.add(
        `Admin Mode ${item.enabled ? 'enabled' : 'disabled'}`,
      );
      return;
    }
    if (item.label === 'Dark Mode') {
      // Persist to store and apply theme
      this._settingsService.dispatchAppAction(
        SettingsActions.setDarkModeEnabled({ enabled: item.enabled ?? true }),
      );
      this.cycleTheme();
      return;
    }
    if (item.label === 'Key Zones') {
      return;
    }
    if (item.label === 'Trade Alerts') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setTradeAlertsEnabled({
          enabled: item.enabled ?? true,
        }),
      );
      if (item.enabled) {
        this._notificationLog.add(
          'Trade Alerts toggled ON - requesting notification',
        );
        this._notification.requestAndShow('Trade alerts enabled', {
          body: 'You will receive trade notifications.',
          icon: 'assets/icons/icon-192x192.png',
        });
      } else {
        this._notificationLog.add('Trade Alerts toggled OFF - no notification');
      }
      return;
    }
    if (item.label === 'Price Alerts') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setPriceAlertsEnabled({
          enabled: item.enabled ?? true,
        }),
      );
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
