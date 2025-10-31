import { Injectable, inject } from '@angular/core';
import { OverlayContainer } from '@angular/cdk/overlay';

export type AppTheme = 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private overlay = inject(OverlayContainer);
  private readonly storageKey = 'app.theme';
  private readonly prefix = 'theme-';
  private readonly themes: AppTheme[] = ['dark'];
  private active: AppTheme = 'dark';

  constructor() {
    // Restore persisted theme or default, but always re-apply to ensure class present
    const stored = (localStorage.getItem(this.storageKey) as AppTheme | null) || 'dark';
    this.active = stored; // set active then re-apply (applyTheme will overwrite)
    this.applyTheme(stored, false);
  }

  get activeTheme(): AppTheme {
    return this.active;
  }

  listThemes(): AppTheme[] {
    return this.themes.slice();
  }

  /** Apply given theme, replacing any previous theme classes */
  applyTheme(theme: AppTheme, persist = true): void {
    if (!theme) return;
    const body = document.body.classList;
    const overlayEl = this.overlay.getContainerElement().classList;
    // remove old classes
    this.themes.forEach(t => {
      body.remove(this.toClass(t));
      overlayEl.remove(this.toClass(t));
    });
    // add new
    body.add(this.toClass(theme));
    overlayEl.add(this.toClass(theme));
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
    return `${this.prefix}${theme}`;
  }
}
