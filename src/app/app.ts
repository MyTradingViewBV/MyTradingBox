/* eslint-disable @angular-eslint/component-class-suffix */
import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { VersionService } from './helpers/version.service';
import { FooterComponent } from './components/footer/footer-compenent';
import { ThemeService } from './helpers/theme.service';
import { filter } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, FooterComponent, CommonModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit {
  showFooter = true;
  protected title = 'pos';
  constructor(
    private _translate: TranslateService,
    private _versionService: VersionService,
    public theme: ThemeService,
    private _router: Router,
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
        } 
      });
  }

  checkForUpdates(): void {
    this._versionService.checkRemoteVersion();
  }

  useLanguage(language: string): void {
    this._translate.use(language);
  }
}
