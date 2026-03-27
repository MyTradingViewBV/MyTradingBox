import { ChangeDetectorRef, Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { HeartbeatService, HeartbeatItem } from './services/heartbeat.service';
import { LogsService, LogEntry } from './services/logs.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { ChartService, UpdateSymbolPayload } from 'src/app/modules/shared/services/http/chart.service';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { NotificationService } from 'src/app/helpers/notification.service';
import { NotificationLogService } from 'src/app/helpers/notificationLog.service';
import { PushNotificationService } from 'src/app/helpers/push-notification.service';
import { AuthService } from 'src/app/modules/shared/services/services/authService';
import { environment } from 'src/environments/environment';
import { TranslateModule } from '@ngx-translate/core';
import { SwUpdate } from '@angular/service-worker';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { RefreshButtonComponent } from '../shared/refresh-button/refresh-button.component';
import { FooterComponent } from '../footer/footer-compenent';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule, TranslateModule, BackButtonComponent, RefreshButtonComponent, FooterComponent],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
})
export class AdminComponent implements OnInit, OnDestroy {
  segments: Array<{ key: string; title: string }> = [
    { key: 'heartbeat', title: 'Heartbeat' },
    { key: 'logs', title: 'Logs' },
    { key: 'symbols', title: 'Symbols' },
    { key: 'notifications', title: 'Notifications' },
    { key: 'connectivity', title: 'Connectivity' },
  ];
  activeSegment = 'notifications';

  heartbeats: HeartbeatItem[] = [];
  logs: LogEntry[] = [];
  logFilter = '';
  symbols: SymbolModel[] = [];
  selectedSymbolId: number | null = null;
  symbolForm: UpdateSymbolPayload = {
    Id: 0,
    SymbolName: '',
    Active: true,
    RunStatus: '',
    Icon: '',
    ExchangeId: 0,
    IsProduction: true,
  };
  symbolActionMsg = '';
  savingSymbol = false;
  queueingSymbolTask = false;

  // Connectivity test state
  botTestResult: { status: 'idle' | 'testing' | 'ok' | 'fail'; latency: number; message: string } = { status: 'idle', latency: 0, message: '' };
  binanceTestResult: { status: 'idle' | 'testing' | 'ok' | 'fail'; latency: number; message: string } = { status: 'idle', latency: 0, message: '' };
  private binanceTestWs: WebSocket | null = null;

  // Notification / SW / Install debug state
  showNotificationLog = false;
  notificationEntries: string[] = [];
  snackbarMessage: string | null = null;
  snackbarTimer: any;
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

  // NGSW debug info
  swInfo: {
    enabled: boolean;
    isEnabled: boolean;
    swState: string;
    appVersion: string | null;
    hashTable: string | null;
    lastCheck: string | null;
    debugRaw: string | null;
  } = {
    enabled: false,
    isEnabled: false,
    swState: 'unknown',
    appVersion: null,
    hashTable: null,
    lastCheck: null,
    debugRaw: null,
  };

  private currentExchangeId = 0;
  private destroyed$ = new Subject<void>();
  private swPollTimer: any;
  private swMessageHandler?: (event: MessageEvent) => void;
  private beforeInstallHandler?: (event: Event) => void;
  private appInstalledHandler?: () => void;

  private hb = inject(HeartbeatService);
  private logsSvc = inject(LogsService);
  private settings = inject(SettingsService);
  private chartService = inject(ChartService);
  private router = inject(Router);
  private _cdr = inject(ChangeDetectorRef);
  private _http = inject(HttpClient);
  private _notification = inject(NotificationService);
  private _notificationLog = inject(NotificationLogService);
  private _pushService = inject(PushNotificationService);
  private _authService = inject(AuthService);
  private _swUpdate = inject(SwUpdate);

  constructor() {
    this.hb.items$.subscribe((items) => (this.heartbeats = items));
    this.logsSvc.entries$.subscribe((entries) => (this.logs = entries));
    this.settings.getExchangeId$().subscribe((exchangeId) => {
      this.currentExchangeId = exchangeId ?? 0;
      this.hb.load(exchangeId);
      this.loadSymbolsForExchange(exchangeId);
    });
    this.logsSvc.entries$.subscribe((entries) => (this.logs = entries));
    this.logsSvc.seedBurst();
  }

  setSegment(key: string): void {
    this.activeSegment = key;
    if (key === 'symbols' && this.currentExchangeId) {
      this.loadSymbolsForExchange(this.currentExchangeId);
    }
  }

