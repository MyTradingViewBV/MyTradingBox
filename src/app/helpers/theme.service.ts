import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { settingsFeature } from '../store/settings/settings.reducer';
import { SettingsActions } from '../store/settings/settings.actions';

export type AppTheme = 'dark' | 'light';

/**
 * Applies the theme classes to <body>. The theme itself lives in the NgRx
 * settings slice (`darkModeEnabled`), which the persistence meta-reducer
 * hydrates from / writes back to localStorage; this service never touches
 * storage directly.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly store = inject(Store);
  private readonly prefix = 'theme-';
  private readonly themes: AppTheme[] = ['dark', 'light'];
  private active: AppTheme = 'dark';

  constructor() {
    // Root singleton: follows the store for the app's lifetime.
    this.store
      .select(settingsFeature.selectDarkModeEnabled)
      .subscribe((enabled) =>
        this.applyToDocument(enabled === false ? 'light' : 'dark'),
      );
  }

  get activeTheme(): AppTheme {
    return this.active;
  }

  listThemes(): AppTheme[] {
    return this.themes.slice();
  }

  /** Selects a theme by updating the store; the body class follows the store. */
  applyTheme(theme: AppTheme): void {
    if (!this.themes.includes(theme)) return;
    this.store.dispatch(
      SettingsActions.setDarkModeEnabled({ enabled: theme === 'dark' }),
    );
  }

  /** Cycle to next theme for quick testing */
  cycleTheme(): void {
    const idx = this.themes.indexOf(this.active);
    const next = this.themes[(idx + 1) % this.themes.length];
    this.applyTheme(next);
  }

  private applyToDocument(theme: AppTheme): void {
    const body = document.body.classList;
    this.themes.forEach((t) => body.remove(this.toClass(t)));
    body.add(this.toClass(theme));
    this.active = theme;
  }

  private toClass(theme: AppTheme): string {
    if (theme === 'dark') return 'dark-theme';
    if (theme === 'light') return 'light-theme';
    return `${this.prefix}${theme}`;
  }
}
