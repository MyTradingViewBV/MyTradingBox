import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { LoginResponse } from '../modules/shared/models/LoginResponse.dto';
import { Exchange } from '../modules/shared/models/TradeOrders.dto';

export const AppActions = createActionGroup({
  source: 'AppState',
  events: {
    clear: emptyProps(),
    setToken: props<{ token: LoginResponse }>(),
    setSelectedCurrency: props<{ currency: string }>(),
    setSelectedExchange: props<{ exchange: Exchange }>(),
  },
});
