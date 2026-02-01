import { createFeature, createReducer, on } from '@ngrx/store';
import { KeyZonesActions } from './keyzones.actions';

export interface KeyZonesState {
  enabled: boolean;
  availableTimeframes: string[];
  timeframes: { [tf: string]: boolean };
}

export const initialState: KeyZonesState = {
  enabled: true,
  availableTimeframes: [],
  timeframes: {},
};

export const keyZonesFeature = createFeature({
  name: 'keyZonesState',
  reducer: createReducer(
    initialState,
    on(KeyZonesActions.setEnabled, (state, { enabled }) => ({ ...state, enabled })),
    on(KeyZonesActions.setAvailableTimeframes, (state, { timeframes }) => {
      const normalized = Array.from(new Set((timeframes || []).map(tf => tf.trim()).filter(tf => tf.length > 0)));
      const nextFlags: { [tf: string]: boolean } = { ...state.timeframes };
      normalized.forEach(tf => { if (!(tf in nextFlags)) nextFlags[tf] = true; });
      Object.keys(nextFlags).forEach(tf => { if (!normalized.includes(tf)) delete nextFlags[tf]; });
      return { ...state, availableTimeframes: normalized, timeframes: nextFlags };
    }),
    on(KeyZonesActions.setTimeframeEnabled, (state, { timeframe, enabled }) => {
      if (!timeframe) return state;
      return { ...state, timeframes: { ...state.timeframes, [timeframe]: enabled } };
    }),
    on(KeyZonesActions.setAllTimeframesEnabled, (state, { enabled }) => {
      const nextFlags: { [tf: string]: boolean } = {};
      Object.keys(state.timeframes).forEach(tf => nextFlags[tf] = enabled);
      return { ...state, timeframes: nextFlags };
    }),
  ),
});
