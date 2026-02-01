import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';
import { keyZonesFeature } from '../store/keyzones/keyzones.reducer';
import { KeyZonesActions } from '../store/keyzones/keyzones.actions';

export interface KeyZoneVisibilitySettings {
  enabled: boolean;
  timeframes: { [tf: string]: boolean };
}

// Persistence is handled via NgRx localStorageSync meta-reducer

@Injectable({ providedIn: 'root' })
export class KeyZoneSettingsService {
  private settings: KeyZoneVisibilitySettings = {
    enabled: true,
    timeframes: {}
  };

  private availableTimeframes: string[] = [];

  private settingsSubject = new BehaviorSubject<KeyZoneVisibilitySettings>(this.getSettings());
  public settings$ = this.settingsSubject.asObservable();

  constructor(private store: Store) {
    this.store.select(keyZonesFeature.selectEnabled).subscribe(enabled => {
      if (typeof enabled === 'boolean') {
        this.settings.enabled = enabled;
        this.emit();
      }
    });
    this.store.select(keyZonesFeature.selectTimeframes).subscribe(timeframes => {
      if (timeframes) {
        this.settings.timeframes = { ...timeframes };
        this.emit();
      }
    });
    this.store.select(keyZonesFeature.selectAvailableTimeframes).subscribe(list => {
      if (Array.isArray(list)) {
        this.availableTimeframes = [...list];
        this.emit();
      }
    });
  }

  getSettings(): KeyZoneVisibilitySettings {
    return { ...this.settings, timeframes: { ...this.settings.timeframes } };
  }

  getAvailableTimeframes(): string[] {
    return [...this.availableTimeframes];
  }

  setEnabled(enabled: boolean): void {
    this.store.dispatch(KeyZonesActions.setEnabled({ enabled }));
  }

  setAvailableTimeframes(timeframes: string[]): void {
    this.store.dispatch(KeyZonesActions.setAvailableTimeframes({ timeframes }));
  }

  setTimeframeEnabled(tf: string, enabled: boolean): void {
    if (!tf) return;
    this.store.dispatch(KeyZonesActions.setTimeframeEnabled({ timeframe: tf, enabled }));
  }

  setAllTimeframesEnabled(enabled: boolean): void {
    this.store.dispatch(KeyZonesActions.setAllTimeframesEnabled({ enabled }));
  }

  isAllTimeframesEnabled(): boolean {
    const tfs = Object.keys(this.settings.timeframes);
    if (tfs.length === 0) return true; // default
    return tfs.every(tf => this.settings.timeframes[tf]);
  }

  // Store handles persistence; service acts as a facade and notifier

  private emit(): void {
    // Emit a deep-cloned copy to avoid accidental external mutation
    this.settingsSubject.next(this.getSettings());
  }
}