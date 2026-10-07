import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FooterComponent } from './footer.component';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { UiModeOverride } from 'src/app/store/settings/settings.reducer';

describe('FooterComponent', () => {
  let fixture: ComponentFixture<FooterComponent>;
  let component: FooterComponent;
  let navigate: ReturnType<typeof vi.spyOn>;
  let dispatchAppAction: ReturnType<typeof vi.fn>;

  async function setup(options: { admin?: boolean; uiMode?: UiModeOverride } = {}) {
    dispatchAppAction = vi.fn();
    await TestBed.configureTestingModule({
      imports: [FooterComponent, TranslateModule.forRoot()],
      providers: [
        provideRouter([]),
        { provide: AppService, useValue: { isAdmin: () => of(options.admin ?? false) } },
        {
          provide: SettingsService,
          useValue: {
            getUiModeOverride: () => of(options.uiMode ?? 'mobile'),
            dispatchAppAction,
          },
        },
      ],
    }).compileComponents();

    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const labels = () =>
    fixture.debugElement
      .queryAll(By.css('footer .footer-btn .label'))
      .map((el) => (el.nativeElement as HTMLElement).textContent?.trim());

  afterEach(() => vi.restoreAllMocks());

  describe('for a regular user', () => {
    beforeEach(() => setup({ admin: false }));

    it('creates and renders the footer', () => {
      expect(component).toBeTruthy();
      expect(fixture.debugElement.query(By.css('footer.app-footer'))).toBeTruthy();
    });

    it('renders chart, orders, balance and settings buttons only', () => {
      expect(labels()).toEqual([
        'FOOTER.CHART',
        'FOOTER.ORDERS',
        'FOOTER.BALANCE',
        'FOOTER.SETTINGS',
      ]);
    });

    it('gives every button type="button" with an icon and a label', () => {
      const buttons = fixture.debugElement.queryAll(By.css('footer .footer-btn'));
      for (const button of buttons) {
        expect(button.nativeElement.getAttribute('type')).toBe('button');
        expect(button.queryAll(By.css('.icon')).length).toBe(1);
        expect(button.queryAll(By.css('.label')).length).toBe(1);
      }
    });

    it.each([
      [0, '/mcb-chart'],
      [1, '/orders'],
      [2, '/balance'],
      [3, '/dashboard'],
    ])('button %i navigates to %s', (index, path) => {
      const buttons = fixture.debugElement.queryAll(By.css('footer .footer-btn'));
      buttons[index].nativeElement.click();
      expect(navigate).toHaveBeenCalledWith([path]);
    });

    it('navigate() prefixes the route with a slash and closes web options', () => {
      component.showWebOptions = true;
      component.navigate('custom-route');
      expect(navigate).toHaveBeenCalledWith(['/custom-route']);
      expect(component.showWebOptions).toBe(false);
    });

    it('does not render the web menu toggle', () => {
      expect(fixture.debugElement.query(By.css('.footer-btn-web'))).toBeNull();
    });
  });

  describe('for an admin', () => {
    it('shows the watchlist button on mobile, but no web toggle', async () => {
      await setup({ admin: true, uiMode: 'mobile' });
      expect(labels()).toContain('FOOTER.WATCHLIST');
      expect(fixture.debugElement.query(By.css('.footer-btn-web'))).toBeNull();
    });

    it('opens the web options sheet and navigates to a chosen chart in web mode', async () => {
      await setup({ admin: true, uiMode: 'web' });
      expect(component.isWeb()).toBe(true);

      fixture.debugElement.query(By.css('.footer-btn-web')).nativeElement.click();
      fixture.detectChanges();
      const options = fixture.debugElement.queryAll(By.css('.web-option-btn'));
      expect(options.length).toBe(2);

      options[1].nativeElement.click();
      fixture.detectChanges();

      expect(dispatchAppAction).toHaveBeenCalledWith(
        SettingsActions.setUiModeOverride({ mode: 'web' }),
      );
      expect(navigate).toHaveBeenCalledWith(['/chart']);
      expect(fixture.debugElement.query(By.css('.web-options-sheet'))).toBeNull();
    });

    it('closes the web options sheet via the backdrop', async () => {
      await setup({ admin: true, uiMode: 'web' });
      component.toggleWebOptions();
      fixture.detectChanges();

      fixture.debugElement.query(By.css('.web-options-backdrop')).nativeElement.click();
      fixture.detectChanges();

      expect(component.showWebOptions).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
