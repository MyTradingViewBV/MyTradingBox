import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';

// Angular Material removed
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { FormsModule } from '@angular/forms';
import { ThemeService } from 'src/app/helpers/theme.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { Router, RouterModule } from '@angular/router';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { AuthService } from 'src/app/modules/shared/services/services/authService';
import { NotificationService } from 'src/app/helpers/notification.service';
import { NotificationLogService } from 'src/app/helpers/notificationLog.service';
import { Subject, switchMap, tap, takeUntil } from 'rxjs';
import { FooterComponent } from '../footer/footer-compenent';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';

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
          value: 'v0.3.1',
          icon: 'smartphone',
        },
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
    private _authService: AuthService,
  ) {}

  showNotificationLog = false;
  notificationEntries: string[] = [];
  snackbarMessage: string | null = null;
  snackbarTimer: any;
  private destroyed$ = new Subject<void>();
  private swPollTimer: any;
  private beforeInstallHandler?: (event: Event) => void;
  private appInstalledHandler?: () => void;
  // Contact panel
  showContact = false;
  // Notification/Service Worker status
  swRegistered = false;
  swReady = false;
  notificationPermission: NotificationPermission | 'unsupported' = 'default';
  isSecure = false;
  swControllingPage = false;
  swScope = '';
  canInstall = false;
  isInstalled = false;
  private installPromptEvent: any = null;
  installDebug = {
    hasPrompt: false,
    promptPlatform: '',
    relatedAppsCount: 0,
    isSecure: false,
    hasSwApi: false,
    hasController: false,
    manifestOk: false,
    manifestUrl: '',
    displayMode: '',
    userAgent: '',
    error: '',
  };

  ngOnInit(): void {
    this.isInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      !!(navigator as any).standalone;
    const existingPrompt = (window as any).__mtbInstallPrompt;
    if (existingPrompt) {
      this.installPromptEvent = existingPrompt;
      this.canInstall = true;
    }
    this.beforeInstallHandler = (event: Event) => {
      event.preventDefault();
      this.installPromptEvent = event as any;
      this.canInstall = true;
      (window as any).__mtbInstallPrompt = this.installPromptEvent;
      this._cdr.detectChanges();
    };
    this.appInstalledHandler = () => {
      this.canInstall = false;
      this.installPromptEvent = null;
      (window as any).__mtbInstallPrompt = null;
      this.isInstalled = true;
      this._cdr.detectChanges();
    };
    window.addEventListener('beforeinstallprompt', this.beforeInstallHandler);
    window.addEventListener('appinstalled', this.appInstalledHandler);
    this.refreshInstallDebug();
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
    this._notificationLog.entries$
      .pipe(takeUntil(this.destroyed$))
      .subscribe((entries) => {
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
    // Symbols list and favorites are handled in Watchlist
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

  toggleLogPanel(): void {
    this.showNotificationLog = !this.showNotificationLog;
  }
  clearNotificationLog(): void {
    this._notificationLog.clear();
  }

  toggleContact(): void {
    this.showContact = !this.showContact;
  }

  clearStorage(): void {
    try {
      // Clear NgRx slices via actions
      this._appService.clearAppState();
      this._settingsService.dispatchAppAction(SettingsActions.clear());
      // Optionally clear any non-NgRx cached entries
      try {
        localStorage.removeItem('appState');
      } catch {}
      try {
        localStorage.removeItem('settingsState');
      } catch {}
      // Provide user feedback
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
    }, 4000); // 4s display
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
      this.swControllingPage = false;
      this.swScope = '';
      if ('serviceWorker' in navigator) {
        try {
          const base =
            document.querySelector('base')?.getAttribute('href') || '/';
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            this.swRegistered = true;
            this.swScope = reg.scope || '';
          } else {
            // Enumerate all registrations (Chrome supports this) to see if scope mismatch
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) {
              if (r.scope.endsWith(base) || r.scope.includes(base)) {
                this.swRegistered = true;
                this.swScope = r.scope || '';
                break;
              }
            }
          }
          const ready: any = (navigator.serviceWorker as any).ready;
          this.swReady = !!ready;
          this.swControllingPage = !!navigator.serviceWorker.controller;
        } catch {}
      }
      this.refreshInstallDebug();
    } finally {
      // Rely on Angular's default change detection to reflect status changes.
    }
  }

  async refreshInstallDebug(): Promise<void> {
    try {
      this.installDebug.userAgent = navigator.userAgent;
      this.installDebug.isSecure = !!(window as any).isSecureContext;
      this.installDebug.hasSwApi = 'serviceWorker' in navigator;
      this.installDebug.hasController = !!(navigator as any).serviceWorker?.controller;

      // display-mode: browser/standalone/minimal-ui/fullscreen
      const dm = [
        'standalone',
        'fullscreen',
        'minimal-ui',
        'browser',
      ].find((m) => window.matchMedia(`(display-mode: ${m})`).matches);
      this.installDebug.displayMode = dm || '';

      const prompt =
        this.installPromptEvent || (window as any).__mtbInstallPrompt;
      this.installDebug.hasPrompt = !!prompt;
      this.installDebug.promptPlatform = (prompt as any)?.platforms?.join?.(',') || '';
      this.installDebug.relatedAppsCount =
        Array.isArray((prompt as any)?.userChoice) ? (prompt as any).userChoice.length : 0;

      // Manifest check (this is what Chrome uses for installability)
      const manifestLink = document.querySelector(
        'link[rel="manifest"]',
      ) as HTMLLinkElement | null;
      const manifestHref = manifestLink?.href || '';
      this.installDebug.manifestUrl = manifestHref;
      if (manifestHref) {
        try {
          const resp = await fetch(manifestHref, { cache: 'no-store' });
          if (resp.ok) {
            const json: any = await resp.json();
            const hasName = !!(json?.name || json?.short_name);
            const hasIcons = Array.isArray(json?.icons) && json.icons.length > 0;
            const hasStartUrl = !!json?.start_url;
            const hasDisplay = !!json?.display;
            this.installDebug.manifestOk =
              Boolean(hasName && hasIcons && hasStartUrl && hasDisplay);
          } else {
            this.installDebug.manifestOk = false;
          }
        } catch {
          this.installDebug.manifestOk = false;
        }
      } else {
        this.installDebug.manifestOk = false;
      }

      this.installDebug.error = '';
    } catch (e: any) {
      this.installDebug.error = e?.message ?? String(e);
    }
  }

  async debugInstallNow(): Promise<void> {
    await this.refreshSwStatus();
    await this.refreshInstallDebug();
    const dbg = this.installDebug;
    this._notificationLog.add(
      `[InstallDebug] secure=${dbg.isSecure} swApi=${dbg.hasSwApi} controller=${dbg.hasController} swScope=${this.swScope} manifestOk=${dbg.manifestOk} dm=${dbg.displayMode} hasPrompt=${dbg.hasPrompt}`,
    );
    if (!dbg.isSecure) this._notificationLog.add('[InstallDebug] Not secure context');
    if (!dbg.hasSwApi) this._notificationLog.add('[InstallDebug] No serviceWorker API');
    if (!dbg.hasController) this._notificationLog.add('[InstallDebug] No SW controller (try refresh)');
    if (!dbg.manifestOk) this._notificationLog.add(`[InstallDebug] Manifest invalid/unreachable: ${dbg.manifestUrl || 'missing'}`);
    if (!dbg.hasPrompt) this._notificationLog.add('[InstallDebug] beforeinstallprompt not fired yet (Chrome not installable or suppressed)');
  }

  async registerServiceWorker(): Promise<void> {
    // Manual registration removed to avoid multiple service workers
    // Angular's ServiceWorkerModule now registers `custom-sw.js` automatically when enabled.
    this._notificationLog.add(
      'Manual service worker registration is disabled. Ensure ServiceWorkerModule is enabled in environment and build in production mode.',
    );
    await this.refreshSwStatus();
  }

  /**
   * Request notification permission, subscribe to Web Push, and send subscription to API.
   * Pass an access token if available; otherwise it will try to fetch from AppService if supported.
   */
  async enableWebPush(accessToken?: string): Promise<void> {
    try {
      // 1) Request permission
      const permission = await Notification.requestPermission();
      this._notificationLog.add(`Notification permission: ${permission}`);
      if (permission !== 'granted') {
        return;
      }

      // 2) Ensure SW is ready/registered
      const registration = await navigator.serviceWorker.ready;
      if (!registration) {
        this._notificationLog.add('Service worker not ready: cannot subscribe');
        return;
      }

      // 3) Get VAPID public key from AuthService
      let publicKey = '';
      try {
        publicKey = await this._authService.getVapidPublicKey();
      } catch (err: any) {
        this._notificationLog.add(
          `Failed to fetch VAPID key: ${err?.message ?? err}`,
        );
        return;
      }
      if (!publicKey) {
        this._notificationLog.add('No publicKey available for Web Push');
        console.warn('No publicKey available for Web Push');
        return;
      }

      // 4) Subscribe to push (reuse existing if available)
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const appServerKey = this.urlBase64ToUint8Array(publicKey);
        // Convert to a plain ArrayBuffer for compatibility with various TS lib expectations
        const applicationServerKey = appServerKey.buffer.slice(appServerKey.byteOffset, appServerKey.byteOffset + appServerKey.byteLength) as ArrayBuffer;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        this._notificationLog.add('Created new Push subscription');
      } else {
        this._notificationLog.add('Reusing existing Push subscription');
      }

      // 5) Prepare payload for backend
      const endpoint = subscription.endpoint;
      const p256dh = this.arrayBufferKeyToBase64(subscription.getKey('p256dh'));
      const auth = this.arrayBufferKeyToBase64(subscription.getKey('auth'));

      // 6) Build dynamic tags (exchange, symbol, type)
      const tags: string[] = [];
      const ex: any = this.selectedExchange;
      if (ex) {
        if (ex.Id != null) tags.push(`exchange_id:${ex.Id}`);
        else if (ex.Name) tags.push(`exchange:${(ex.Name as string).trim()}`);
      }
      // Symbol selection moved to Watchlist; no symbol tag here
      // Default type tag to mirror your example (can be customized in UI later)
      tags.push('type:divergence');
      // 6) Send subscription to API via AuthService
      let token: string | undefined;
      try {
        token = accessToken || (await this._authService.getValidAccessToken());
      } catch (err: any) {
        this._notificationLog.add(
          `No access token available: ${err?.message ?? err}`,
        );
        console.warn(
          '[Settings] No access token available for subscribe request',
        );
        return;
      }
      try {
        await this._authService.subscribeWebPush(
          { endpoint, p256dh, auth, tags },
          token,
        );
      } catch (err: any) {
        this._notificationLog.add(`Subscribe failed: ${err?.message ?? err}`);
        return;
      }

      this._notificationLog.add('Web Push subscription sent to API');
      this._notification.requestAndShow('Push enabled', {
        body: 'You will receive notifications from the server.',
        icon: 'assets/icons/icon-192x192.png',
      });
    } catch (e: any) {
      this._notificationLog.add(`Enable Web Push error: ${e?.message ?? e}`);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  private arrayBufferKeyToBase64(key: ArrayBuffer | null): string {
    if (!key) return '';
    const bytes = new Uint8Array(key);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
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
        this._notificationLog.add(
          `Service worker detected after ${attempts} poll attempts`,
        );
        clearInterval(this.swPollTimer);
      } else if (attempts % 5 === 0) {
        this._notificationLog.add(
          `SW poll attempt ${attempts}: still not registered`,
        );
      }
      if (attempts > 30) {
        // ~60s at 2s interval
        this._notificationLog.add('Stopped SW polling (timeout)');
        clearInterval(this.swPollTimer);
      }
    }, 2000);
  }

  ngOnDestroy(): void {
    if (this.beforeInstallHandler) {
      window.removeEventListener(
        'beforeinstallprompt',
        this.beforeInstallHandler,
      );
    }
    if (this.appInstalledHandler) {
      window.removeEventListener('appinstalled', this.appInstalledHandler);
    }
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

  async promptInstall(): Promise<void> {
    if (!this.installPromptEvent) {
      this.installPromptEvent = (window as any).__mtbInstallPrompt;
    }
    if (!this.installPromptEvent) return;
    try {
      await this.installPromptEvent.prompt();
      const choice = await this.installPromptEvent.userChoice;
      this._notificationLog.add(
        `Install prompt result: ${choice?.outcome ?? 'unknown'}`,
      );
    } catch (e: any) {
      this._notificationLog.add(
        `Install prompt failed: ${e?.message ?? e}`,
      );
    } finally {
      this.canInstall = false;
      this.installPromptEvent = null;
      (window as any).__mtbInstallPrompt = null;
    }
  }

  // Symbols UI moved to Watchlist; no symbol helpers here
}
