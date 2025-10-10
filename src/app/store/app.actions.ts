import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { LoginResponse } from '../modules/shared/models/LoginResponse.dto';

export const AppActions = createActionGroup({
  source: 'AppState',
  events: {
    clear: emptyProps(),
    setToken: props<{ token: LoginResponse }>(),
    setSelectedCurrency: props<{ currency: string }>(),
    setSelectedExchange: props<{ exchange: string }>(),
  },
});
