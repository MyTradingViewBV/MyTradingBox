import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Store } from '@ngrx/store';
import { chartSettingsFeature, ChartSettingsState } from '../store/chart-settings/chart-settings.reducer';
import { ChartSettingsActions } from '../store/chart-settings/chart-settings.actions';

@Injectable({ providedIn: 'root' })
export class ChartSettingsService {
  private settings: ChartSettingsState = {
    showBoxes: true,
    showKeyZones: false,
    showOrders: false,
    showIndicators: true,
    showMarketCipher: false,
    showDivergences: false,
    boxMode: 'boxes',
  };

  private settingsSubject = new BehaviorSubject<ChartSettingsState>(this.getSettings());
  public settings$ = this.settingsSubject.asObservable();
  private readonly store = inject(Store);

  constructor() {
    this.store.select(chartSettingsFeature.selectShowBoxes).subscribe(showBoxes => {
      if (typeof showBoxes === 'boolean') {
        this.settings.showBoxes = showBoxes;
        this.emit();
      }
    });
    this.store.select(chartSettingsFeature.selectShowKeyZones).subscribe(showKeyZones => {
      if (typeof showKeyZones === 'boolean') {
        this.settings.showKeyZones = showKeyZones;
        this.emit();
      }
    });
    this.store.select(chartSettingsFeature.selectShowOrders).subscribe(showOrders => {
      if (typeof showOrders === 'boolean') {
        this.settings.showOrders = showOrders;
        this.emit();
      }
    });
    this.store.select(chartSettingsFeature.selectShowIndicators).subscribe(showIndicators => {
      if (typeof showIndicators === 'boolean') {
        this.settings.showIndicators = showIndicators;
        this.emit();
      }
    });
    this.store.select(chartSettingsFeature.selectShowMarketCipher).subscribe(showMarketCipher => {
      if (typeof showMarketCipher === 'boolean') {
        this.settings.showMarketCipher = showMarketCipher;
        this.emit();
      }
    });
    this.store.select(chartSettingsFeature.selectShowDivergences).subscribe(showDivergences => {
      if (typeof showDivergences === 'boolean') {
        this.settings.showDivergences = showDivergences;
        this.emit();
      }
    });
    this.store.select(chartSettingsFeature.selectBoxMode).subscribe(boxMode => {
      if (boxMode) {
        this.settings.boxMode = boxMode;
        this.emit();
      }
    });
  }

  getSettings(): ChartSettingsState {
    return { ...this.settings };
  }

  setShowBoxes(showBoxes: boolean): void {
    this.store.dispatch(ChartSettingsActions.setShowBoxes({ showBoxes }));
  }

  setShowKeyZones(showKeyZones: boolean): void {
    this.store.dispatch(ChartSettingsActions.setShowKeyZones({ showKeyZones }));
  }

  setShowOrders(showOrders: boolean): void {
    this.store.dispatch(ChartSettingsActions.setShowOrders({ showOrders }));
  }

  setShowIndicators(showIndicators: boolean): void {
    this.store.dispatch(ChartSettingsActions.setShowIndicators({ showIndicators }));
  }

  setShowMarketCipher(showMarketCipher: boolean): void {
    this.store.dispatch(ChartSettingsActions.setShowMarketCipher({ showMarketCipher }));
  }

  setShowDivergences(showDivergences: boolean): void {
    this.store.dispatch(ChartSettingsActions.setShowDivergences({ showDivergences }));
  }

  setBoxMode(boxMode: 'boxes' | 'all'): void {
    this.store.dispatch(ChartSettingsActions.setBoxMode({ boxMode }));
  }

  private emit(): void {
    this.settingsSubject.next(this.getSettings());
  }
}