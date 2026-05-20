import { trigger, transition, style, animate } from '@angular/animations';

import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
// Angular Material removed
// import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { Subject, combineLatest, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { onKeyEnterFocusNext } from '../../helpers/key-event-utils';
import { LoginDTO } from '../../modules/shared/models/login/login.dto';
import { AuthService } from '../../modules/shared/services/http/authService';
import { AppService } from '../../modules/shared/services/services/appService';
import { SettingsService } from '../../modules/shared/services/services/settingsService';
import { ChartPerformanceService } from '../chart/services/chart-performance.service';
import { NotificationService } from '../../helpers/notification.service';
import { PushNotificationService } from '../../helpers/push-notification.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule
],
  animations: [
    trigger('enterLogin', [
      transition(':enter', [
        style({ transform: 'translateX(20%)', opacity: 0 }),
        animate('120ms ease-out'),
      ]),
    ]),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent implements OnDestroy, AfterViewInit, OnInit {
  @ViewChild('usernameInput') usernameInput!: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') passwordInput!: ElementRef<HTMLInputElement>;
  @ViewChild('loginButton') loginButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('loginFormElement') loginFormElement!: ElementRef<HTMLFormElement>;
  keyboardContext: 'username' | 'password' = 'username';
  focusedInput: ElementRef<HTMLInputElement> | null = null;
  public hide = true;
  loggingIn = false;
  isMobile = false;
  isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  showForm = false; // toggled, default false for desktop, true for mobile
  showDebugPanel = false;
  selectedLoginOption: 'email' | 'apple' | 'google' = 'email';
  caretPosition = 0;
  selectionEnd = 0;
  liveValue = '';
  oValue = new EventEmitter<string | null>();
  public version = environment.version;
  loginForm: FormGroup<{
    username: FormControl<string | null>;
    password: FormControl<string | null>;
  }>;
  focusedControl: FormControl<string | null> | null = null;
  // Use undefined instead of null to align with NotificationOptions.body?: string
  loginError: string | undefined = undefined;
  debugLogOutput = 'No login issues captured yet.';

  private readonly destroy$ = new Subject<void>();
  private readonly _router = inject(Router);
  private readonly _fb = inject(FormBuilder);
  private readonly _authService = inject(AuthService);
  private readonly _appService = inject(AppService);
  private readonly _settingsService = inject(SettingsService);
  private readonly _chartPerformance = inject(ChartPerformanceService);
  private readonly _notification = inject(NotificationService);
  private readonly _push = inject(PushNotificationService);
  private readonly debugEntries: Array<{ at: string; event: string; details: unknown }> = [];
  private readonly onWindowError = (event: ErrorEvent): void => {
    this.appendDebugEntry('Window error', {
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error,
    });
  };
  private readonly onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    this.appendDebugEntry('Unhandled promise rejection', event.reason);
  };
  private readonly onConnectivityChange = (): void => {
    this.isOnline = navigator.onLine;
    this.appendDebugEntry('Connectivity changed', { online: this.isOnline });
  };

  constructor() {
    this.loginForm = this._fb.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit(): void {
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.isOnline = navigator.onLine;
    // Show form automatically on mobile devices
    this.showForm = this.isMobile;
    window.addEventListener('error', this.onWindowError);
    window.addEventListener('unhandledrejection', this.onUnhandledRejection);
    window.addEventListener('online', this.onConnectivityChange);
    window.addEventListener('offline', this.onConnectivityChange);
  }

  get usernameControl(): FormControl<string | null> {
    return this.loginForm.get('username') as FormControl<string | null>;
  }

  get passwordControl(): FormControl<string | null> {
    return this.loginForm.get('password') as FormControl<string | null>;
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      if (!this.usernameControl.value) {
        this.usernameInput.nativeElement.focus();
      }
    }, 1000);
  }

  async login(): Promise<void> {
    this.loggingIn = true;
    this.appendDebugEntry('Login requested', this.buildLoginContext());

    if (!this.loginForm.valid) {
      this.loggingIn = false;
      this.loginError = 'Ongeldig formulier';
      this.appendDebugEntry('Login blocked by validation', {
        usernameErrors: this.loginForm.controls.username.errors,
        passwordErrors: this.loginForm.controls.password.errors,
      });
      return;
    }

    const hpInput = (this.loginFormElement?.nativeElement?.querySelector('input[name="website"]') as HTMLInputElement | null)?.value || '';
    const loginParams: LoginDTO = {
      username: this.loginForm.controls.username?.value as string,
      password: this.loginForm.controls.password?.value as string,
      // Optional honeypot field sent to backend for detection
      website: hpInput,
    };

    try {
      await this._push.primePermissionFromUserGesture();
      this.appendDebugEntry('Push permission primed', { result: 'ok' });
    } catch (error) {
      this.appendDebugEntry('Push permission priming failed', error);
    }

    this._authService.login(loginParams).subscribe({
      next: async (loginResult) => {
        // Delegate token persistence & auto-expiry scheduling to AppService
        this._appService.handleNewLoginToken(loginResult);
        this.loggingIn = false;
        this.loginError = undefined;
        this.appendDebugEntry('Login succeeded', {
          createdAt: loginResult?.CreatedAt ?? null,
          hasAccessToken: Boolean(loginResult?.AccessToken),
        });
        this._router.navigate(['/dashboard']);
        await this.showChosenOptionsDialog();
        // Run subscription immediately after login; permission was already primed from user gesture.
        void this._push.ensureSubscription();
      },
      error: (err) => {
        console.warn('[LoginComponent] Login failed:', err);
        this.appendDebugEntry('Login failed', {
          userMessage: err?.message || 'Login mislukt',
          rawError: this.extractErrorDetails(err),
        });
        this.loginError = err?.message || 'Login mislukt';
        this.loggingIn = false;
        this.showDebugPanel = true;
      },
    });
  }

  clearStorage(): void {
    try {
      // Clear NgRx slices via actions
      this._appService.clearAppState();
      // Login page does not inject SettingsService; remove persisted slices directly when present
      try { localStorage.removeItem('appState'); } catch {}
      try { localStorage.removeItem('settingsState'); } catch {}
      try { localStorage.removeItem('keyZonesState'); } catch {}
      this._notification.requestAndShow('Storage cleared', {
        body: 'Local storage has been reset.',
        icon: 'assets/icons/icon-192x192.png',
      });
    } catch {}
  }

  onProvider(provider: 'apple' | 'google'): void {
    this.selectedLoginOption = provider;
    // Placeholder: here you would integrate OAuth. For now just focus form.
    if (!this.showForm) {
      this.showForm = true;
    }
  }

  toggleForm(): void {
    this.showForm = !this.showForm;
  }

  toggleDebugPanel(): void {
    this.showDebugPanel = !this.showDebugPanel;
  }

  clearDebugLog(): void {
    this.debugEntries.length = 0;
    this.debugLogOutput = 'No login issues captured yet.';
  }

  ngOnDestroy(): void {
    window.removeEventListener('error', this.onWindowError);
    window.removeEventListener('unhandledrejection', this.onUnhandledRejection);
    window.removeEventListener('online', this.onConnectivityChange);
    window.removeEventListener('offline', this.onConnectivityChange);
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFocus(control: FormControl<string | null>): void {
    this.focusedControl = control;
    this.liveValue = '';
    this.onLiveValueChange('');
  }

  onLiveValueChange(value: string): void {
    console.log('Live value veranderd:', value);
    if (this.keyboardContext === 'username') {
      this.usernameControl.setValue(value);
    } else if (this.keyboardContext === 'password') {
      this.passwordControl.setValue(value);
    }
  }

  onKeyboardEnter(value: string): void {
    console.log('Waarde ontvangen in onKeyboardEnter:', value);

    if (this.keyboardContext === 'username') {
      this.usernameControl.setValue(value);
      this.usernameControl.updateValueAndValidity();
    } else if (this.keyboardContext === 'password') {
      this.passwordControl.setValue(value);
      this.passwordControl.updateValueAndValidity();
    }

    this.liveValue = value;
    this.oValue.emit(value);

    this.liveValue = '';
    this.oValue.emit('');
  }

  handleKey(event: KeyboardEvent): void {
    onKeyEnterFocusNext(event);
  }

  focusNext(): void {
    if (this.keyboardContext === 'username') {
      this.liveValue = '';
      this.oValue.emit(this.liveValue);
      this.focusedControl = this.passwordControl;
      this.keyboardContext = 'password';
      this.caretPosition = this.passwordInput.nativeElement.selectionStart ?? 0;
      this.selectionEnd =
        this.passwordInput.nativeElement.selectionEnd ?? this.caretPosition;

      this.focusedInput = this.passwordInput;

      setTimeout(() => {
        this.passwordInput.nativeElement.focus();
      });
    }
  }

  private buildLoginContext(): Record<string, unknown> {
    return {
      username: this.loginForm.controls.username?.value ?? '',
      apiUrl: environment.apiUrl,
      online: this.isOnline,
      location: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
  }

  private extractErrorDetails(error: unknown): unknown {
    if (error && typeof error === 'object' && 'debugDetails' in error) {
      return this.serializeValue((error as { debugDetails?: unknown }).debugDetails);
    }

    return this.serializeValue(error);
  }

  private appendDebugEntry(event: string, details: unknown): void {
    this.debugEntries.unshift({
      at: new Date().toISOString(),
      event,
      details: this.serializeValue(details),
    });

    if (this.debugEntries.length > 25) {
      this.debugEntries.length = 25;
    }

    this.debugLogOutput = JSON.stringify(this.debugEntries, null, 2);
  }

  private serializeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }

    if (Array.isArray(value)) {
      if (depth >= 4) {
        return '[Max depth reached]';
      }

      return value.map((entry) => this.serializeValue(entry, depth + 1, seen));
    }

    if (typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]';
      }

      if (depth >= 4) {
        return '[Max depth reached]';
      }

      seen.add(value);
      const serialized: Record<string, unknown> = {};
      for (const [key, entryValue] of Object.entries(value)) {
        serialized[key] = this.serializeValue(entryValue, depth + 1, seen);
      }
      return serialized;
    }

    return String(value);
  }

  private async showChosenOptionsDialog(): Promise<void> {
    try {
      this._chartPerformance.initialize();
      const profileTier = this.formatPerformanceTier(
        this._chartPerformance.profile.tier,
      );

      const [exchange, symbol, timeframe, tradeAlerts, priceAlerts, newsUpdates, darkMode, uiMode] =
        await firstValueFrom(
          combineLatest([
            this._settingsService.getSelectedExchange(),
            this._settingsService.getSelectedSymbol(),
            this._settingsService.getSelectedTimeframe(),
            this._settingsService.getTradeAlertsEnabled(),
            this._settingsService.getPriceAlertsEnabled(),
            this._settingsService.getNewsUpdatesEnabled(),
            this._settingsService.getDarkModeEnabled(),
            this._settingsService.getUiModeOverride(),
          ]),
        );

      const optionText = [
        `Login option: ${this.selectedLoginOption}`,
        `Performance profile: ${profileTier}`,
        `Exchange: ${exchange?.Name || 'Not selected'}`,
        `Symbol: ${symbol?.SymbolName || 'Not selected'}`,
        `Timeframe: ${timeframe || 'Not selected'}`,
        `Trade alerts: ${tradeAlerts ? 'On' : 'Off'}`,
        `Price alerts: ${priceAlerts ? 'On' : 'Off'}`,
        `News updates: ${newsUpdates ? 'On' : 'Off'}`,
        `Dark mode: ${darkMode ? 'On' : 'Off'}`,
        `UI mode: ${uiMode || 'auto'}`,
      ].join('\n');

      window.alert(`Chosen options:\n\n${optionText}`);
    } catch {
      this._chartPerformance.initialize();
      const profileTier = this.formatPerformanceTier(
        this._chartPerformance.profile.tier,
      );
      window.alert(
        `Chosen options:\n\nLogin option: ${this.selectedLoginOption}\nPerformance profile: ${profileTier}`,
      );
    }
  }

  private formatPerformanceTier(tier: 'low' | 'balanced' | 'high'): 'low' | 'medium' | 'high' {
    if (tier === 'balanced') return 'medium';
    return tier;
  }
}
