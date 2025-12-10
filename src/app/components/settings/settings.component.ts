import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { FooterComponent } from '../footer/footer-compenent';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, FooterComponent],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit, OnDestroy {
  exchanges: Exchange[] = [];
  selectedExchange = new Exchange();
  symbols: SymbolModel[] = [];
  selectedSymbolName: string | null = null;
  favoriteSymbolName: string | null = null;
  displaySymbolsList: Array<{ name: string; value: string }> = [];
  symbolsPanelOpen = false;
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
        { label: 'Key Zones', toggle: true, enabled: true, icon: 'shield' },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Language', action: true, value: 'English', icon: 'globe' },
        {
          label: 'App Version',
          action: true,
          value: 'v0.2.0',
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
    private _keyZoneSettings: KeyZoneSettingsService,
  ) {}

  showNotificationLog = false;
  notificationEntries: string[] = [];
  snackbarMessage: string | null = null;
  snackbarTimer: any;
  private destroyed$ = new Subject<void>();
  private swPollTimer: any;
  // Contact panel
  showContact = false;
  // Notification/Service Worker status
  swRegistered = false;
  swReady = false;
  notificationPermission: NotificationPermission | 'unsupported' = 'default';
  isSecure = false;

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
    // Initialize Key Zones master toggle (store-backed)
    const kzItem = this.settingsSections[1].items.find(
      (i) => i.label === 'Key Zones',
    );
    if (kzItem) kzItem.enabled = this._keyZoneSettings.getSettings().enabled;
    // Attempt to discover available timeframes from initial data source
    // If chart service can provide them, set them; else they will be set later by chart component
    try {
      // Placeholder: if chart service has a method to get all key zones/timeframes
      // this._marketService.getKeyZonesTimeframes()?.subscribe(tfs => this._keyZoneSettings.setAvailableTimeframes(tfs));
    } catch {}
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
    this._settingsService
      .getSymbolsList()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((list) => {
        this.symbols = this.applyFavoritesToSymbols(list || []);
        // If there's a favorite, default select it in the combined dropdown
        if (
          this.favoriteSymbolName &&
          this.symbols.some((s) => s.SymbolName === this.favoriteSymbolName)
        ) {
          this.selectedSymbolName = this.favoriteSymbolName;
        } else if (!this.selectedSymbolName && this.symbols.length) {
          this.selectedSymbolName = this.symbols[0].SymbolName;
        }
        this.recomputeDisplaySymbols();
      });
    this._settingsService
      .getFavoriteSymbolName()
      .pipe(takeUntil(this.destroyed$))
      .subscribe((fav) => {
        this.favoriteSymbolName = fav ?? null;
        this.recomputeDisplaySymbols();
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
            // Load symbols for this exchange
            this._marketService
              .getSymbols()
              .pipe(takeUntil(this.destroyed$))
              .subscribe((syms) => {
                this.symbols = this.applyFavoritesToSymbols(syms || []);
                this._settingsService.dispatchAppAction(
                  SettingsActions.setSymbolsList({ symbols: this.symbols }),
                );
                this.recomputeDisplaySymbols();
              });
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
          // Load symbols for current exchange
          this._marketService
            .getSymbols()
            .pipe(takeUntil(this.destroyed$))
            .subscribe((syms) => {
              this.symbols = this.applyFavoritesToSymbols(syms || []);
              this._settingsService.dispatchAppAction(
                SettingsActions.setSymbolsList({ symbols: this.symbols }),
              );
              this.recomputeDisplaySymbols();
            });
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
            // Load symbols for first exchange
            this._marketService
              .getSymbols()
              .pipe(takeUntil(this.destroyed$))
              .subscribe((syms) => {
                this.symbols = this.applyFavoritesToSymbols(syms || []);
                this._settingsService.dispatchAppAction(
                  SettingsActions.setSymbolsList({ symbols: this.symbols }),
                );
                this.recomputeDisplaySymbols();
              });
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

  onSymbolDropdownChange(symbolName: string | null): void {
    this.selectedSymbolName = symbolName;
    // Update favorite to the selected option
    this._settingsService.dispatchAppAction(
      SettingsActions.setFavoriteSymbolName({ symbolName }),
    );
    // Also dispatch selected symbol object for downstream consumers
    const symbolObj =
      this.symbols.find((s) => s.SymbolName === symbolName) || null;
    if (symbolObj) {
      this._settingsService.dispatchAppAction(
        SettingsActions.setSelectedSymbol({ symbol: symbolObj }),
      );
    }
  }

  exchangeChange(exchange: Exchange): void {
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedExchange({ exchange: exchange }),
    );
  }

  toggleSymbolsPanel(): void {
    this.symbolsPanelOpen = !this.symbolsPanelOpen;
  }

  selectSymbol(symbolName: string): void {
    this.selectedSymbolName = symbolName;
    this.onSymbolDropdownChange(symbolName);
    // Close panel only on row click; star click is handled separately
    this.symbolsPanelOpen = false;
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
      this._keyZoneSettings.setEnabled(!!item.enabled);
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
      if ('serviceWorker' in navigator) {
        try {
          const base =
            document.querySelector('base')?.getAttribute('href') || '/';
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
      // Rely on Angular's default change detection to reflect status changes.
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
          this._notificationLog.add(
            `Failed to register ${script}: ${(e as any)?.message}`,
          );
        }
      }
    } catch (e) {
      this._notificationLog.add(
        'registerServiceWorker error: ' + (e as any)?.message,
      );
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

  // Cached list to avoid template function array recreation
  private recomputeDisplaySymbols(): void {
    const syms = this.symbols || [];
    this.displaySymbolsList = syms.map((s) => {
      const sym = (s.SymbolName || '').trim();
      const fav = !!(s as any).isFavorite;
      return {
        name: (fav ? '★ ' : '☆ ') + sym,
        value: sym,
      };
    });
  }

  isFavoriteSymbol(symbolName: string): boolean {
    const s = (this.symbols || []).find(
      (x) => (x.SymbolName || '').trim() === symbolName,
    );
    return !!(s as any)?.isFavorite;
  }

  toggleFavorite(symbolName: string, ev: MouseEvent): void {
    if (ev) ev.stopPropagation();

    const name = (symbolName || '').trim();
    if (!name) return;

    const idx = (this.symbols || []).findIndex(
      (x) => (x.SymbolName || '').trim() === name,
    );
    if (idx < 0) return;

    const current = this.symbols[idx] as any;
    const nextIsFavorite = !current.isFavorite;

    const updated = {
      ...this.symbols[idx],
      isFavorite: nextIsFavorite,
    } as SymbolModel & { isFavorite: boolean };

    // Replace immutably for change detection
    this.symbols = [
      ...this.symbols.slice(0, idx),
      updated,
      ...this.symbols.slice(idx + 1),
    ];

    // Persist favorites map to localStorage (rehydration source)
    const favMap = this.loadFavoriteMap();
    favMap[name] = nextIsFavorite;
    // Optional: remove false entries to keep it clean
    if (!nextIsFavorite) delete favMap[name];
    this.saveFavoriteMap(favMap);

    // Persist via NgRx/localStorage flow (your existing approach)
    this._settingsService.dispatchAppAction(
      SettingsActions.setSymbolsList({ symbols: this.symbols }),
    );

    this.recomputeDisplaySymbols();
  }

  trackBySymbolOption(
    index: number,
    item: { name: string; value: string },
  ): string {
    return item.value;
  }

  private readonly SYMBOL_FAV_STORAGE_KEY = 'symbolsFavorites';
  // You can change the key to match your app. This is a safe default.

  private loadFavoriteMap(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem(this.SYMBOL_FAV_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
      return {};
    } catch {
      return {};
    }
  }

  private saveFavoriteMap(map: Record<string, boolean>): void {
    try {
      localStorage.setItem(this.SYMBOL_FAV_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  }

  /** Merge favorites from localStorage into the symbols list (does not remove symbols). */
  private applyFavoritesToSymbols(symbols: SymbolModel[]): SymbolModel[] {
    const favMap = this.loadFavoriteMap();
    return (symbols || []).map((s) => {
      const name = (s.SymbolName || '').trim();
      const isFavorite = !!favMap[name];
      return { ...(s as any), isFavorite } as SymbolModel;
    });
  }
}
