import { createFeature, createReducer, on } from '@ngrx/store';
import { normalizeTimeframe } from 'src/app/components/chart/utils/timeframe-bucketing';
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

/**
 * Timeframe keys use the shared chart normalization: lowercase, except the
 * month '1M', which must stay distinct from the minute '1m'.
 * This slice is in-memory only (rebuilt from the key-zones API on every fetch),
 * so there are no persisted lowercase keys to migrate.
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
      const nextFlags: { [tf: string]: boolean } = {};
      normalized.forEach((tf) => {
        nextFlags[tf] = tf in (state.timeframes || {}) ? !!state.timeframes[tf] : true;
      });
      return { ...state, availableTimeframes: normalized, timeframes: nextFlags };
    }),
    on(KeyZonesActions.setTimeframeEnabled, (state, { timeframe, enabled }) => {
      const key = toKey(timeframe);
      if (!key) return state;
      return { ...state, timeframes: { ...state.timeframes, [key]: enabled } };
    }),
    on(KeyZonesActions.setAllTimeframesEnabled, (state, { enabled }) => {
      const nextFlags: { [tf: string]: boolean } = {};
      Object.keys(state.timeframes).forEach(tf => nextFlags[tf] = enabled);
      return { ...state, timeframes: nextFlags };
    }),
  ),
});
