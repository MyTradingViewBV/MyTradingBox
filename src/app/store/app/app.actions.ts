import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { LoginResponse } from '../../modules/shared/models/login/loginResponse.dto';

export const AppActions = createActionGroup({
  source: 'AppState',
  events: {
    clear: emptyProps(),
    setToken: props<{ token: LoginResponse }>(),
  },
});
