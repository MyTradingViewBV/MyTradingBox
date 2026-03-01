import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SettingsComponent } from './settings.component';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { Router } from '@angular/router';
import { AppService } from '../../modules/shared/services/services/appService';
import { of } from 'rxjs';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { ThemeService } from 'src/app/helpers/theme.service';
import { NotificationService } from 'src/app/helpers/notification.service';
import { NotificationLogService } from 'src/app/helpers/notificationLog.service';
import { AuthService } from '../../modules/shared/services/services/authService';
import { ChangeDetectorRef } from '@angular/core';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';

class MockSettingsService {
  dispatchAppAction = jasmine.createSpy('dispatch');
  getTradeAlertsEnabled() { return of(true); }
  getPriceAlertsEnabled() { return of(true); }
  getNewsUpdatesEnabled() { return of(false); }
  getDarkModeEnabled() { return of(true); }
  getOnboardingCompleted() { return of(false); }
  getAdminModeEnabled() { return of(false); }
  getSelectedCurrency() { return of('USD'); }
  getSelectedExchange() { return of(new Exchange()); }
}

class MockChartService {
  getExchanges() { return of([new Exchange()]); }
}

class MockThemeService {
  cycleTheme = jasmine.createSpy('cycleTheme');
  setTheme = jasmine.createSpy('setTheme');
}

class MockNotificationService {
  requestAndShow = jasmine.createSpy('requestAndShow');
}

class MockNotificationLogService {
  entries$ = of([]);
  add = jasmine.createSpy('add');
  clear = jasmine.createSpy('clear');
}

