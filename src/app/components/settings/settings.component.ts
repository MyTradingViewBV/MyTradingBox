import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// Angular Material removed
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { FormsModule } from '@angular/forms';
import { ThemeService } from 'src/app/helpers/theme.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { Router } from '@angular/router';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { NotificationService } from 'src/app/helpers/notification.service';
import { NotificationLogService } from 'src/app/helpers/notificationLog.service';
import { Subject, switchMap, tap, takeUntil } from 'rxjs';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { FooterComponent } from '../footer/footer-compenent';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FooterComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, OnDestroy {
  exchanges: Exchange[] = [];
  currencies = ['Euro', 'Dollar'];
  selectedExchange = new Exchange();
  selectedCurrency = 'Euro';
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
          { label: 'Show Onboarding Wizard', toggle: true, enabled: false, icon: 'info' },
        { label: 'Trade Alerts', toggle: true, enabled: true, icon: 'bell' },
        { label: 'Price Alerts', toggle: true, enabled: true, icon: 'bell' },
        { label: 'News Updates', toggle: true, enabled: false, icon: 'bell' },
        { label: 'Dark Mode', toggle: true, enabled: true, icon: 'moon' },
        { label: 'Key Zones', toggle: true, enabled: true, icon: 'shield' },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Language', action: true, value: 'English', icon: 'globe' },
        { label: 'App Version', action: true, value: 'v0.1.17', icon: 'smartphone' },
      ],
    },
  ];

  constructor(
    private _settingsService: SettingsService,
    private _marketService: ChartService,
    private _cdr: ChangeDetectorRef,
    public theme: ThemeService,
    private _appService: AppService,
    private _router: Router,
    private _notification: NotificationService,
    private _notificationLog: NotificationLogService,
    private _keyZoneSettings: KeyZoneSettingsService,
  ) {}

  showNotificationLog = false;
  notificationEntries: string[] = [];
  snackbarMessage: string | null = null;
  snackbarTimer: any;
  private destroyed$ = new Subject<void>();
  private swPollTimer: any;
  // Notification/Service Worker status
  swRegistered = false;
  swReady = false;
  notificationPermission: NotificationPermission | 'unsupported' = 'default';
  isSecure = false;

  ngOnInit(): void {
        // Initialize toggles from store
        this._settingsService.getTradeAlertsEnabled().pipe(takeUntil(this.destroyed$)).subscribe((v) => {
          const item = this.settingsSections[1].items.find(i => i.label === 'Trade Alerts');
          if (item) item.enabled = !!v;
          this._cdr.detectChanges();
        });
        this._settingsService.getPriceAlertsEnabled().pipe(takeUntil(this.destroyed$)).subscribe((v) => {
          const item = this.settingsSections[1].items.find(i => i.label === 'Price Alerts');
          if (item) item.enabled = !!v;
          this._cdr.detectChanges();
        });
        this._settingsService.getNewsUpdatesEnabled().pipe(takeUntil(this.destroyed$)).subscribe((v) => {
          const item = this.settingsSections[1].items.find(i => i.label === 'News Updates');
          if (item) item.enabled = !!v;
          this._cdr.detectChanges();
        });
        this._settingsService.getDarkModeEnabled().pipe(takeUntil(this.destroyed$)).subscribe((v) => {
          const item = this.settingsSections[1].items.find(i => i.label === 'Dark Mode');
          if (item) item.enabled = !!v;
          this._cdr.detectChanges();
        });
        // Initialize Admin Mode from store (persisted via NgRx localStorage meta-reducer)
        this._settingsService.getAdminModeEnabled().pipe(takeUntil(this.destroyed$)).subscribe((enabled) => {
          const adminItem = this.settingsSections[1].items.find(i => i.label === 'Admin Mode');
          if (typeof enabled === 'boolean') {
            this.adminModeEnabled = enabled;
            if (adminItem) adminItem.enabled = enabled;
          }
          this._cdr.detectChanges();
        });
        this._settingsService.getOnboardingCompleted().pipe(takeUntil(this.destroyed$)).subscribe((completed) => {
          const item = this.settingsSections[2].items.find(i => i.label === 'Show Onboarding Wizard');
          if (item) item.enabled = !completed; // enabled means show onboarding
          this._cdr.detectChanges();
        });
          // Initialize Key Zones master toggle
          this._keyZoneSettings.load();
          const kzItem = this.settingsSections[1].items.find(i => i.label === 'Key Zones');
          if (kzItem) kzItem.enabled = this._keyZoneSettings.getSettings().enabled;
          // Attempt to discover available timeframes from initial data source
          // If chart service can provide them, set them; else they will be set later by chart component
          try {
            // Placeholder: if chart service has a method to get all key zones/timeframes
            // this._marketService.getKeyZonesTimeframes()?.subscribe(tfs => this._keyZoneSettings.setAvailableTimeframes(tfs));
          } catch {}
        this._notificationLog.entries$.pipe(takeUntil(this.destroyed$)).subscribe(entries => {
          this.notificationEntries = entries;
          // Show snackbar for newest entry if log panel not open
          if (entries && entries.length) {
            const latest = entries[0];
            if (!this.showNotificationLog) {
              this.showSnackbar(latest);
            }
          }
          // Avoid excessive change detection loops
          // this._cdr.detectChanges();
        });
        // Initialize status
        this.refreshSwStatus();
        this.startSwPoll();
        this._cdr.detectChanges();
    this._settingsService.getSelectedCurrency().pipe(takeUntil(this.destroyed$)).subscribe((currency) => {
      if (!currency) {
        this.currencyChange(this.selectedCurrency);
      } else {
        this.selectedCurrency = currency;
        this._cdr.detectChanges();
      }
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
        console.log('[Settings] Attempting to map store exchange to list instance...');
        const match = this.exchanges.find((ex: any) => {
          if ((exchange as any).Id != null && ex.Id === (exchange as any).Id) return true;
          if ((exchange as any).Name && ex.Name === (exchange as any).Name) return true;
          return false;
        });
        if (match) {
          this.selectedExchange = match as Exchange;
          console.log('[Settings] Mapped to list instance:', this.selectedExchange);
        } else if (this.exchanges.length) {
          this.selectedExchange = this.exchanges[0] as Exchange;
          this._settingsService.dispatchAppAction(
            SettingsActions.setSelectedExchange({ exchange: this.selectedExchange }),
          );
          console.warn('[Settings] Store exchange not found in list; falling back to first:', this.selectedExchange);
        } else {
          this.selectedExchange = exchange;
          console.warn('[Settings] Exchanges list empty; keeping store object as selection:', this.selectedExchange);
        }
        this._cdr.detectChanges();
        console.log('[Settings] Dropdown selection set to:', this.selectedExchange);
      } else {
        // No exchange in store: if we already have exchanges loaded, choose first and dispatch
        if (this.exchanges.length) {
          // Try restore from localStorage if available
          let restored: Exchange | null = null;
          try {
            const storedId = localStorage.getItem('selectedExchangeId');
            const storedName = localStorage.getItem('selectedExchangeName');
            console.log('[Settings] Attempting localStorage restore:', { storedId, storedName });
            if (storedId) {
              restored = (this.exchanges.find((ex: any) => String(ex.Id) === storedId) as Exchange) || null;
            }
            if (!restored && storedName) {
              restored = (this.exchanges.find((ex: any) => (ex.Name || '') === storedName) as Exchange) || null;
            }
          } catch {}
          this.selectedExchange = (restored as Exchange) || (this.exchanges[0] as Exchange);
          this._settingsService.dispatchAppAction(
            SettingsActions.setSelectedExchange({ exchange: this.selectedExchange }),
          );
          console.log('[Settings] Restored selection (store was empty):', this.selectedExchange);
          this._cdr.detectChanges();
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

  currencyChange(currency: string): void {
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedCurrency({ currency: currency }),
    );
  }

  exchangeChange(exchange: Exchange): void {
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedExchange({ exchange: exchange }),
    );
  }

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
        SettingsActions.setAdminModeEnabled({ enabled: item.enabled ?? false })
      );
      this._notificationLog.add(`Admin Mode ${item.enabled ? 'enabled' : 'disabled'}`);
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
      this._keyZoneSettings.setEnabled(!!item.enabled);
      return;
    }
    if (item.label === 'Trade Alerts') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setTradeAlertsEnabled({ enabled: item.enabled ?? true }),
      );
      if (item.enabled) {
        this._notificationLog.add('Trade Alerts toggled ON - requesting notification');
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
        SettingsActions.setPriceAlertsEnabled({ enabled: item.enabled ?? true }),
      );
      return;
    }
    if (item.label === 'News Updates') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setNewsUpdatesEnabled({ enabled: item.enabled ?? false }),
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
    const kzItem = this.settingsSections[1].items.find(i => i.label === 'Key Zones');
    return !!kzItem?.enabled;
  }

  get availableTimeframes(): string[] {
    return this._keyZoneSettings.getAvailableTimeframes();
  }

  get allTimeframesEnabled(): boolean {
    return this._keyZoneSettings.isAllTimeframesEnabled();
  }

  timeframeEnabled(tf: string): boolean {
    const settings = this._keyZoneSettings.getSettings();
    return !!settings.timeframes[tf];
  }

  onAllTimeframesToggle(event: Event): void {
    const target = event.target as HTMLInputElement;
    this._keyZoneSettings.setAllTimeframesEnabled(!!target.checked);
    this._cdr.detectChanges();
  }

  onTimeframeToggle(tf: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    this._keyZoneSettings.setTimeframeEnabled(tf, !!target.checked);
    this._cdr.detectChanges();
  }

  toggleLogPanel(): void {
    this.showNotificationLog = !this.showNotificationLog;
  }
  clearNotificationLog(): void {
    this._notificationLog.clear();
  }

  testNotification(): void {
    this._notificationLog.add('Manual test notification triggered');
    this._notification.requestAndShow('Test notification', {
      body: 'Manual test from settings.',
      icon: 'assets/icons/icon-192x192.png',
    });
  }

  private showSnackbar(message: string): void {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarMessage = message;
    this.snackbarTimer = setTimeout(() => {
      this.snackbarMessage = null;
      this._cdr.detectChanges();
    }, 4000); // 4s display
    this._cdr.detectChanges();
  }

  async refreshSwStatus(): Promise<void> {
    try {
      this.isSecure = !!(window as any).isSecureContext;
      if (!('Notification' in window)) {
        this.notificationPermission = 'unsupported';
      } else {
        this.notificationPermission = Notification.permission;
      }
      this.swRegistered = false;
      this.swReady = false;
      if ('serviceWorker' in navigator) {
        try {
          const base = (document.querySelector('base')?.getAttribute('href') || '/');
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            this.swRegistered = true;
          } else {
            // Enumerate all registrations (Chrome supports this) to see if scope mismatch
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) {
              if (r.scope.endsWith(base) || r.scope.includes(base)) {
                this.swRegistered = true;
                break;
              }
            }
          }
          const ready: any = (navigator.serviceWorker as any).ready;
          this.swReady = !!ready;
        } catch {}
      }
    } finally {
      try { this._cdr.detectChanges(); } catch {}
    }
  }

  async registerServiceWorker(): Promise<void> {
    try {
      const candidates = ['ngsw-worker.js', 'service-worker.js'];
      for (const script of candidates) {
        try {
          await navigator.serviceWorker.register(`/${script}`, { scope: '/' });
          this._notificationLog.add(`Registered service worker: ${script}`);
          break;
        } catch (e) {
          this._notificationLog.add(`Failed to register ${script}: ${(e as any)?.message}`);
        }
      }
    } catch (e) {
      this._notificationLog.add('registerServiceWorker error: ' + (e as any)?.message);
    }
    await this.refreshSwStatus();
  }

  private startSwPoll(): void {
    if (this.swPollTimer) {
      clearInterval(this.swPollTimer);
    }
    let attempts = 0;
    this.swPollTimer = setInterval(async () => {
      attempts++;
      await this.refreshSwStatus();
      if (this.swRegistered) {
        this._notificationLog.add(`Service worker detected after ${attempts} poll attempts`);
        clearInterval(this.swPollTimer);
      } else if (attempts % 5 === 0) {
        this._notificationLog.add(`SW poll attempt ${attempts}: still not registered`);
      }
      if (attempts > 30) { // ~60s at 2s interval
        this._notificationLog.add('Stopped SW polling (timeout)');
        clearInterval(this.swPollTimer);
      }
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.swPollTimer) {
      clearInterval(this.swPollTimer);
      this.swPollTimer = null;
    }
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
      this.snackbarTimer = null;
    }
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
