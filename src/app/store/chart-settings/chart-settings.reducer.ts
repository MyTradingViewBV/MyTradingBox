import { createFeature, createReducer, on } from '@ngrx/store';
import { ChartSettingsActions } from './chart-settings.actions';

export interface ChartSettingsState {
  showBoxes: boolean;
  showKeyZones: boolean;
  showOrders: boolean;
  showIndicators: boolean;
  showMarketCipher: boolean;
  showDivergences: boolean;
  boxMode: 'boxes' | 'all';
}

export const initialState: ChartSettingsState = {
  showBoxes: true,
  showKeyZones: false,
  showOrders: false,
  showIndicators: true,
  showMarketCipher: false,
  showDivergences: false,
  boxMode: 'boxes',
};

export const chartSettingsFeature = createFeature({
  name: 'chartSettingsState',
  reducer: createReducer(
    initialState,
    on(ChartSettingsActions.setShowBoxes, (state, { showBoxes }) => ({ ...state, showBoxes })),
    on(ChartSettingsActions.setShowKeyZones, (state, { showKeyZones }) => ({ ...state, showKeyZones })),
    on(ChartSettingsActions.setShowOrders, (state, { showOrders }) => ({ ...state, showOrders })),
    on(ChartSettingsActions.setShowIndicators, (state, { showIndicators }) => ({ ...state, showIndicators })),
    on(ChartSettingsActions.setShowMarketCipher, (state, { showMarketCipher }) => ({ ...state, showMarketCipher })),
    on(ChartSettingsActions.setShowDivergences, (state, { showDivergences }) => ({ ...state, showDivergences })),
    on(ChartSettingsActions.setBoxMode, (state, { boxMode }) => ({ ...state, boxMode })),
  ),
});