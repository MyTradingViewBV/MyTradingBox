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
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { onKeyEnterFocusNext } from '../../helpers/key-event-utils';
import { LoginDTO } from '../../modules/shared/models/login/login.dto';
import { AuthService } from '../../modules/shared/services/http/authService';
import { AppService } from '../../modules/shared/services/services/appService';
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
  showForm = false; // toggled, default false for desktop, true for mobile
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

  private readonly destroy$ = new Subject<void>();
  private readonly _router = inject(Router);
  private readonly _fb = inject(FormBuilder);
  private readonly _authService = inject(AuthService);
  private readonly _appService = inject(AppService);
  private readonly _notification = inject(NotificationService);
  private readonly _push = inject(PushNotificationService);

  constructor() {
    this.loginForm = this._fb.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit(): void {
    this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    // Show form automatically on mobile devices
    this.showForm = this.isMobile;
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

  login(): void {
    this.loggingIn = true;

    if (!this.loginForm.valid) {
      this.loggingIn = false;
      this.loginError = 'Ongeldig formulier';
      this._notification.requestAndShow('Login mislukt', { body: this.loginError });
      return;
    }

    const hpInput = (this.loginFormElement?.nativeElement?.querySelector('input[name="website"]') as HTMLInputElement | null)?.value || '';
    const loginParams: LoginDTO = {
      username: this.loginForm.controls.username?.value as string,
      password: this.loginForm.controls.password?.value as string,
      // Optional honeypot field sent to backend for detection
      website: hpInput,
    };

    this._authService.login(loginParams).subscribe({
      next: async (loginResult) => {
        // Delegate token persistence & auto-expiry scheduling to AppService
        this._appService.handleNewLoginToken(loginResult);
        this.loggingIn = false;
        this.loginError = undefined;
        this._router.navigate(['/dashboard']);
        // Attempt push subscription after successful login (single shot)
        setTimeout(() => this._push.ensureSubscription(), 500);
      },
      error: (err) => {
        console.warn('[LoginComponent] Login failed:', err);
        this.loginError = err?.message || 'Login mislukt';
        this.loggingIn = false;
        this._notification.requestAndShow('Login mislukt', { body: this.loginError });
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
    // Placeholder: here you would integrate OAuth. For now just focus form.
    if (!this.showForm) {
      this.showForm = true;
    }
  }

  toggleForm(): void {
    this.showForm = !this.showForm;
  }

  ngOnDestroy(): void {
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
}
