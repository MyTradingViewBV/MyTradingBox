import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsComponent } from './settings.component';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { AppActions } from 'src/app/store/app/app.actions';
import {
  installMatchMediaStub,
  provideComponentTestEnvironment,
} from 'src/testing/test-providers';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;
  let http: HttpTestingController;

  const itemLabels = (sectionIndex: number) =>
    component.settingsSections[sectionIndex].items.map((item) => item.label);
  const item = (sectionIndex: number, label: string) =>
    component.settingsSections[sectionIndex].items.find(
      (i) => i.label === label,
    );

  beforeEach(async () => {
    installMatchMediaStub();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        provideComponentTestEnvironment(),
        { provide: ChartService, useValue: { getExchanges: () => of([]) } },
      ],
    }).compileComponents();

    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('hides notification settings from non-admin users', () => {
    expect(itemLabels(1)).not.toContain('Alerts');
    expect(itemLabels(1)).not.toContain('News Updates');
    expect(itemLabels(1)).toContain('Dark Mode');
  });

  it('reflects the language from the store', () => {
    expect(item(2, 'Language')?.value).toBe('nl');

    TestBed.inject(Store).dispatch(AppActions.setLanguage({ language: 'en' }));

    expect(item(2, 'Language')?.value).toBe('en');
  });

  it('shows the app version loaded from version.json', async () => {
    http
      .expectOne((req) => req.url.startsWith('assets/version.json'))
      .flush({ version: '1.2.3' });

    await vi.waitFor(() =>
      expect(item(2, 'App Version')?.value).toBe('v1.2.3'),
    );
  });
});
