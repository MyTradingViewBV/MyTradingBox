/* eslint-disable @angular-eslint/component-class-suffix */
import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { VersionService } from './helpers/version.service';
import { FooterComponent } from './components/footer/footer-compenent';
import { ThemeService } from './helpers/theme.service';
import { filter } from 'rxjs';
import { CommonModule } from '@angular/common';
import { OnboardingComponent } from './components/onboarding/onboarding.component';
import { Store } from '@ngrx/store';
import { appFeature } from './store/app/app.reducer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, FooterComponent, CommonModule, OnboardingComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit {
  showFooter = true;
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
    this._router.events
      .pipe(
        filter(
          (event): event is NavigationEnd => event instanceof NavigationEnd,
        ),
      )
      .subscribe((event: NavigationEnd) => {
        if (event.urlAfterRedirects.includes('/login')) {
          this.showFooter = false;
          this.showOnboarding = false; // never show while on login
        } else {
          this.showFooter = true;
          // Use store state instead of direct localStorage
          this.store.select(appFeature.selectOnboardingDone).subscribe(done => {
            this.showOnboarding = !done;
          });
        }
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
