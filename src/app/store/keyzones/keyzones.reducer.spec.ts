import { KeyZonesActions } from './keyzones.actions';
import { initialState, keyZonesFeature, KeyZonesState } from './keyzones.reducer';

const reduce = (state: KeyZonesState, action: Parameters<typeof keyZonesFeature.reducer>[1]) =>
  keyZonesFeature.reducer(state, action);

describe('keyZonesFeature reducer', () => {
  it('keeps the month 1M distinct from the minute 1m', () => {
    const state = reduce(
      initialState,
      KeyZonesActions.setAvailableTimeframes({ timeframes: ['1M', '1m', ' 4H ', '1D', '1M', ''] }),
    );
    expect(state.availableTimeframes).toEqual(['1M', '1m', '4h', '1d']);
    expect(state.timeframes).toEqual({ '1M': true, '1m': true, '4h': true, '1d': true });

    const monthOff = reduce(state, KeyZonesActions.setTimeframeEnabled({ timeframe: '1M', enabled: false }));
    expect(monthOff.timeframes['1M']).toBe(false);
    expect(monthOff.timeframes['1m']).toBe(true);
  });

  it('normalizes toggles to the shared timeframe key', () => {
    const state = reduce(initialState, KeyZonesActions.setAvailableTimeframes({ timeframes: ['4h'] }));
    const next = reduce(state, KeyZonesActions.setTimeframeEnabled({ timeframe: '4H', enabled: false }));
    expect(next.timeframes).toEqual({ '4h': false });
    expect(reduce(next, KeyZonesActions.setTimeframeEnabled({ timeframe: '  ', enabled: true }))).toBe(next);
  });

  it('preserves existing flags, also of timeframes no longer available', () => {
    let state = reduce(initialState, KeyZonesActions.setAvailableTimeframes({ timeframes: ['1h', '1M'] }));
    state = reduce(state, KeyZonesActions.setTimeframeEnabled({ timeframe: '1M', enabled: false }));
    state = reduce(state, KeyZonesActions.setTimeframeEnabled({ timeframe: '1h', enabled: false }));
    state = reduce(state, KeyZonesActions.setAvailableTimeframes({ timeframes: ['1M', '1w'] }));
    expect(state.availableTimeframes).toEqual(['1M', '1w']);
    expect(state.timeframes).toEqual({ '1h': false, '1M': false, '1w': true });
    state = reduce(state, KeyZonesActions.setAvailableTimeframes({ timeframes: ['1h'] }));
    expect(state.timeframes['1h']).toBe(false);
  });

  it('toggles the master switch and all timeframes at once', () => {
    let state = reduce(initialState, KeyZonesActions.setAvailableTimeframes({ timeframes: ['1h', '1M'] }));
    state = reduce(state, KeyZonesActions.setAllTimeframesEnabled({ enabled: false }));
    expect(state.timeframes).toEqual({ '1h': false, '1M': false });
    state = reduce(state, KeyZonesActions.setEnabled({ enabled: false }));
    expect(state.enabled).toBe(false);
  });
});
