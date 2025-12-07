import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';

export const SettingsActions = createActionGroup({
  source: 'SettingsState',
  events: {
    clear: emptyProps(),
    setSelectedCurrency: props<{ currency: string }>(),
    setSelectedExchange: props<{ exchange: Exchange }>(),
    setSelectedSymbol: props<{ symbol: SymbolModel }>(),
    setTradeAlertsEnabled: props<{ enabled: boolean }>(),
    setPriceAlertsEnabled: props<{ enabled: boolean }>(),
    setNewsUpdatesEnabled: props<{ enabled: boolean }>(),
    setDarkModeEnabled: props<{ enabled: boolean }>(),
    setOnboardingCompleted: props<{ completed: boolean }>(),
    setAdminModeEnabled: props<{ enabled: boolean }>(),
  },
});
