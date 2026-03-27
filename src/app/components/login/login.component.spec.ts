import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { Router } from '@angular/router';
import { of, throwError, delay } from 'rxjs';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService } from '../../modules/shared/services/http/authService';
import { AppService } from '../../modules/shared/services/services/appService';
import { NotificationService } from '../../helpers/notification.service';
import { PushNotificationService } from '../../helpers/push-notification.service';
import { FormControl } from '@angular/forms';
import { environment } from '../../../environments/environment';
import * as keyUtils from '../../helpers/key-event-utils';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  const mockAuth = { login: jasmine.createSpy('login') };
  const mockRouter = { navigate: jasmine.createSpy('navigate') };
  const mockApp = {
    handleNewLoginToken: jasmine.createSpy('handleNewLoginToken'),
    clearAppState: jasmine.createSpy('clearAppState'),
  };
  const mockNotification = { requestAndShow: jasmine.createSpy('requestAndShow') };
  const mockPush = {
    ensureSubscription: jasmine.createSpy('ensureSubscription'),
    primePermissionFromUserGesture: jasmine
      .createSpy('primePermissionFromUserGesture')
      .and.returnValue(Promise.resolve('default')),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideNoopAnimations(),
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuth },
        { provide: AppService, useValue: mockApp },
        { provide: NotificationService, useValue: mockNotification },
        { provide: PushNotificationService, useValue: mockPush },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Reset spies
    mockAuth.login.calls.reset();
    mockRouter.navigate.calls.reset();
    mockApp.handleNewLoginToken.calls.reset();
    mockApp.clearAppState.calls.reset();
    mockNotification.requestAndShow.calls.reset();
    mockPush.ensureSubscription.calls.reset();
    mockPush.primePermissionFromUserGesture.calls.reset();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should set isMobile and showForm on mobile user agent', () => {
    const original = navigator.userAgent;
    try {
      Object.defineProperty(window.navigator, 'userAgent', { value: 'iPhone', configurable: true });
      component.ngOnInit();
      expect(component.isMobile).toBeTrue();
      expect(component.showForm).toBeTrue();
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', { value: original, configurable: true });
    }
  });

  it('usernameControl and passwordControl should return proper controls', () => {
    expect(component.usernameControl).toBe(component.loginForm.controls.username);
    expect(component.passwordControl).toBe(component.loginForm.controls.password);
  });

  it('ngAfterViewInit should focus username input when empty', fakeAsync(() => {
    component.usernameInput = { nativeElement: { focus: jasmine.createSpy('focus') } } as any;
    component.ngAfterViewInit();
    tick(1000);
    expect(component.usernameInput.nativeElement.focus).toHaveBeenCalled();
  }));

  it('login should show error when form is invalid', async () => {
    component.loginForm.setValue({ username: '', password: '' });
    await component.login();
    expect(component.loggingIn).toBeFalse();
    expect(component.loginError).toBe('Ongeldig formulier');
    expect(mockNotification.requestAndShow).toHaveBeenCalled();
    expect(mockAuth.login).not.toHaveBeenCalled();
  });

  it('login should handle success path and navigate + subscribe push', fakeAsync(() => {
    const result = { token: 'abc' };
    mockAuth.login.and.returnValue(of(result));

    component.loginForm.setValue({ username: 'a@b.com', password: '123456' });

    component.login();
    tick();

    // subscription next should run synchronously
    expect(mockApp.handleNewLoginToken).toHaveBeenCalledWith(result);
    expect(component.loggingIn).toBeFalse();
    expect(component.loginError).toBeUndefined();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(mockPush.primePermissionFromUserGesture).toHaveBeenCalled();
    expect(mockPush.ensureSubscription).toHaveBeenCalled();
  }));

  it('login should handle error path and show notification', fakeAsync(() => {
    const err = { message: 'Invalid credentials' };
    mockAuth.login.and.returnValue(throwError(() => err));

    component.loginForm.setValue({ username: 'a@b.com', password: '123456' });

    component.login();
    tick();

    expect(component.loggingIn).toBeFalse();
    expect(component.loginError).toBe(err.message);
    expect(mockNotification.requestAndShow).toHaveBeenCalled();
  }));

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

  it('focusNext should move focus to password field and set keyboardContext', fakeAsync(() => {
    component.keyboardContext = 'username';
    component.liveValue = 'some';
    component.passwordInput = { nativeElement: { selectionStart: 2, selectionEnd: 2, focus: jasmine.createSpy('focus') } } as any;

    component.focusNext();
    // let the internal setTimeout run
    tick();

    expect(component.keyboardContext).toBe('password');
    expect(component.focusedControl).toBe(component.passwordControl);
    expect(component.caretPosition).toBe(2);
    expect(component.selectionEnd).toBe(2);
    expect(component.passwordInput.nativeElement.focus).toHaveBeenCalled();
  }));

  it('handleKey should not throw when called (safe delegation)', () => {
    const ev = new KeyboardEvent('keydown');
    expect(() => component.handleKey(ev)).not.toThrow();
  });

  // =============== FORM VALIDATION TESTS ===============

  it('loginForm should be invalid when username is empty', () => {
    component.loginForm.setValue({ username: '', password: 'password123' });
    expect(component.loginForm.valid).toBeFalse();
  });

  it('loginForm should be invalid when password is empty', () => {
    component.loginForm.setValue({ username: 'test@example.com', password: '' });
    expect(component.loginForm.valid).toBeFalse();
  });

  it('loginForm should be invalid when username is not an email', () => {
    component.loginForm.setValue({ username: 'notanemail', password: 'password123' });
    expect(component.loginForm.valid).toBeFalse();
  });

  it('loginForm should be invalid when password is less than 6 characters', () => {
    component.loginForm.setValue({ username: 'test@example.com', password: '12345' });
    expect(component.loginForm.valid).toBeFalse();
  });

  it('loginForm should be valid with correct email and password', () => {
    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    expect(component.loginForm.valid).toBeTrue();
  });

  it('loginForm should accept various valid email formats', () => {
    const validEmails = [
      'user@example.com',
      'test.user@example.co.uk',
      'user+tag@domain.com',
      'user123@example-domain.com',
    ];

    validEmails.forEach((email) => {
      component.loginForm.setValue({ username: email, password: 'password123' });
      expect(component.loginForm.valid).toBeTrue();
    });
  });

  // =============== LOGIN METHOD TESTS ===============

  it('login should set loggingIn to true initially', fakeAsync(() => {
    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    mockAuth.login.and.returnValue(of({ token: 'abc' }).pipe(delay(100)));

    component.login();
    expect(component.loggingIn).toBeTrue();
    
    tick(100);
    expect(component.loggingIn).toBeFalse();
  }));

  it('login should include honeypot field in login request', fakeAsync(() => {
    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    // Create a mock form element with honeypot field
    const mockFormElement = document.createElement('form');
    const honeypotInput = document.createElement('input');
    honeypotInput.name = 'website';
    honeypotInput.value = 'http://spam.com';
    mockFormElement.appendChild(honeypotInput);

    component.loginFormElement = { nativeElement: mockFormElement } as any;

    component.login();
    tick();

    const loginCall = mockAuth.login.calls.mostRecent();
    expect(loginCall.args[0].website).toBe('http://spam.com');
  }));

  it('login should handle missing honeypot field gracefully', fakeAsync(() => {
    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    const mockFormElement = document.createElement('form');
    component.loginFormElement = { nativeElement: mockFormElement } as any;

    component.login();
    tick();

    const loginCall = mockAuth.login.calls.mostRecent();
    expect(loginCall.args[0].website).toBe('');
  }));

  it('login should call authService.login with correct credentials', () => {
    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    component.login();

    expect(mockAuth.login).toHaveBeenCalledWith({
      username: 'test@example.com',
      password: 'password123',
      website: '',
    });
  });

  it('login should not call authService.login if form is invalid', () => {
    component.loginForm.setValue({ username: 'invalid', password: '123' });

    component.login();

    expect(mockAuth.login).not.toHaveBeenCalled();
  });

  it('login error should show notification with error message', () => {
    const errorMsg = 'Authentication failed';
    mockAuth.login.and.returnValue(throwError(() => ({ message: errorMsg })));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(mockNotification.requestAndShow).toHaveBeenCalledWith('Login mislukt', { body: errorMsg });
  });

  it('login error should show default message when error has no message property', () => {
    mockAuth.login.and.returnValue(throwError(() => ({})));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(mockNotification.requestAndShow).toHaveBeenCalledWith('Login mislukt', { body: 'Login mislukt' });
  });

  it('login should set loggingIn to false on error', () => {
    mockAuth.login.and.returnValue(throwError(() => ({ message: 'Error' })));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(component.loggingIn).toBeFalse();
  });

  it('login should set loggingIn to false on success', fakeAsync(() => {
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(component.loggingIn).toBeFalse();
  }));

  it('login should clear loginError on success', fakeAsync(() => {
    component.loginError = 'Previous error';
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(component.loginError).toBeUndefined();
  }));

  // =============== ERROR HANDLING TESTS ===============

  it('login should store error message in loginError property', () => {
    const errorMsg = 'Invalid credentials';
    mockAuth.login.and.returnValue(throwError(() => ({ message: errorMsg })));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(component.loginError).toBe(errorMsg);
  });

  it('login with invalid form should set specific error message', () => {
    component.loginForm.setValue({ username: '', password: '' });

    component.login();

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

    expect(mockNotification.requestAndShow).toHaveBeenCalledWith('Storage cleared', {
      body: 'Local storage has been reset.',
      icon: 'assets/icons/icon-192x192.png',
    });
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
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: jasmine.createSpy('focus') },
    } as any;

    component.focusNext();

    expect(component.keyboardContext).toBe('password');
  });

  it('focusNext should set focused control to password control', fakeAsync(() => {
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 5, selectionEnd: 5, focus: jasmine.createSpy('focus') },
    } as any;

    component.focusNext();
    tick();

    expect(component.focusedControl).toBe(component.passwordControl);
  }));

  it('focusNext should update caret and selection positions', fakeAsync(() => {
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 3, selectionEnd: 7, focus: jasmine.createSpy('focus') },
    } as any;

    component.focusNext();
    tick();

    expect(component.caretPosition).toBe(3);
    expect(component.selectionEnd).toBe(7);
  }));

  it('focusNext should focus password input element', fakeAsync(() => {
    const focusSpy = jasmine.createSpy('focus');
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: focusSpy },
    } as any;

    component.focusNext();
    tick();

    expect(focusSpy).toHaveBeenCalled();
  }));

  it('focusNext should set focusedInput to passwordInput', fakeAsync(() => {
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: jasmine.createSpy('focus') },
    } as any;

    component.focusNext();
    tick();

    expect(component.focusedInput).toBe(component.passwordInput);
  }));

  it('focusNext should clear liveValue', fakeAsync(() => {
    component.liveValue = 'text';
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: jasmine.createSpy('focus') },
    } as any;

    component.focusNext();
    tick();

    expect(component.liveValue).toBe('');
  }));

  it('focusNext should emit empty string', fakeAsync(() => {
    const emittedValues: any[] = [];
    component.oValue.subscribe((v) => emittedValues.push(v));

    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: 0, selectionEnd: 0, focus: jasmine.createSpy('focus') },
    } as any;

    component.focusNext();
    tick();

    expect(emittedValues[emittedValues.length - 1]).toBe('');
  }));

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
    spyOn(component, 'onLiveValueChange');
    component.onFocus(component.usernameControl);

    expect(component.onLiveValueChange).toHaveBeenCalledWith('');
  });

  // =============== PROVIDER TESTS ===============

  it('onProvider should show form when called with apple', () => {
    component.showForm = false;

    component.onProvider('apple');

    expect(component.showForm).toBeTrue();
  });

  it('onProvider should show form when called with google', () => {
    component.showForm = false;

    component.onProvider('google');

    expect(component.showForm).toBeTrue();
  });

  it('onProvider should not hide form if already visible', () => {
    component.showForm = true;

    component.onProvider('apple');

    expect(component.showForm).toBeTrue();
  });

  // =============== FORM TOGGLE TESTS ===============

  it('toggleForm should toggle showForm from false to true', () => {
    component.showForm = false;

    component.toggleForm();

    expect(component.showForm).toBeTrue();
  });

  it('toggleForm should toggle showForm from true to false', () => {
    component.showForm = true;

    component.toggleForm();

    expect(component.showForm).toBeFalse();
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
      expect(component.isMobile).toBeFalse();
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
      expect(component.showForm).toBeFalse();
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
      expect(component.isMobile).toBeTrue();
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
      expect(component.isMobile).toBeTrue();
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
      expect(component.isMobile).toBeTrue();
    } finally {
      Object.defineProperty(window.navigator, 'userAgent', {
        value: original,
        configurable: true,
      });
    }
  });

  // =============== COMPONENT STATE TESTS ===============

  it('should initialize with loggingIn as false', () => {
    expect(component.loggingIn).toBeFalse();
  });

  it('should initialize with hide as true', () => {
    expect(component.hide).toBeTrue();
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
    expect(component.usernameControl instanceof FormControl).toBeTrue();
  });

  it('passwordControl should be a FormControl', () => {
    expect(component.passwordControl instanceof FormControl).toBeTrue();
  });

  it('both controls should be part of the form group', () => {
    expect(component.loginForm.get('username')).toBe(component.usernameControl);
    expect(component.loginForm.get('password')).toBe(component.passwordControl);
  });

  // =============== LIFECYCLE TESTS ===============

  it('ngOnDestroy should complete the destroy subject', () => {
    const completeSpy = spyOn(component['destroy$'], 'complete');

    component.ngOnDestroy();

    expect(completeSpy).toHaveBeenCalled();
  });

  it('ngOnDestroy should emit destroy signal', () => {
    const nextSpy = spyOn(component['destroy$'], 'next');

    component.ngOnDestroy();

    expect(nextSpy).toHaveBeenCalled();
  });

  it('ngAfterViewInit should not focus if username already has value', fakeAsync(() => {
    const focusSpy = jasmine.createSpy('focus');
    component.usernameInput = { nativeElement: { focus: focusSpy } } as any;
    component.usernameControl.setValue('existing@email.com');

    component.ngAfterViewInit();
    tick(1000);

    expect(focusSpy).not.toHaveBeenCalled();
  }));

  // =============== NAVIGATION TESTS ===============

  it('login success should navigate to dashboard', fakeAsync(() => {
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
  }));

  it('login should trigger push subscription immediately after success', fakeAsync(() => {
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    tick();
    expect(mockPush.ensureSubscription).toHaveBeenCalled();
  }));

  it('login should call handleNewLoginToken before navigation', fakeAsync(() => {
    const result = { token: 'abc123' };
    mockAuth.login.and.returnValue(of(result));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(mockApp.handleNewLoginToken).toHaveBeenCalledWith(result);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
  }));

  // =============== EDGE CASE TESTS ===============

  it('login should handle response with complex token object', fakeAsync(() => {
    const complexResult = {
      token: 'abc123',
      expiresIn: 3600,
      user: { id: 1, name: 'Test User' },
    };
    mockAuth.login.and.returnValue(of(complexResult));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(mockApp.handleNewLoginToken).toHaveBeenCalledWith(complexResult);
  }));

  it('should handle rapid successive login attempts', () => {
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();
    component.login();

    expect(mockAuth.login).toHaveBeenCalledTimes(2);
  });

  it('onLiveValueChange should handle rapid changes', () => {
    component.keyboardContext = 'username';

    component.onLiveValueChange('a');
    component.onLiveValueChange('ab');
    component.onLiveValueChange('abc');

    expect(component.usernameControl.value).toBe('abc');
  });

  it('focusNext should handle null selection positions', fakeAsync(() => {
    component.keyboardContext = 'username';
    component.passwordInput = {
      nativeElement: { selectionStart: null, selectionEnd: null, focus: jasmine.createSpy('focus') },
    } as any;

    component.focusNext();
    tick();

    expect(component.caretPosition).toBe(0);
    expect(component.selectionEnd).toBe(0);
  }));

  it('login should not throw if router.navigate fails', () => {
    mockRouter.navigate.and.returnValue(Promise.reject('Navigation failed'));
    mockAuth.login.and.returnValue(of({ token: 'abc' }));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });

    expect(() => component.login()).not.toThrow();
  });

  it('login should handle error response without message property', () => {
    mockAuth.login.and.returnValue(throwError(() => new Error('Network error')));

    component.loginForm.setValue({ username: 'test@example.com', password: 'password123' });
    component.login();

    expect(component.loginError).toBeDefined();
  });
});
