import { createActionGroup, props } from '@ngrx/store';

export const KeyZonesActions = createActionGroup({
  source: 'KeyZonesState',
  events: {
    setEnabled: props<{ enabled: boolean }>(),
    setAvailableTimeframes: props<{ timeframes: string[] }>(),
    setTimeframeEnabled: props<{ timeframe: string; enabled: boolean }>(),
    setAllTimeframesEnabled: props<{ enabled: boolean }>(),
  },
});