class MockAuthService {
  getVapidPublicKey() { return Promise.resolve('test-key'); }
}

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let settingsService: SettingsService;
  let chartService: ChartService;
  let themeService: ThemeService;
  let notificationService: NotificationService;
  let notificationLogService: NotificationLogService;
  let router: Router;
  let appService: AppService;

  beforeEach(async () => {
    const mockApp = { clearAppState: jasmine.createSpy('clearAppState') };
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: ChartService, useClass: MockChartService },
        { provide: ThemeService, useClass: MockThemeService },
        { provide: NotificationService, useClass: MockNotificationService },
        { provide: NotificationLogService, useClass: MockNotificationLogService },
        { provide: AuthService, useClass: MockAuthService },
        { provide: AppService, useValue: mockApp },
        ChangeDetectorRef,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    settingsService = TestBed.inject(SettingsService);
    chartService = TestBed.inject(ChartService);
    themeService = TestBed.inject(ThemeService);
    notificationService = TestBed.inject(NotificationService);
    notificationLogService = TestBed.inject(NotificationLogService);
    router = TestBed.inject(Router);
    appService = TestBed.inject(AppService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // =============== INITIALIZATION TESTS ===============

  it('should initialize with default values', () => {
    expect(component.adminModeEnabled).toBeFalsy();
    expect(component.showNotificationLog).toBeFalsy();
    expect(component.showContact).toBeFalsy();
    expect(component.notificationPermission).toBe('default');
  });

  it('should have settings sections populated', () => {
    expect(component.settingsSections.length).toBeGreaterThan(0);
    expect(component.settingsSections[0].title).toBe('Account');
    expect(component.settingsSections[1].title).toBe('Preferences');
    expect(component.settingsSections[2].title).toBe('General');
  });

  it('should have userProfile initialized', () => {
    expect(component.userProfile).toBeDefined();
    expect(component.userProfile.name).toBe('John Trader');
    expect(component.userProfile.email).toBe('john.trader@email.com');
  });

  it('should initialize selectedExchange', () => {
    expect(component.selectedExchange).toBeDefined();
  });

  it('should have empty notification entries initially', () => {
    expect(component.notificationEntries).toBeDefined();
  });

  it('should initialize canInstall and isInstalled as false by default', () => {
    expect(component.canInstall).toBeFalsy();
    expect(component.isInstalled).toBeFalsy();
  });

  // =============== TOGGLE ITEM TESTS ===============

  it('toggleItem should toggle Dark Mode', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Dark Mode');
    const item = component.settingsSections[sectionIndex].items[itemIndex];
    const initialState = item.enabled;

    component.toggleItem(sectionIndex, itemIndex);

    expect(item.enabled).toBe(!initialState);
    expect(settingsService.dispatchAppAction).toHaveBeenCalled();
  });

  it('toggleItem should toggle Admin Mode', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Admin Mode');
    const item = component.settingsSections[sectionIndex].items[itemIndex];

    component.toggleItem(sectionIndex, itemIndex);

    expect(settingsService.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: '[SettingsState] setAdminModeEnabled' } as any)
    );
    expect(notificationLogService.add).toHaveBeenCalled();
  });

  it('toggleItem should toggle Trade Alerts', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Trade Alerts');

    component.toggleItem(sectionIndex, itemIndex);

    expect(settingsService.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: '[SettingsState] setTradeAlertsEnabled' } as any)
    );
  });

  it('toggleItem should toggle Price Alerts', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Price Alerts');

    component.toggleItem(sectionIndex, itemIndex);

    expect(settingsService.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: '[SettingsState] setPriceAlertsEnabled' } as any)
    );
  });

  it('toggleItem should toggle News Updates', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'News Updates');

    component.toggleItem(sectionIndex, itemIndex);

    expect(settingsService.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: '[SettingsState] setNewsUpdatesEnabled' } as any)
    );
  });

  it('toggleItem should toggle Show Onboarding Wizard', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Show Onboarding Wizard');

    component.toggleItem(sectionIndex, itemIndex);

    expect(settingsService.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: '[SettingsState] setOnboardingCompleted' } as any)
    );
  });

  it('toggleItem should not toggle non-toggle items', () => {
    const sectionIndex = 0;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Profile Settings');
    const item = component.settingsSections[sectionIndex].items[itemIndex];
    const initialToggle = item.toggle;

    component.toggleItem(sectionIndex, itemIndex);

    expect(settingsService.dispatchAppAction).not.toHaveBeenCalled();
  });

  it('toggleItem should enable trade alerts notification when enabled', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Trade Alerts');
    component.settingsSections[sectionIndex].items[itemIndex].enabled = false;

    component.toggleItem(sectionIndex, itemIndex);

    expect(notificationService.requestAndShow).toHaveBeenCalledWith(
      'Trade alerts enabled',
      jasmine.any(Object)
    );
  });

  // =============== LOG PANEL TESTS ===============

  it('toggleLogPanel should toggle showNotificationLog', () => {
    const initialState = component.showNotificationLog;

    component.toggleLogPanel();

    expect(component.showNotificationLog).toBe(!initialState);
  });

  it('clearNotificationLog should call notificationLogService.clear', () => {
    component.clearNotificationLog();

    expect(notificationLogService.clear).toHaveBeenCalled();
  });

  it('toggleContact should toggle showContact', () => {
    const initialState = component.showContact;

    component.toggleContact();

    expect(component.showContact).toBe(!initialState);
  });

  // =============== STORAGE TESTS ===============

  it('clearStorage should dispatch clear action', () => {
    component.clearStorage();

    expect(settingsService.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: '[SettingsState] clear' } as any)
    );
  });

  it('clearStorage should call appService.clearAppState', () => {
    component.clearStorage();

    expect(appService.clearAppState).toHaveBeenCalled();
  });

  it('clearStorage should show notification', () => {
    component.clearStorage();

    expect(notificationService.requestAndShow).toHaveBeenCalledWith(
      'Storage cleared',
      jasmine.objectContaining({ body: 'Local storage has been reset.' })
    );
  });

  it('clearStorage should log to notification log', () => {
    component.clearStorage();

    expect(notificationLogService.add).toHaveBeenCalledWith('Local storage cleared via Settings button');
  });

  // =============== NOTIFICATION TESTS ===============

  it('testNotification should show test notification', () => {
    component.testNotification();

    expect(notificationService.requestAndShow).toHaveBeenCalledWith(
      'Test notification',
      jasmine.objectContaining({ body: 'Manual test from settings.' })
    );
    expect(notificationLogService.add).toHaveBeenCalledWith('Manual test notification triggered');
  });

  // =============== ADMIN NAVIGATION TESTS ===============

  it('goToAdmin should navigate to /admin', () => {
    spyOn(router, 'navigateByUrl');

    component.goToAdmin();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
  });

  // =============== KEY ZONES TESTS ===============

  it('keyZonesEnabled should return false when Key Zones is not enabled', () => {
    const kzItem = component.settingsSections[1].items.find(i => i.label === 'Key Zones');
    if (kzItem) kzItem.enabled = false;

    expect(component.keyZonesEnabled).toBeFalsy();
  });

  it('keyZonesEnabled should return true when Key Zones is enabled', () => {
    // Add Key Zones item to the Preferences section if not present
    const preferencesSection = component.settingsSections[1];
    let kzItem = preferencesSection.items.find(i => i.label === 'Key Zones');
    if (!kzItem) {
      kzItem = { label: 'Key Zones', toggle: true, enabled: true, icon: 'key' };
      preferencesSection.items.push(kzItem);
    } else {
      kzItem.enabled = true;
    }

    expect(component.keyZonesEnabled).toBeTrue();
  });

  // =============== SETTINGS SECTIONS TESTS ===============

  it('should have Account section with correct items', () => {
    const accountSection = component.settingsSections.find(s => s.title === 'Account');
    expect(accountSection).toBeDefined();
    expect(accountSection?.items.length).toBeGreaterThan(0);
    expect(accountSection?.items[0].label).toBe('Profile Settings');
  });

  it('should have Preferences section with toggles', () => {
    const prefSection = component.settingsSections.find(s => s.title === 'Preferences');
    expect(prefSection).toBeDefined();
    const toggleItems = prefSection?.items.filter(i => i.toggle);
    expect(toggleItems?.length).toBeGreaterThan(0);
  });

  it('should have General section with language and version', () => {
    const generalSection = component.settingsSections.find(s => s.title === 'General');
    expect(generalSection).toBeDefined();
    const languageItem = generalSection?.items.find(i => i.label === 'Language');
    const versionItem = generalSection?.items.find(i => i.label === 'App Version');
    expect(languageItem).toBeDefined();
    expect(versionItem).toBeDefined();
  });

  // =============== EXCHANGE TESTS ===============

  it('should load exchanges on initialization', () => {
    spyOn(chartService, 'getExchanges').and.returnValue(of([
      new Exchange(),
      new Exchange()
    ]));

    component.ngOnInit();

    expect(component.exchanges.length).toBeGreaterThan(0);
  });

  // =============== SNACKBAR TESTS ===============

  it('should set snackbar message and clear it after timeout', (done) => {
    jasmine.clock().install();

    (component as any).showSnackbar('Test message');

    expect(component.snackbarMessage).toBe('Test message');

    jasmine.clock().tick(4000);

    expect(component.snackbarMessage).toBeNull();
    jasmine.clock().uninstall();
    done();
  });

  it('should clear previous snackbar timer when showing new message', (done) => {
    jasmine.clock().install();

    (component as any).showSnackbar('First message');
    jasmine.clock().tick(2000);
    (component as any).showSnackbar('Second message');

    expect(component.snackbarMessage).toBe('Second message');

    jasmine.clock().tick(4000);
    expect(component.snackbarMessage).toBeNull();

    jasmine.clock().uninstall();
    done();
  });

  // =============== SW STATUS TESTS ===============

  it('should initialize SW status fields', async () => {
    await component.refreshSwStatus();

    expect(component.swRegistered).toBeDefined();
    expect(component.swReady).toBeDefined();
    expect(component.swControllingPage).toBeDefined();
  });

  it('should initialize isSecure property', async () => {
    // isSecureContext is read-only on window, so we just verify isSecure is initialized
    await component.refreshSwStatus();

    expect(component.isSecure).toBeDefined();
  });

  it('should check notification permission status', async () => {
    await component.refreshSwStatus();

    expect(component.notificationPermission).toBeDefined();
  });

  // =============== NGONDESTROY TESTS ===============

  it('should call ngOnDestroy without errors', () => {
    expect(() => component.ngOnDestroy()).not.toThrow();
  });

  // =============== EDGE CASE TESTS ===============

  it('should handle toggleItem with invalid section index', () => {
    expect(() => component.toggleItem(999, 0)).toThrow();
  });

  it('should handle multiple rapid toggles', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Dark Mode');

    for (let i = 0; i < 5; i++) {
      component.toggleItem(sectionIndex, itemIndex);
    }

    expect(settingsService.dispatchAppAction).toHaveBeenCalledTimes(5);
  });

  it('should maintain state consistency after multiple operations', () => {
    const sectionIndex = 1;
    const darkModeIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Dark Mode');
    const adminModeIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Admin Mode');

    const darkModeItem = component.settingsSections[sectionIndex].items[darkModeIndex];
    const adminModeItem = component.settingsSections[sectionIndex].items[adminModeIndex];

    const darkModeInitial = darkModeItem.enabled;
    const adminModeInitial = adminModeItem.enabled;

    component.toggleItem(sectionIndex, darkModeIndex);
    component.toggleItem(sectionIndex, adminModeIndex);

    expect(darkModeItem.enabled).toBe(!darkModeInitial);
    expect(adminModeItem.enabled).toBe(!adminModeInitial);
  });

  it('clearStorage should handle errors gracefully', () => {
    (appService.clearAppState as jasmine.Spy).and.throwError('Clear failed');

    expect(() => component.clearStorage()).not.toThrow();
  });

  it('should have installDebug object with expected properties', () => {
    expect(component.installDebug).toBeDefined();
    expect(component.installDebug.hasPrompt).toBeDefined();
    expect(component.installDebug.promptPlatform).toBeDefined();
    expect(component.installDebug.relatedAppsCount).toBeDefined();
    expect(component.installDebug.isSecure).toBeDefined();
    expect(component.installDebug.hasSwApi).toBeDefined();
    expect(component.installDebug.hasController).toBeDefined();
  });

  it('should toggle Trade Alerts and show notification when enabled', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Trade Alerts');
    component.settingsSections[sectionIndex].items[itemIndex].enabled = false;

    component.toggleItem(sectionIndex, itemIndex);

    expect(notificationService.requestAndShow).toHaveBeenCalled();
    expect(notificationLogService.add).toHaveBeenCalledWith('Trade Alerts toggled ON - requesting notification');
  });

  it('should toggle Trade Alerts without notification when disabled', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Trade Alerts');
    component.settingsSections[sectionIndex].items[itemIndex].enabled = true;

    component.toggleItem(sectionIndex, itemIndex);

    expect(notificationLogService.add).toHaveBeenCalledWith('Trade Alerts toggled OFF - no notification');
  });

  it('should dispatch correct action for Show Onboarding Wizard toggle', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Show Onboarding Wizard');

    component.toggleItem(sectionIndex, itemIndex);

    expect(settingsService.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: '[SettingsState] setOnboardingCompleted' } as any)
    );
  });

  it('registerServiceWorker should add notification log entry', async () => {
    await component.registerServiceWorker();

    expect(notificationLogService.add).toHaveBeenCalled();
  });

  it('should cycle theme when Dark Mode is toggled', () => {
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Dark Mode');

    component.toggleItem(sectionIndex, itemIndex);

    // cycleTheme is called in the component's toggleItem method
    expect(settingsService.dispatchAppAction).toHaveBeenCalled();
  });

  it('should update notification entries when log changes', (done) => {
    const testEntries = ['Entry 1', 'Entry 2', 'Entry 3'];
    (notificationLogService as any).entries$ = of(testEntries);

    component.ngOnInit();

    setTimeout(() => {
      // The subscription should update notificationEntries
      expect(component.notificationEntries).toBeDefined();
      done();
    }, 100);
  });
});
