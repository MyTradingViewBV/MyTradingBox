import { createActionGroup, props } from '@ngrx/store';

export const ChartSettingsActions = createActionGroup({
  source: 'ChartSettingsState',
  events: {
    setShowBoxes: props<{ showBoxes: boolean }>(),
    setShowKeyZones: props<{ showKeyZones: boolean }>(),
    setShowOrders: props<{ showOrders: boolean }>(),
    setShowIndicators: props<{ showIndicators: boolean }>(),
    setShowMarketCipher: props<{ showMarketCipher: boolean }>(),
    setShowDivergences: props<{ showDivergences: boolean }>(),
    setBoxMode: props<{ boxMode: 'boxes' | 'all' }>(),
  },
});