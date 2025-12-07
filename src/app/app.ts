 
import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { VersionService } from './helpers/version.service';
import { ThemeService } from './helpers/theme.service';
import { filter } from 'rxjs';
import { CommonModule } from '@angular/common';
import { OnboardingComponent } from './components/onboarding/onboarding.component';
import { Store } from '@ngrx/store';
import { appFeature } from './store/app/app.reducer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, OnboardingComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit {
  // Footer moved into feature components; not managed globally anymore
  // showFooter removed
  showOnboarding = false;
  protected title = 'pos';
  constructor(
    private _translate: TranslateService,
    private _versionService: VersionService,
    public theme: ThemeService,
    private _router: Router,
    private store: Store,
  ) {
    _translate.setDefaultLang('nl');
    _translate.use('nl');
  }

  async ngOnInit(): Promise<void> {
    this.theme.applyTheme(this.theme.activeTheme, false);
    await this._versionService.loadLocalVersion();

    this.store
      .select(appFeature.selectOnboardingDone)
      .subscribe((done) => (this.showOnboarding = !done));

    // 🔥 Fix initial render:
    const initial = this._router.url.split('?')[0].split('#')[0];
    // Footer visibility handled per component

    // 🔥 Handle future navigations:
    this._router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const cleanUrl = e.urlAfterRedirects.split('?')[0].split('#')[0];
        // Footer visibility handled per component
      });
  }

  checkForUpdates(): void {
    this._versionService.checkRemoteVersion();
  }

  useLanguage(language: string): void {
    this._translate.use(language);
  }

  onOnboardingCompleted(): void {
    this.showOnboarding = false;
  }
}