  ngOnInit(): void {
    // Install prompt detection
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

    this.swMessageHandler = (event: MessageEvent) => {
      const data: any = event?.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'mtb-sw-push') {
        this._notificationLog.add(
          `[SW] push received ts=${data.ts} hasData=${data.hasData} keys=${(data.keys || []).join(',')}`,
        );
      }
      if (data.type === 'mtb-sw-pushsubscriptionchange') {
        this._notificationLog.add(`[SW] pushsubscriptionchange ts=${data.ts}`);
      }
    };
    try {
      navigator.serviceWorker?.addEventListener('message', this.swMessageHandler);
    } catch {}

    this.refreshInstallDebug();

    this._notificationLog.entries$
      .pipe(takeUntil(this.destroyed$))
      .subscribe((entries) => {
        this.notificationEntries = entries;
        if (entries && entries.length) {
          const latest = entries[0];
          if (!this.showNotificationLog) {
            this.showSnackbar(latest);
          }
        }
      });

    this.refreshSwStatus();
    this.startSwPoll();
    this.loadSwInfo();
  }

  ngOnDestroy(): void {
    if (this.beforeInstallHandler) {
      window.removeEventListener('beforeinstallprompt', this.beforeInstallHandler);
    }
    if (this.appInstalledHandler) {
      window.removeEventListener('appinstalled', this.appInstalledHandler);
    }
    if (this.swMessageHandler) {
      try {
        navigator.serviceWorker?.removeEventListener('message', this.swMessageHandler);
      } catch {}
      this.swMessageHandler = undefined;
    }
    if (this.swPollTimer) {
      clearInterval(this.swPollTimer);
      this.swPollTimer = null;
    }
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
      this.snackbarTimer = null;
    }
    if (this.binanceTestWs) {
      this.binanceTestWs.close();
      this.binanceTestWs = null;
    }
    try {
      this.destroyed$.next();
      this.destroyed$.complete();
    } catch {}
  }

  get filteredLogs(): LogEntry[] {
    const q = (this.logFilter || '').toLowerCase();
    if (!q) return this.logs;
    return this.logs.filter((e) =>
      e.level.toLowerCase().includes(q) ||
      e.source.toLowerCase().includes(q) ||
      e.message.toLowerCase().includes(q)
    );
  }

  onHome(): void {
    this.router.navigateByUrl('/');
  }

  onRefresh(): void {
    this.loadData();
  }

  onSelectedSymbolChange(): void {
    const selected = this.symbols.find((s) => s.Id === this.selectedSymbolId);
    if (!selected) return;

    this.symbolForm = {
      Id: selected.Id,
      SymbolName: selected.SymbolName,
      Active: !!selected.Active,
      RunStatus: selected.RunStatus || '',
      Icon: selected.Icon || '',
      ExchangeId: this.currentExchangeId,
      IsProduction: true,
    };
    this.symbolActionMsg = '';
  }

  submitSymbolUpdate(): void {
    // Guard against rapid repeat clicks while the previous request is still in-flight.
    if (this.savingSymbol) {
      return;
    }

    if (!this.selectedSymbolId || !this.currentExchangeId) {
      this.symbolActionMsg = 'Select a symbol first.';
      return;
    }

    this.savingSymbol = true;
    this.symbolActionMsg = '';
    this.symbolForm.Id = this.selectedSymbolId;
    this.symbolForm.ExchangeId = this.currentExchangeId;
    this.symbolForm.RunStatus = 'Pending';

    this.chartService
      .updateSymbolById(this.selectedSymbolId, this.currentExchangeId, this.symbolForm)
      .subscribe({
        next: () => {
          this.savingSymbol = false;
          this.symbolActionMsg = `Updated ${this.symbolForm.SymbolName}`;
          this.loadSymbolsForExchange(this.currentExchangeId);
        },
        error: (err) => {
          this.savingSymbol = false;
          this.symbolActionMsg = 'Update failed.';
          console.error('[Admin] symbol update failed', err);
        },
      });
  }

  enqueueSymbolBoxConfig(): void {
    if (this.queueingSymbolTask) {
      return;
    }

    if (!this.currentExchangeId || !this.symbolForm.SymbolName) {
      this.symbolActionMsg = 'Select a symbol first.';
      return;
    }

    this.queueingSymbolTask = true;
    this.symbolActionMsg = '';

    this.chartService
      .enqueueAiTask('box_config_settings', this.symbolForm.SymbolName, this.currentExchangeId)
      .subscribe({
        next: (ok) => {
          this.queueingSymbolTask = false;
          this.symbolActionMsg = ok
            ? `Queued box config for ${this.symbolForm.SymbolName}`
            : 'Queue request failed.';
        },
        error: (err) => {
          this.queueingSymbolTask = false;
          this.symbolActionMsg = 'Queue request failed.';
          console.error('[Admin] enqueue box config failed', err);
        },
      });
  }

  private loadData(): void {
    // Manual refresh will re-seed logs; heartbeat reacts to store changes
    this.logsSvc.seedBurst();
    if (this.currentExchangeId) {
      this.loadSymbolsForExchange(this.currentExchangeId);
    }
  }

  private loadSymbolsForExchange(exchangeId: number): void {
    if (!exchangeId) return;
    this.chartService.getAllSymbols().subscribe({
      next: (symbols) => {
        this.symbols = symbols || [];
        if (
          this.selectedSymbolId != null &&
          this.symbols.some((s) => s.Id === this.selectedSymbolId)
        ) {
          this.onSelectedSymbolChange();
        }
      },
      error: (err) => {
        console.error('[Admin] failed to load symbols', err);
      },
    });
  }

  // --- Notification / SW / Install debug ---

  toggleLogPanel(): void {
    this.showNotificationLog = !this.showNotificationLog;
  }

  clearNotificationLog(): void {
    this._notificationLog.clear();
  }

  testNotification(): void {
    this._notificationLog.add('Manual test notification triggered');
    this._notification.requestAndShow('Test notification', {
      body: 'Manual test from admin.',
      icon: 'assets/icons/icon-192x192.png',
    });
  }

  async requestPushNotifications(): Promise<void> {
    try {
      this._notificationLog.add('Starting push notification request...');

      if (!('Notification' in window)) {
        this._notificationLog.add('Notifications API not supported');
        return;
      }
      if (!('serviceWorker' in navigator)) {
        this._notificationLog.add('ServiceWorker API not supported');
        return;
      }
      if (!('PushManager' in window)) {
        this._notificationLog.add('PushManager not supported');
        return;
      }

      const subscription = await this._pushService.ensureSubscription();
      if (!subscription) {
        this._notificationLog.add('Failed to create push subscription');
        return;
      }

      this._notificationLog.add('Push subscription created successfully');
      this._notificationLog.add(`Endpoint: ${subscription.endpoint.substring(0, 80)}...`);
      await this.sendSubscriptionToBackend(subscription);
    } catch (e: any) {
      this._notificationLog.add(`Push request error: ${e?.message ?? e}`);
    }
  }

  private async sendSubscriptionToBackend(subscription: PushSubscription): Promise<void> {
    try {
      const apiBase = (environment.apiUrl || '').replace(/\/+$/, '');
      const subscribeUrl = `${apiBase}/api/Notifications/webpush/subscribe`;

      const endpoint = subscription.endpoint;
      const p256dh = this.arrayBufferKeyToBase64(subscription.getKey('p256dh'));
      const auth = this.arrayBufferKeyToBase64(subscription.getKey('auth'));

      this._notificationLog.add(`Sending subscription to: ${subscribeUrl}`);
      this._notificationLog.add(`Keys present: p256dh=${!!p256dh} auth=${!!auth}`);

      let token: string | undefined;
      try {
        token = await this._authService.getValidAccessToken();
      } catch {}

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await this._http.post(subscribeUrl, { endpoint, p256dh, auth, tags: [] }, { headers }).toPromise();
      this._notificationLog.add('✓ Subscription sent to backend successfully');
    } catch (e: any) {
      this._notificationLog.add(`Failed to send subscription to backend: ${e?.message ?? e}`);
    }
  }

  async sendTestNotification(): Promise<void> {
    try {
      this._notificationLog.add('Sending test notification request to Azure...');

      const apiBase = (environment.apiUrl || '').replace(/\/+$/, '');
      const testUrl = `${apiBase}/api/NotificationTests/webpush/send-test`;

      let token: string | undefined;
      try {
        token = await this._authService.getValidAccessToken();
      } catch {}

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await this._http.post(testUrl, {}, { headers }).toPromise();
      this._notificationLog.add(`✓ Test notification sent. Response: ${JSON.stringify(response)}`);
    } catch (e: any) {
      this._notificationLog.add(`Failed to send test notification: ${e?.message ?? e}`);
    }
  }

  async sendSymbolTestNotification(symbol: string, timeframe = '1h'): Promise<void> {
    const chartPath = `/chart/${symbol}/${timeframe}`;
    const baseHref = document.querySelector('base')?.getAttribute('href') || '/';
    const cleanBase = baseHref.endsWith('/') ? baseHref.slice(0, -1) : baseHref;
    const fullUrl = `${window.location.origin}${cleanBase}${chartPath}`;

    const payload = {
      title: `${symbol} Signal`,
      body: `New signal detected for ${symbol}. Tap to view chart.`,
      symbol,
      signalType: 'gold',
      url: fullUrl,
    };

    this._notificationLog.add(`Sending ${symbol} test notification...`);

    try {
      const apiBase = (environment.apiUrl || '').replace(/\/+$/, '');
      const testUrl = `${apiBase}/api/NotificationTests/webpush/send-test`;

      let token: string | undefined;
      try {
        token = await this._authService.getValidAccessToken();
      } catch {}

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await this._http.post(testUrl, payload, { headers }).toPromise();
      this._notificationLog.add(`✓ ${symbol} push sent via backend. Response: ${JSON.stringify(response)}`);
    } catch (e: any) {
      this._notificationLog.add(`Backend push failed, showing local notification: ${e?.message ?? e}`);
      // Fallback: show a local notification with the chart URL so tap-to-navigate still works
      await this._notification.requestAndShow(`${symbol} Signal`, {
        body: `New signal detected for ${symbol}. Tap to view chart.`,
        icon: 'assets/icons/icon-192x192.png',
        tag: `mtb-signal-${symbol}`,
        data: { url: fullUrl, symbol, signalType: 'gold', ts: Date.now() },
      } as NotificationOptions);
    }
  }

  async manualSubscribe(): Promise<void> {
    try {
      this._notificationLog.add('=== Manual Subscribe Debug ===');

      if (!('serviceWorker' in navigator)) {
        this._notificationLog.add('❌ ServiceWorker API not supported on this device');
        return;
      }
      this._notificationLog.add('✓ ServiceWorker API available');

      if (!('PushManager' in window)) {
        this._notificationLog.add('❌ PushManager not supported on this device');
        return;
      }
      this._notificationLog.add('✓ PushManager available');

      const registration = await navigator.serviceWorker.ready;
      if (!registration) {
        this._notificationLog.add('❌ Service worker registration not ready');
        return;
      }
      this._notificationLog.add('✓ Service worker registered');

      if (Notification.permission === 'denied') {
        this._notificationLog.add('❌ Notification permission DENIED. Cannot subscribe.');
        return;
      }

      if (Notification.permission !== 'granted') {
        this._notificationLog.add('⚠ Notification permission not granted. Requesting...');
        const permission = await Notification.requestPermission();
        this._notificationLog.add(`Notification permission result: ${permission}`);
        if (permission !== 'granted') {
          this._notificationLog.add('❌ User denied notification permission');
          return;
        }
      }
      this._notificationLog.add('✓ Notification permission granted');

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        this._notificationLog.add('No existing subscription found. Creating new one...');

        const vapidKey = await this._authService.getVapidPublicKey();
        if (!vapidKey) {
          this._notificationLog.add('❌ Failed to get VAPID key from server');
          return;
        }
        this._notificationLog.add('✓ VAPID key retrieved');

        const applicationServerKey = this.urlBase64ToUint8Array(vapidKey) as BufferSource;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
        this._notificationLog.add('✓ New subscription created');
      } else {
        this._notificationLog.add('✓ Existing subscription found');
      }

      if (!subscription) {
        this._notificationLog.add('❌ Failed to create or get subscription');
        return;
      }

      const endpoint = subscription.endpoint;
      const p256dhKey = subscription.getKey('p256dh');
      const authKey = subscription.getKey('auth');

      if (!p256dhKey) {
        this._notificationLog.add('❌ Missing p256dh key in subscription');
      } else {
        this._notificationLog.add('✓ p256dh key present');
      }

      if (!authKey) {
        this._notificationLog.add('❌ Missing auth key in subscription');
      } else {
        this._notificationLog.add('✓ auth key present');
      }

      const p256dh = this.arrayBufferKeyToBase64(p256dhKey);
      const auth = this.arrayBufferKeyToBase64(authKey);

      this._notificationLog.add(`Endpoint: ${endpoint.substring(0, 100)}...`);

      const apiBase = (environment.apiUrl || '').replace(/\/+$/, '');
      const subscribeUrl = `${apiBase}/api/Notifications/webpush/subscribe`;
      this._notificationLog.add(`POSTing to: ${subscribeUrl}`);

      let token: string | undefined;
      try {
        token = await this._authService.getValidAccessToken();
        this._notificationLog.add('✓ Auth token obtained');
      } catch (e: any) {
        this._notificationLog.add(`⚠ Auth token error: ${e?.message ?? e}`);
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        this._notificationLog.add('✓ Authorization header added');
      }

      const payload = { endpoint, p256dh, auth, tags: [] };
      this._notificationLog.add(`Payload keys: endpoint, p256dh (${p256dh.length} chars), auth (${auth.length} chars), tags`);

      const response = await this._http.post(subscribeUrl, payload, { headers }).toPromise();
      this._notificationLog.add('✓✓✓ Subscription sent to backend successfully!');
      this._notificationLog.add(`Response: ${JSON.stringify(response)}`);
    } catch (e: any) {
      const errorMsg = e?.error?.message || e?.message || JSON.stringify(e);
      this._notificationLog.add(`❌ Subscribe error: ${errorMsg}`);

      if (e?.error) {
        this._notificationLog.add(`Error response: ${JSON.stringify(e.error)}`);
      }
      if (e?.status) {
        this._notificationLog.add(`HTTP Status: ${e.status}`);
      }
    }
  }

  async registerServiceWorker(): Promise<void> {
    this._notificationLog.add(
      'Manual service worker registration is disabled. Ensure ServiceWorkerModule is enabled in environment and build in production mode.',
    );
    await this.refreshSwStatus();
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
      // Rely on Angular's default change detection
    }
  }

  async refreshInstallDebug(): Promise<void> {
    try {
      this.installDebug.userAgent = navigator.userAgent;
      this.installDebug.isSecure = !!(window as any).isSecureContext;
      this.installDebug.hasSwApi = 'serviceWorker' in navigator;
      this.installDebug.hasController = !!(navigator as any).serviceWorker?.controller;

      const dm = ['standalone', 'fullscreen', 'minimal-ui', 'browser'].find((m) =>
        window.matchMedia(`(display-mode: ${m})`).matches,
      );
      this.installDebug.displayMode = dm || '';

      const prompt = this.installPromptEvent || (window as any).__mtbInstallPrompt;
      this.installDebug.hasPrompt = !!prompt;
      this.installDebug.promptPlatform = (prompt as any)?.platforms?.join?.(',') || '';
      this.installDebug.relatedAppsCount =
        Array.isArray((prompt as any)?.userChoice) ? (prompt as any).userChoice.length : 0;

      const manifestLink = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
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
            this.installDebug.manifestOk = Boolean(hasName && hasIcons && hasStartUrl && hasDisplay);
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

  private showSnackbar(message: string): void {
    if (this.snackbarTimer) {
      clearTimeout(this.snackbarTimer);
    }
    this.snackbarMessage = message;
    this.snackbarTimer = setTimeout(() => {
      this.snackbarMessage = null;
    }, 4000);
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
      if (attempts > 30) {
        this._notificationLog.add('Stopped SW polling (timeout)');
        clearInterval(this.swPollTimer);
      }
    }, 2000);
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
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

  checkForSwUpdate(): void {
    if (!this._swUpdate.isEnabled) return;
    this._swUpdate.checkForUpdate().then((hasUpdate) => {
      this.swInfo.lastCheck = new Date().toLocaleString();
      if (hasUpdate) {
        this.swInfo.swState = 'Update available — activating...';
        this._swUpdate.activateUpdate().then(() => document.location.reload());
      } else {
        this.swInfo.swState = 'Up to date';
      }
      this._cdr.detectChanges();
    }).catch((err) => {
      this.swInfo.swState = 'Check failed';
      console.error('[Admin] SW update check error:', err);
      this._cdr.detectChanges();
    });
  }

  private loadSwInfo(): void {
    this.swInfo.isEnabled = this._swUpdate.isEnabled;
    this.swInfo.enabled = 'serviceWorker' in navigator;

    this._http.get('ngsw/state', { responseType: 'text' }).subscribe({
      next: (debugText) => {
        this.swInfo.debugRaw = debugText;
        this.parseNgswDebug(debugText);
        this._cdr.detectChanges();
      },
      error: () => {
        this.swInfo.swState = this._swUpdate.isEnabled ? 'Active (debug unavailable)' : 'Not registered';
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then((reg) => {
            if (reg) {
              this.swInfo.swState = reg.active ? 'Active' : reg.waiting ? 'Waiting' : reg.installing ? 'Installing' : 'Registered';
              if (reg.active?.scriptURL) {
                this.swInfo.appVersion = reg.active.scriptURL;
              }
            } else {
              this.swInfo.swState = 'Not registered';
            }
            this._cdr.detectChanges();
          });
        }
        this._cdr.detectChanges();
      },
    });
  }

  // --- Connectivity tests ---

  testBotApi(): void {
    this.botTestResult = { status: 'testing', latency: 0, message: 'Calling bot002 API...' };
    const start = performance.now();
    this.chartService.getExchanges().subscribe({
      next: (exchanges) => {
        const latency = Math.round(performance.now() - start);
        this.botTestResult = {
          status: 'ok',
          latency,
          message: `OK — ${exchanges?.length ?? 0} exchanges returned in ${latency}ms`,
        };
        this._cdr.detectChanges();
      },
      error: (err) => {
        const latency = Math.round(performance.now() - start);
        this.botTestResult = {
          status: 'fail',
          latency,
          message: `FAIL — ${err?.status ?? 'unknown'}: ${err?.message ?? err}`,
        };
        this._cdr.detectChanges();
      },
    });
  }

  testBinanceStream(): void {
    if (this.binanceTestWs) {
      this.binanceTestWs.close();
      this.binanceTestWs = null;
    }
    this.binanceTestResult = { status: 'testing', latency: 0, message: 'Connecting to Binance stream...' };
    const start = performance.now();
    const url = 'wss://stream.binance.com:9443/ws/btcusdt@miniTicker';

    try {
      this.binanceTestWs = new WebSocket(url);

      this.binanceTestWs.onopen = () => {
        const latency = Math.round(performance.now() - start);
        this.binanceTestResult = {
          status: 'testing',
          latency,
          message: `Connected in ${latency}ms — waiting for data...`,
        };
        this._cdr.detectChanges();
      };

      this.binanceTestWs.onmessage = (event: MessageEvent) => {
        const latency = Math.round(performance.now() - start);
        try {
          const data = JSON.parse(event.data);
          const price = parseFloat(data?.c) || 0;
          this.binanceTestResult = {
            status: 'ok',
            latency,
            message: `OK — BTCUSDT $${price.toLocaleString()} received in ${latency}ms`,
          };
        } catch {
          this.binanceTestResult = {
            status: 'ok',
            latency,
            message: `OK — data received in ${latency}ms`,
          };
        }
        this.binanceTestWs?.close();
        this.binanceTestWs = null;
        this._cdr.detectChanges();
      };

      this.binanceTestWs.onerror = () => {
        const latency = Math.round(performance.now() - start);
        this.binanceTestResult = {
          status: 'fail',
          latency,
          message: `FAIL — WebSocket error after ${latency}ms`,
        };
        this.binanceTestWs = null;
        this._cdr.detectChanges();
      };

      this.binanceTestWs.onclose = () => {
        if (this.binanceTestResult.status === 'testing') {
          const latency = Math.round(performance.now() - start);
          this.binanceTestResult = {
            status: 'fail',
            latency,
            message: `FAIL — Connection closed after ${latency}ms`,
          };
          this._cdr.detectChanges();
        }
        this.binanceTestWs = null;
      };

      // Timeout after 10s
      setTimeout(() => {
        if (this.binanceTestResult.status === 'testing') {
          this.binanceTestResult = {
            status: 'fail',
            latency: 10000,
            message: 'FAIL — Timed out after 10s',
          };
          this.binanceTestWs?.close();
          this.binanceTestWs = null;
          this._cdr.detectChanges();
        }
      }, 10000);
    } catch (e: any) {
      this.binanceTestResult = {
        status: 'fail',
        latency: 0,
        message: `FAIL — ${e?.message ?? e}`,
      };
      this._cdr.detectChanges();
    }
  }

  private parseNgswDebug(text: string): void {
    const stateMatch = text.match(/Driver state:\s*(.+)/i);
    if (stateMatch) this.swInfo.swState = stateMatch[1].trim();

    const appVersionMatch = text.match(/Latest manifest hash:\s*(\S+)/i);
    if (appVersionMatch) this.swInfo.appVersion = appVersionMatch[1].trim();

    const checkMatch = text.match(/Last update check:\s*(.+)/i);
    if (checkMatch) this.swInfo.lastCheck = checkMatch[1].trim();
  }
}
