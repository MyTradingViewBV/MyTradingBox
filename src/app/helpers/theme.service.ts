import { Injectable } from '@angular/core';

export type AppTheme = 'dark' | 'light';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storageKey = 'app.theme';
  private readonly prefix = 'theme-';
  private readonly themes: AppTheme[] = ['dark', 'light'];
  private active: AppTheme = 'dark';

  constructor() {
    const rawStored = localStorage.getItem(this.storageKey);
    const stored = this.isSupportedTheme(rawStored) ? rawStored : 'dark';
    this.active = stored as AppTheme;
    this.applyTheme(stored, false);
  }

  get activeTheme(): AppTheme {
    return this.active;
  }

  listThemes(): AppTheme[] {
    return this.themes.slice();
  }

  applyTheme(theme: AppTheme, persist = true): void {
    if (!theme) return;
    const body = document.body.classList;
    this.themes.forEach((t) => {
      body.remove(this.toClass(t));
    });
    body.add(this.toClass(theme));
    this.active = theme;
    if (persist) localStorage.setItem(this.storageKey, theme);
  }

  /** Cycle to next theme for quick testing */
  cycleTheme(): void {
    const idx = this.themes.indexOf(this.active);
    const next = this.themes[(idx + 1) % this.themes.length];
    this.applyTheme(next);
  }

  private toClass(theme: AppTheme): string {
    if (theme === 'dark') return 'dark-theme';
    if (theme === 'light') return 'light-theme';
    return `${this.prefix}${theme}`;
  }

  private isSupportedTheme(theme: string | null): theme is AppTheme {
    return theme === 'dark' || theme === 'light';
  }
}
