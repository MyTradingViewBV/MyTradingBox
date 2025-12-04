import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface KeyZoneVisibilitySettings {
  enabled: boolean;
  timeframes: { [tf: string]: boolean };
}

const LS_KEY = 'keyZoneVisibilitySettings';

@Injectable({ providedIn: 'root' })
export class KeyZoneSettingsService {
  private settings: KeyZoneVisibilitySettings = {
    enabled: true,
    timeframes: {}
  };

  private availableTimeframes: string[] = [];

  private settingsSubject = new BehaviorSubject<KeyZoneVisibilitySettings>(this.getSettings());
  public settings$ = this.settingsSubject.asObservable();

  getSettings(): KeyZoneVisibilitySettings {
    return { ...this.settings, timeframes: { ...this.settings.timeframes } };
  }

  getAvailableTimeframes(): string[] {
    return [...this.availableTimeframes];
  }

  setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    this.persist();
    this.emit();
  }

  setAvailableTimeframes(timeframes: string[]): void {
    const normalized = Array.from(new Set(
      (timeframes || []).map(tf => tf.trim()).filter(tf => tf.length > 0)
    ));
    this.availableTimeframes = normalized;

    // Initialize any new timeframe flags to true by default if not set yet
    normalized.forEach(tf => {
      if (!(tf in this.settings.timeframes)) {
        this.settings.timeframes[tf] = true;
      }
    });

    // Remove flags for timeframes that no longer exist
    Object.keys(this.settings.timeframes).forEach(tf => {
      if (!normalized.includes(tf)) {
        delete this.settings.timeframes[tf];
      }
    });

    this.persist();
    this.emit();
  }

  setTimeframeEnabled(tf: string, enabled: boolean): void {
    if (!tf) return;
    this.settings.timeframes[tf] = enabled;
    this.persist();
    this.emit();
  }

  setAllTimeframesEnabled(enabled: boolean): void {
    Object.keys(this.settings.timeframes).forEach(tf => {
      this.settings.timeframes[tf] = enabled;
    });
    this.persist();
    this.emit();
  }

  isAllTimeframesEnabled(): boolean {
    const tfs = Object.keys(this.settings.timeframes);
    if (tfs.length === 0) return true; // default
    return tfs.every(tf => this.settings.timeframes[tf]);
  }

  load(): void {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as KeyZoneVisibilitySettings;
        if (parsed && typeof parsed.enabled === 'boolean' && parsed.timeframes && typeof parsed.timeframes === 'object') {
          this.settings = {
            enabled: parsed.enabled,
            timeframes: { ...parsed.timeframes }
          };
        }
      }
    } catch {
      // ignore
    }
    this.emit();
  }

  private persist(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.settings));
    } catch {
      // ignore
    }
  }

  private emit(): void {
    // Emit a deep-cloned copy to avoid accidental external mutation
    this.settingsSubject.next(this.getSettings());
  }
}