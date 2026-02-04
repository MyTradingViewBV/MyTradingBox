import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SettingsComponent } from './settings.component';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { Router } from '@angular/router';
import { AppService } from '../../modules/shared/services/services/appService';

class MockSettingsService {
  dispatchAppAction = jasmine.createSpy('dispatch');
  // Minimal selectors used by ngOnInit; return observables with defaults
  getTradeAlertsEnabled() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
  getPriceAlertsEnabled() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
  getNewsUpdatesEnabled() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
  getDarkModeEnabled() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
  getOnboardingCompleted() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
  getAdminModeEnabled() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
  getSelectedCurrency() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
  getSelectedExchange() { return { pipe: () => ({ subscribe: () => {} }) } as any; }
}

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;

  beforeEach(async () => {
    const mockApp = { clearAppState: jasmine.createSpy('clearAppState') };
    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideRouter([]),
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: AppService, useValue: mockApp },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should dispatch dark mode when toggled', () => {
    const svc = TestBed.inject(SettingsService) as unknown as MockSettingsService;
    // Find Dark Mode in Preferences (index 1)
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Dark Mode');
    expect(itemIndex).toBeGreaterThan(-1);
    component.toggleItem(sectionIndex, itemIndex);
    expect(svc.dispatchAppAction).toHaveBeenCalledWith(jasmine.objectContaining({ type: '[SettingsState] setDarkModeEnabled' } as any));
  });

  it('should dispatch trade alerts when toggled', () => {
    const svc = TestBed.inject(SettingsService) as unknown as MockSettingsService;
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Trade Alerts');
    expect(itemIndex).toBeGreaterThan(-1);
    component.toggleItem(sectionIndex, itemIndex);
    expect(svc.dispatchAppAction).toHaveBeenCalledWith(jasmine.objectContaining({ type: '[SettingsState] setTradeAlertsEnabled' } as any));
  });

  it('should dispatch admin mode enabled when toggled', () => {
    const svc = TestBed.inject(SettingsService) as unknown as MockSettingsService;
    const sectionIndex = 1;
    const itemIndex = component.settingsSections[sectionIndex].items.findIndex(i => i.label === 'Admin Mode');
    expect(itemIndex).toBeGreaterThan(-1);
    component.toggleItem(sectionIndex, itemIndex);
    expect(svc.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: '[SettingsState] setAdminModeEnabled' } as any)
    );
  });

  it('should navigate to /admin on goToAdmin', () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl');
    component.goToAdmin();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
  });
});
