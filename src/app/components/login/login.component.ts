import { trigger, transition, style, animate } from '@angular/animations';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { onKeyEnterFocusNext } from '../../helpers/key-event-utils';
import { LoginDTO } from '../../modules/shared/models/login/login.dto';
import { AuthService } from '../../modules/shared/services/http/authService';
import { AppService } from '../../modules/shared/services/services/appService';

@Component({
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  animations: [
    trigger('enterLogin', [
      transition(':enter', [
        style({ transform: 'translateX(20%)', opacity: 0 }),
        animate('120ms ease-out'),
      ]),
    ]),
  ],
})
export class LoginComponent implements OnDestroy, AfterViewInit {
  @ViewChild('usernameInput') usernameInput!: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') passwordInput!: ElementRef<HTMLInputElement>;
  @ViewChild('loginButton') loginButton!: ElementRef<HTMLButtonElement>;
  @ViewChild('loginFormElement') loginFormElement!: ElementRef<HTMLFormElement>;
  keyboardContext: 'username' | 'password' = 'username';
  focusedInput: ElementRef<HTMLInputElement> | null = null;
  public hide = true;
  loggingIn = false;
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
  loginError: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private _router: Router,
    private _fb: FormBuilder,
    private _authService: AuthService,
    private _appService: AppService,
  ) {
    this.loginForm = this._fb.group({
      username: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
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
      return;
    }

    const loginParams: LoginDTO = {
      username: this.loginForm.controls.username?.value as string,
      password: this.loginForm.controls.password?.value as string,
    };

    this._authService.login(loginParams).subscribe({
      next: (loginResult) => {
        // Delegate token persistence & auto-expiry scheduling to AppService
        this._appService.handleNewLoginToken(loginResult);
        this.loggingIn = false;
        this.loginError = null;
        this._router.navigate(['/dashboard']);
      },
      error: (err) => {
        console.warn('[LoginComponent] Login failed:', err);
        this.loginError = err?.message || 'Login mislukt';
        this.loggingIn = false;
      },
    });
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
