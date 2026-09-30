import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginComponent } from './login.component';
import { Router } from '@angular/router';
import { of, throwError, delay } from 'rxjs';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { LoginApiService } from '../../modules/shared/services/http/login-api.service';
import { AppService } from '../../modules/shared/services/services/appService';
import { NotificationService } from '../../helpers/notification.service';
import { PushNotificationService } from '../../helpers/push-notification.service';
import { SettingsService } from '../../modules/shared/services/services/settingsService';
import { ChartPerformanceService } from '../chart/services/chart-performance.service';
import { FormControl } from '@angular/forms';
import { environment } from '../../../environments/environment';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  const mockAuth = { login: vi.fn() };
  const mockRouter = { navigate: vi.fn() };
  const mockApp = {
    handleNewLoginToken: vi.fn(),
    clearAppState: vi.fn(),
  };
  const mockNotification = { requestAndShow: vi.fn() };
  const mockPush = {
    ensureSubscription: vi.fn(),
    primePermissionFromUserGesture: vi
      .fn()
      .mockReturnValue(Promise.resolve('default')),
  };
  const mockSettings = {
    getSelectedExchange: vi.fn().mockReturnValue(of(null)),
    getSelectedSymbol: vi.fn().mockReturnValue(of(null)),
    getSelectedTimeframe: vi.fn().mockReturnValue(of(null)),
    getTradeAlertsEnabled: vi.fn().mockReturnValue(of(true)),
    getPriceAlertsEnabled: vi.fn().mockReturnValue(of(true)),
    getNewsUpdatesEnabled: vi.fn().mockReturnValue(of(false)),
    getDarkModeEnabled: vi.fn().mockReturnValue(of(true)),
    getUiModeOverride: vi.fn().mockReturnValue(of('auto')),
  };
  const mockChartPerformance = {
    initialize: vi.fn(),
    profile: { tier: 'balanced' as const },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        { provide: Router, useValue: mockRouter },
        { provide: LoginApiService, useValue: mockAuth },
        { provide: AppService, useValue: mockApp },
        { provide: SettingsService, useValue: mockSettings },
        { provide: ChartPerformanceService, useValue: mockChartPerformance },
        { provide: NotificationService, useValue: mockNotification },
        { provide: PushNotificationService, useValue: mockPush },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Reset spies
    mockAuth.login.mockClear();
    mockRouter.navigate.mockClear();
    mockApp.handleNewLoginToken.mockClear();
    mockApp.clearAppState.mockClear();
    mockNotification.requestAndShow.mockClear();
    mockPush.ensureSubscription.mockClear();
    mockPush.primePermissionFromUserGesture.mockClear();
    Object.values(mockSettings).forEach((spyFn: any) => spyFn.mockClear());
    mockChartPerformance.initialize.mockClear();
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set isMobile and showForm on mobile user agent', () => {
    const original = navigator.userAgent;
    try {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'iPhone',
        configurable: true,
      });
      component.ngOnInit();
      expect(component.isMobile).toBe(true);
      expect(component.showForm).toBe(true);
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: original,
        configurable: true,
      });
    }
  });

  it('usernameControl and passwordControl should return proper controls', () => {
    expect(component.usernameControl).toBe(
      component.loginForm.controls.username,
    );
    expect(component.passwordControl).toBe(
      component.loginForm.controls.password,
    );
  });

  it('ngAfterViewInit should focus username input when empty', async () => {
    vi.useFakeTimers();
    const focus = vi.fn();
    component.usernameInput = { nativeElement: { focus } } as any;
    component.ngAfterViewInit();
    await vi.advanceTimersByTimeAsync(1000);
    expect(focus).toHaveBeenCalled();
  });

  it('ngAfterViewInit should not throw when the form is hidden', async () => {
    vi.useFakeTimers();
    component.usernameInput = undefined;
    component.ngAfterViewInit();
    await expect(vi.advanceTimersByTimeAsync(1000)).resolves.not.toThrow();
  });

  it('login should show error when form is invalid', async () => {
    component.loginForm.setValue({ username: '', password: '' });
    await component.login();
    expect(component.loggingIn).toBe(false);
    expect(component.loginError).toBe('Ongeldig formulier');
    expect(mockNotification.requestAndShow).not.toHaveBeenCalled();
    expect(mockAuth.login).not.toHaveBeenCalled();
  });

  it('login should handle success path and navigate + subscribe push', async () => {
    vi.useFakeTimers();
    const result = { token: 'abc' };
    mockAuth.login.mockReturnValue(of(result));

    component.loginForm.setValue({ username: 'a@b.com', password: '123456' });

    await component.login();
    await vi.advanceTimersByTimeAsync(0);

    // subscription next should run synchronously
    expect(mockApp.handleNewLoginToken).toHaveBeenCalledWith(result);
    expect(component.loggingIn).toBe(false);
    expect(component.loginError).toBeUndefined();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(mockPush.primePermissionFromUserGesture).toHaveBeenCalled();
    expect(mockPush.ensureSubscription).toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalled();
  });

  it('login should handle error path and show notification', async () => {
    vi.useFakeTimers();
    const err = { message: 'Invalid credentials' };
    mockAuth.login.mockReturnValue(throwError(() => err));

    component.loginForm.setValue({ username: 'a@b.com', password: '123456' });

    await component.login();
    await vi.advanceTimersByTimeAsync(0);

    expect(component.loggingIn).toBe(false);
    expect(component.loginError).toBe(err.message);
    expect(mockNotification.requestAndShow).not.toHaveBeenCalled();
  });

  it('login should capture raw debug details when auth fails', async () => {
    vi.useFakeTimers();
    const err = Object.assign(new Error('Server niet bereikbaar'), {
      debugDetails: {
        status: 0,
        message: 'Http failure response',
        online: false,
      },
    });
    mockAuth.login.mockReturnValue(throwError(() => err));

    component.loginForm.setValue({ username: 'a@b.com', password: '123456' });

    await component.login();
    await vi.advanceTimersByTimeAsync(0);

    expect(component.loginError).toBe('Server niet bereikbaar');
    expect(component.showDebugPanel).toBe(true);
    expect(component.debugLogOutput).toContain('Login failed');
    expect(component.debugLogOutput).toContain('"status": 0');
  });

  it('clearStorage should clear app state and localStorage and show notification', () => {
    localStorage.setItem('appState', 'x');
    localStorage.setItem('settingsState', 'y');
    localStorage.setItem('keyZonesState', 'z');

    component.clearStorage();

    expect(mockApp.clearAppState).toHaveBeenCalled();
    expect(localStorage.getItem('appState')).toBeNull();
    expect(localStorage.getItem('settingsState')).toBeNull();
    expect(localStorage.getItem('keyZonesState')).toBeNull();
    expect(mockNotification.requestAndShow).toHaveBeenCalled();
  });

  it('onLiveValueChange should update the correct control based on keyboardContext', () => {
    component.keyboardContext = 'username';
    component.onLiveValueChange('u1');
    expect(component.usernameControl.value).toBe('u1');

    component.keyboardContext = 'password';
    component.onLiveValueChange('p1');
    expect(component.passwordControl.value).toBe('p1');
  });

  it('onKeyboardEnter should set control values and emit values then clear', () => {
    const events: any[] = [];
    component.oValue.subscribe((v) => events.push(v));

    component.keyboardContext = 'username';
    component.onKeyboardEnter('hello');

    expect(component.usernameControl.value).toBe('hello');
    // first emit is the value, second is empty string
    expect(events).toEqual(['hello', '']);
    expect(component.liveValue).toBe('');
  });

  it('focusNext should move focus to password field and set keyboardContext', async () => {
    vi.useFakeTimers();
    component.keyboardContext = 'username';
    component.liveValue = 'some';
    component.passwordInput = {
      nativeElement: { selectionStart: 2, selectionEnd: 2, focus: vi.fn() },
    } as any;

    component.focusNext();
    // let the internal setTimeout run
    await vi.advanceTimersByTimeAsync(0);

    expect(component.keyboardContext).toBe('password');
    expect(component.focusedControl).toBe(component.passwordControl);
    expect(component.caretPosition).toBe(2);
    expect(component.selectionEnd).toBe(2);
    expect(component.passwordInput.nativeElement.focus).toHaveBeenCalled();
  });

  it('handleKey should not throw when called (safe delegation)', () => {
    const ev = new KeyboardEvent('keydown');
    expect(() => component.handleKey(ev)).not.toThrow();
  });

  // =============== FORM VALIDATION TESTS ===============

  it('loginForm should be invalid when username is empty', () => {
    component.loginForm.setValue({ username: '', password: 'password123' });
    expect(component.loginForm.valid).toBe(false);
  });

  it('loginForm should be invalid when password is empty', () => {
    component.loginForm.setValue({
      username: 'test@example.com',
      password: '',
    });
    expect(component.loginForm.valid).toBe(false);
  });

  it('loginForm should be invalid when username is not an email', () => {
    component.loginForm.setValue({
      username: 'notanemail',
      password: 'password123',
    });
    expect(component.loginForm.valid).toBe(false);
  });

  it('loginForm should be invalid when password is less than 6 characters', () => {
    component.loginForm.setValue({
      username: 'test@example.com',
      password: '12345',
    });
    expect(component.loginForm.valid).toBe(false);
  });

  it('loginForm should be valid with correct email and password', () => {
    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    expect(component.loginForm.valid).toBe(true);
  });

  it('loginForm should accept various valid email formats', () => {
    const validEmails = [
      'user@example.com',
      'test.user@example.co.uk',
      'user+tag@domain.com',
      'user123@example-domain.com',
    ];

    validEmails.forEach((email) => {
      component.loginForm.setValue({
        username: email,
        password: 'password123',
      });
      expect(component.loginForm.valid).toBe(true);
    });
  });

  // =============== LOGIN METHOD TESTS ===============

  it('login should set loggingIn to true initially', async () => {
    vi.useFakeTimers();
    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    mockAuth.login.mockReturnValue(of({ token: 'abc' }).pipe(delay(100)));

    await component.login();
    expect(component.loggingIn).toBe(true);

    await vi.advanceTimersByTimeAsync(100);
    expect(component.loggingIn).toBe(false);
  });

  it('login should include honeypot field in login request', async () => {
    vi.useFakeTimers();
    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    // Create a mock form element with honeypot field
    const mockFormElement = document.createElement('form');
    const honeypotInput = document.createElement('input');
    honeypotInput.name = 'website';
    honeypotInput.value = 'http://spam.com';
    mockFormElement.appendChild(honeypotInput);

    component.loginFormElement = { nativeElement: mockFormElement } as any;

    await component.login();
    await vi.advanceTimersByTimeAsync(0);

    const loginCall = { args: mockAuth.login.mock.lastCall! };
    expect(loginCall.args[0].website).toBe('http://spam.com');
  });

  it('login should handle missing honeypot field gracefully', async () => {
    vi.useFakeTimers();
    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    const mockFormElement = document.createElement('form');
    component.loginFormElement = { nativeElement: mockFormElement } as any;

    await component.login();
    await vi.advanceTimersByTimeAsync(0);

    const loginCall = { args: mockAuth.login.mock.lastCall! };
    expect(loginCall.args[0].website).toBe('');
  });

  it('login should call authService.login with correct credentials', async () => {
    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    await component.login();

    expect(mockAuth.login).toHaveBeenCalledWith({
      username: 'test@example.com',
      password: 'password123',
      website: '',
    });
  });

  it('login should not call authService.login if form is invalid', async () => {
    component.loginForm.setValue({ username: 'invalid', password: '123' });

    await component.login();

    expect(mockAuth.login).not.toHaveBeenCalled();
  });

  it('login error should show notification with error message', async () => {
    const errorMsg = 'Authentication failed';
    mockAuth.login.mockReturnValue(throwError(() => ({ message: errorMsg })));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(component.loginError).toBe(errorMsg);
    expect(mockNotification.requestAndShow).not.toHaveBeenCalled();
  });

  it('login error should show default message when error has no message property', async () => {
    mockAuth.login.mockReturnValue(throwError(() => ({})));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(component.loginError).toBe('Login mislukt');
    expect(mockNotification.requestAndShow).not.toHaveBeenCalled();
  });

  it('login should set loggingIn to false on error', async () => {
    mockAuth.login.mockReturnValue(throwError(() => ({ message: 'Error' })));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(component.loggingIn).toBe(false);
  });

  it('login should set loggingIn to false on success', async () => {
    vi.useFakeTimers();
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(component.loggingIn).toBe(false);
  });

  it('login should clear loginError on success', async () => {
    vi.useFakeTimers();
    component.loginError = 'Previous error';
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(component.loginError).toBeUndefined();
  });

  it('should keep debug toggle available while loading overlay is shown', () => {
    component.loggingIn = true;
    // OnPush: mark the component view dirty after mutating state directly.
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    const button: HTMLButtonElement | null =
      fixture.nativeElement.querySelector('.debug-toggle');
    expect(button).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('.loading-overlay'),
    ).not.toBeNull();

    button?.click();
    fixture.detectChanges();

    expect(component.showDebugPanel).toBe(true);
    expect(fixture.nativeElement.querySelector('.debug-panel')).not.toBeNull();
  });

  it('hides the debug tooling and never opens the panel when debug is unavailable (production)', async () => {
    Object.defineProperty(component, 'debugAvailable', { value: false });
    fixture.componentRef.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.debug-toggle')).toBeNull();

    component.toggleDebugPanel();
    expect(component.showDebugPanel).toBe(false);

    mockAuth.login.mockReturnValue(throwError(() => ({ message: 'nope' })));
    component.loginForm.setValue({ username: 'a@b.com', password: '123456' });
    await component.login();

    expect(component.loginError).toBe('nope');
    expect(component.showDebugPanel).toBe(false);
    expect(component.debugLogOutput).toBe('No login issues captured yet.');
  });

  // =============== ERROR HANDLING TESTS ===============

  it('login should store error message in loginError property', async () => {
    const errorMsg = 'Invalid credentials';
    mockAuth.login.mockReturnValue(throwError(() => ({ message: errorMsg })));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(component.loginError).toBe(errorMsg);
  });

  it('login with invalid form should set specific error message', async () => {
    component.loginForm.setValue({ username: '', password: '' });

    await component.login();

    expect(component.loginError).toBe('Ongeldig formulier');
  });

  // =============== STORAGE TESTS ===============

  it('clearStorage should remove all three storage keys', () => {
    localStorage.setItem('appState', 'data1');
    localStorage.setItem('settingsState', 'data2');
    localStorage.setItem('keyZonesState', 'data3');

    component.clearStorage();

    expect(localStorage.getItem('appState')).toBeNull();
    expect(localStorage.getItem('settingsState')).toBeNull();
    expect(localStorage.getItem('keyZonesState')).toBeNull();
  });

  it('clearStorage should call appService.clearAppState', () => {
    component.clearStorage();

    expect(mockApp.clearAppState).toHaveBeenCalled();
  });

  it('clearStorage should show success notification', () => {
    component.clearStorage();

    expect(mockNotification.requestAndShow).toHaveBeenCalledWith(
      'Storage cleared',
      {
        body: 'Local storage has been reset.',
        icon: 'assets/icons/icon-192x192.png',
      },
    );
  });

  it('clearStorage should handle missing storage keys gracefully', () => {
    localStorage.clear();

    expect(() => component.clearStorage()).not.toThrow();
  });

  // =============== KEYBOARD INPUT TESTS ===============

  it('onLiveValueChange should update username when context is username', () => {
    component.keyboardContext = 'username';
    component.onLiveValueChange('test@email.com');

    expect(component.usernameControl.value).toBe('test@email.com');
  });

  it('onLiveValueChange should update password when context is password', () => {
    component.keyboardContext = 'password';
    component.onLiveValueChange('mypassword');

    expect(component.passwordControl.value).toBe('mypassword');
  });

  it('onLiveValueChange should not update anything if context is invalid', () => {
    component.usernameControl.setValue('original');
    component.keyboardContext = 'username';
    component.keyboardContext = 'invalid' as any;

    component.onLiveValueChange('newvalue');

    // Should remain unchanged since context was invalid
    expect(component.usernameControl.value).toBe('original');
  });

  it('onKeyboardEnter should set username value and update validity', () => {
    component.keyboardContext = 'username';
    component.onKeyboardEnter('user@example.com');

    expect(component.usernameControl.value).toBe('user@example.com');
  });

  it('onKeyboardEnter should set password value and update validity', () => {
    component.keyboardContext = 'password';
    component.onKeyboardEnter('password123');

    expect(component.passwordControl.value).toBe('password123');
  });

  it('onKeyboardEnter should emit value then empty string', () => {
    const emittedValues: any[] = [];
    component.oValue.subscribe((v) => emittedValues.push(v));

    component.keyboardContext = 'username';
    component.onKeyboardEnter('testvalue');

    expect(emittedValues).toEqual(['testvalue', '']);
  });

  it('onKeyboardEnter should clear liveValue', () => {
    component.liveValue = 'previous';
    component.keyboardContext = 'username';
    component.onKeyboardEnter('newvalue');

    expect(component.liveValue).toBe('');
  });

  // =============== FOCUS NAVIGATION TESTS ===============

  it('focusNext should switch context from username to password', () => {
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: vi.fn() },
    } as any;

    component.focusNext();

    expect(component.keyboardContext).toBe('password');
  });

  it('focusNext should set focused control to password control', async () => {
    vi.useFakeTimers();
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 5, selectionEnd: 5, focus: vi.fn() },
    } as any;

    component.focusNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(component.focusedControl).toBe(component.passwordControl);
  });

  it('focusNext should update caret and selection positions', async () => {
    vi.useFakeTimers();
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 3, selectionEnd: 7, focus: vi.fn() },
    } as any;

    component.focusNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(component.caretPosition).toBe(3);
    expect(component.selectionEnd).toBe(7);
  });

  it('focusNext should focus password input element', async () => {
    vi.useFakeTimers();
    const focusSpy = vi.fn();
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: focusSpy },
    } as any;

    component.focusNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(focusSpy).toHaveBeenCalled();
  });

  it('focusNext should set focusedInput to passwordInput', async () => {
    vi.useFakeTimers();
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: vi.fn() },
    } as any;

    component.focusNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(component.focusedInput).toBe(component.passwordInput);
  });

  it('focusNext should clear liveValue', async () => {
    vi.useFakeTimers();
    component.liveValue = 'text';
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: vi.fn() },
    } as any;

    component.focusNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(component.liveValue).toBe('');
  });

  it('focusNext should emit empty string', async () => {
    vi.useFakeTimers();
    const emittedValues: any[] = [];
    component.oValue.subscribe((v) => emittedValues.push(v));

    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: vi.fn() },
    } as any;

    component.focusNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(emittedValues[emittedValues.length - 1]).toBe('');
  });

  it('onFocus should set focusedControl', () => {
    const control = component.usernameControl;
    component.onFocus(control);

    expect(component.focusedControl).toBe(control);
  });

  it('onFocus should clear liveValue', () => {
    component.liveValue = 'previous';
    component.onFocus(component.usernameControl);

    expect(component.liveValue).toBe('');
  });

  it('onFocus should call onLiveValueChange with empty string', () => {
    vi.spyOn(component, 'onLiveValueChange');
    component.onFocus(component.usernameControl);

    expect(component.onLiveValueChange).toHaveBeenCalledWith('');
  });

  // =============== PROVIDER TESTS ===============

  it('onProvider should show form when called with apple', () => {
    component.showForm = false;

    component.onProvider('apple');

    expect(component.showForm).toBe(true);
  });

  it('onProvider should show form when called with google', () => {
    component.showForm = false;

    component.onProvider('google');

    expect(component.showForm).toBe(true);
  });

  it('onProvider should not hide form if already visible', () => {
    component.showForm = true;

    component.onProvider('apple');

    expect(component.showForm).toBe(true);
  });

  // =============== FORM TOGGLE TESTS ===============

  it('toggleForm should toggle showForm from false to true', () => {
    component.showForm = false;

    component.toggleForm();

    expect(component.showForm).toBe(true);
  });

  it('toggleForm should toggle showForm from true to false', () => {
    component.showForm = true;

    component.toggleForm();

    expect(component.showForm).toBe(false);
  });

  // =============== INITIALIZATION TESTS ===============

  it('should set isMobile to false for desktop user agent', () => {
    const original = navigator.userAgent;
    try {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true,
      });
      component.ngOnInit();
      expect(component.isMobile).toBe(false);
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: original,
        configurable: true,
      });
    }
  });

  it('should set showForm to false for desktop user agent', () => {
    const original = navigator.userAgent;
    try {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        configurable: true,
      });
      component.ngOnInit();
      expect(component.showForm).toBe(false);
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: original,
        configurable: true,
      });
    }
  });

  it('should detect Android user agent as mobile', () => {
    const original = navigator.userAgent;
    try {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'Android 12.0',
        configurable: true,
      });
      component.ngOnInit();
      expect(component.isMobile).toBe(true);
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: original,
        configurable: true,
      });
    }
  });

  it('should detect iPad user agent as mobile', () => {
    const original = navigator.userAgent;
    try {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'iPad OS 15',
        configurable: true,
      });
      component.ngOnInit();
      expect(component.isMobile).toBe(true);
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: original,
        configurable: true,
      });
    }
  });

  it('should detect iPod user agent as mobile', () => {
    const original = navigator.userAgent;
    try {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: 'iPod',
        configurable: true,
      });
      component.ngOnInit();
      expect(component.isMobile).toBe(true);
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: original,
        configurable: true,
      });
    }
  });

  // =============== COMPONENT STATE TESTS ===============

  it('should initialize with loggingIn as false', () => {
    expect(component.loggingIn).toBe(false);
  });

  it('should initialize with hide as true', () => {
    expect(component.hide).toBe(true);
  });

  it('should initialize with empty loginError', () => {
    expect(component.loginError).toBeUndefined();
  });

  it('should initialize with username keyboard context', () => {
    expect(component.keyboardContext).toBe('username');
  });

  it('should initialize with null focusedInput', () => {
    expect(component.focusedInput).toBeNull();
  });

  it('should have version from environment', () => {
    expect(component.version).toBe(environment.version);
  });

  // =============== PROPERTY ACCESSORS TESTS ===============

  it('usernameControl should be a FormControl', () => {
    expect(component.usernameControl instanceof FormControl).toBe(true);
  });

  it('passwordControl should be a FormControl', () => {
    expect(component.passwordControl instanceof FormControl).toBe(true);
  });

  it('both controls should be part of the form group', () => {
    expect(component.loginForm.get('username')).toBe(component.usernameControl);
    expect(component.loginForm.get('password')).toBe(component.passwordControl);
  });

  // =============== LIFECYCLE TESTS ===============

  it('ngOnDestroy should complete the destroy subject', () => {
    const completeSpy = vi.spyOn(component['destroy$'], 'complete');

    component.ngOnDestroy();

    expect(completeSpy).toHaveBeenCalled();
  });

  it('ngOnDestroy should emit destroy signal', () => {
    const nextSpy = vi.spyOn(component['destroy$'], 'next');

    component.ngOnDestroy();

    expect(nextSpy).toHaveBeenCalled();
  });

  it('ngAfterViewInit should not focus if username already has value', async () => {
    vi.useFakeTimers();
    const focusSpy = vi.fn();
    component.usernameInput = { nativeElement: { focus: focusSpy } } as any;
    component.usernameControl.setValue('existing@email.com');

    component.ngAfterViewInit();
    await vi.advanceTimersByTimeAsync(1000);

    expect(focusSpy).not.toHaveBeenCalled();
  });

  // =============== NAVIGATION TESTS ===============

  it('login success should navigate to dashboard', async () => {
    vi.useFakeTimers();
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('login should trigger push subscription immediately after success', async () => {
    vi.useFakeTimers();
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    await vi.advanceTimersByTimeAsync(0);
    expect(mockPush.ensureSubscription).toHaveBeenCalled();
  });

  it('login should call handleNewLoginToken before navigation', async () => {
    vi.useFakeTimers();
    const result = { token: 'abc123' };
    mockAuth.login.mockReturnValue(of(result));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(mockApp.handleNewLoginToken).toHaveBeenCalledWith(result);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  // =============== EDGE CASE TESTS ===============

  it('login should handle response with complex token object', async () => {
    vi.useFakeTimers();
    const complexResult = {
      token: 'abc123',
      expiresIn: 3600,
      user: { id: 1, name: 'Test User' },
    };
    mockAuth.login.mockReturnValue(of(complexResult));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(mockApp.handleNewLoginToken).toHaveBeenCalledWith(complexResult);
  });

  it('should handle rapid successive login attempts', async () => {
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await Promise.all([component.login(), component.login()]);

    expect(mockAuth.login).toHaveBeenCalledTimes(2);
  });

  it('onLiveValueChange should handle rapid changes', () => {
    component.keyboardContext = 'username';

    component.onLiveValueChange('a');
    component.onLiveValueChange('ab');
    component.onLiveValueChange('abc');

    expect(component.usernameControl.value).toBe('abc');
  });

  it('focusNext should handle null selection positions', async () => {
    vi.useFakeTimers();
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: {
        selectionStart: null,
        selectionEnd: null,
        focus: vi.fn(),
      },
    } as any;

    component.focusNext();
    await vi.advanceTimersByTimeAsync(0);

    expect(component.caretPosition).toBe(0);
    expect(component.selectionEnd).toBe(0);
  });

  it('login should not throw if router.navigate fails', () => {
    mockRouter.navigate.mockReturnValue(Promise.reject('Navigation failed'));
    mockAuth.login.mockReturnValue(of({ token: 'abc' }));

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });

    expect(() => component.login()).not.toThrow();
  });

  it('login should handle error response without message property', async () => {
    mockAuth.login.mockReturnValue(
      throwError(() => new Error('Network error')),
    );

    component.loginForm.setValue({
      username: 'test@example.com',
      password: 'password123',
    });
    await component.login();

    expect(component.loginError).toBeDefined();
  });
});
