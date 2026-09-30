import { ActionReducerMap, MetaReducer } from '@ngrx/store';
import { appFeature } from './app/app.reducer';
import { settingsFeature } from './settings/settings.reducer';
import { keyZonesFeature } from './keyzones/keyzones.reducer';
import { persistenceMetaReducers } from './persistence/state-persistence.meta-reducer';

export interface RootState {
  appState: ReturnType<typeof appFeature.reducer>;
  settingsState: ReturnType<typeof settingsFeature.reducer>;
  keyZonesState: ReturnType<typeof keyZonesFeature.reducer>;
}

export const rootReducers: ActionReducerMap<RootState> = {
  appState: appFeature.reducer,
  settingsState: settingsFeature.reducer,
  keyZonesState: keyZonesFeature.reducer,
};

/** The single localStorage persistence layer (see state-persistence.meta-reducer.ts). */
export const rootMetaReducers: MetaReducer<RootState>[] = persistenceMetaReducers;
