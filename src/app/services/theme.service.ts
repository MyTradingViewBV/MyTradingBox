import { Injectable } from '@angular/core';
import { inject } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private overlay = inject(OverlayContainer);

  private darkThemeClass = 'dark-theme';

  /** Force the app into dark theme */
  enableDarkTheme(): void {
    const classList = document.body.classList;
    classList.add(this.darkThemeClass);

    // Make sure overlays (dialogs, menus, etc.) also use the theme
    this.overlay.getContainerElement().classList.add(this.darkThemeClass);
  }

  /** Remove dark theme (go back to light or default) */
  disableDarkTheme(): void {
    const classList = document.body.classList;
    classList.remove(this.darkThemeClass);
    this.overlay.getContainerElement().classList.remove(this.darkThemeClass);
  }

  /** Toggle dark/light theme */
  toggleDarkTheme(): void {
    const classList = document.body.classList;
    if (classList.contains(this.darkThemeClass)) {
      this.disableDarkTheme();
    } else {
      this.enableDarkTheme();
    }
  }
}
