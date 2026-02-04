import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LoginComponent } from './login.component';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService } from '../../modules/shared/services/http/authService';
import { AppService } from '../../modules/shared/services/services/appService';
import { NotificationService } from '../../helpers/notification.service';
import { PushNotificationService } from '../../helpers/push-notification.service';
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
  const mockPush = { ensureSubscription: jasmine.createSpy('ensureSubscription') };

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

  it('login should show error when form is invalid', () => {
    component.loginForm.setValue({ username: '', password: '' });
    component.login();
    expect(component.loggingIn).toBeFalse();
    expect(component.loginError).toBe('Ongeldig formulier');
    expect(mockNotification.requestAndShow).toHaveBeenCalled();
    expect(mockAuth.login).not.toHaveBeenCalled();
  });

  it('login should handle success path and navigate + schedule push subscription', fakeAsync(() => {
    const result = { token: 'abc' };
    mockAuth.login.and.returnValue(of(result));

    component.loginForm.setValue({ username: 'a@b.com', password: '123456' });

    component.login();

    // subscription next should run synchronously
    expect(mockApp.handleNewLoginToken).toHaveBeenCalledWith(result);
    expect(component.loggingIn).toBeFalse();
    expect(component.loginError).toBeUndefined();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);

    // ensure push subscription scheduled after 500ms
    tick(500);
    expect(mockPush.ensureSubscription).toHaveBeenCalled();
  }));

  it('login should handle error path and show notification', () => {
    const err = { message: 'Invalid credentials' };
    mockAuth.login.and.returnValue(throwError(() => err));

    component.loginForm.setValue({ username: 'a@b.com', password: '123456' });

    component.login();

    expect(component.loggingIn).toBeFalse();
    expect(component.loginError).toBe(err.message);
    expect(mockNotification.requestAndShow).toHaveBeenCalled();
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
});
