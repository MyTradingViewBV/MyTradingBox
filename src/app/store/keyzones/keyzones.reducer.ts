import { createFeature, createReducer, on } from '@ngrx/store';
import { normalizeTimeframe } from 'src/app/components/chart/utils/timeframe-bucketing';
import { KeyZonesActions } from './keyzones.actions';
import { SettingsActions } from '../settings/settings.actions';

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

/**
 * Timeframe keys use the shared chart normalization: lowercase, except the
 * month '1M', which must stay distinct from the minute '1m'.
 * The timeframe toggles are persisted on this device by the state persistence
 * meta-reducer (always written with normalized keys); the rest is in-memory.
 */
const toKey = (tf: unknown): string => normalizeTimeframe(String(tf ?? ''));

export const keyZonesFeature = createFeature({
  name: 'keyZonesState',
  reducer: createReducer(
    initialState,
    on(KeyZonesActions.setEnabled, (state, { enabled }) => ({ ...state, enabled })),
    on(KeyZonesActions.setAvailableTimeframes, (state, { timeframes }) => {
      const normalized = Array.from(
        new Set((timeframes || []).map(toKey).filter((tf) => tf.length > 0)),
      );
      // Keep the flags of timeframes this symbol lacks, so a stored choice
      // survives switching to a symbol without that timeframe and back.
      const nextFlags: { [tf: string]: boolean } = { ...(state.timeframes || {}) };
      normalized.forEach((tf) => {
        if (!(tf in nextFlags)) nextFlags[tf] = true;
      });
      return { ...state, availableTimeframes: normalized, timeframes: nextFlags };
    }),
    on(KeyZonesActions.setTimeframeEnabled, (state, { timeframe, enabled }) => {
      const key = toKey(timeframe);
      if (!key) return state;
      return { ...state, timeframes: { ...state.timeframes, [key]: enabled } };
    }),
    // "Clear storage" also resets the stored timeframe toggles to all on.
    on(SettingsActions.clear, (state) => {
      const nextFlags: { [tf: string]: boolean } = {};
      state.availableTimeframes.forEach((tf) => (nextFlags[tf] = true));
      return { ...state, timeframes: nextFlags };
    }),
    on(KeyZonesActions.setAllTimeframesEnabled, (state, { enabled }) => {
      const nextFlags: { [tf: string]: boolean } = {};
      Object.keys(state.timeframes).forEach(tf => nextFlags[tf] = enabled);
      return { ...state, timeframes: nextFlags };
    }),
  ),
});
