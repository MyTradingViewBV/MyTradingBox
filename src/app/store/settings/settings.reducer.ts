import { createFeature, createReducer, on } from '@ngrx/store';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { SettingsActions } from './settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { WebTestOrder } from 'src/app/modules/shared/models/orders/web-test-order.model';
import { LIVE_FOLLOW_THRESHOLD_BARS } from 'src/app/components/chart/scales/time-scale';

export type UiModeOverride = 'auto' | 'web' | 'mobile';

/**
 * Last global realtime-follow command (`setAllChartsLiveFollow`). `requestId` grows with every
 * dispatch, so subscribers react to each command (also a repeated `true`) and not to the state
 * that already existed when they subscribed.
 */
export interface LiveFollowRequest {
  enabled: boolean;
  requestId: number;
}

export interface SettingsState {
  exchange: Exchange | null;
  timeframe: string | null;
  symbol: SymbolModel | null;
  symbols: SymbolModel[];
  favoriteSymbolName: string | null;
  tradeAlertsEnabled: boolean;
  priceAlertsEnabled: boolean;
  newsUpdatesEnabled: boolean;
  darkModeEnabled: boolean;
  adminModeEnabled: boolean;
  uiModeOverride: UiModeOverride;
  webTestOrders: WebTestOrder[];
  /** Chart live-follow detach threshold (bars), see LIVE_FOLLOW_THRESHOLD_BARS. */
  liveFollowThresholdBars: number;
  allChartsLiveFollow: LiveFollowRequest;
}

export const initialState: SettingsState = {
  exchange: null,
  timeframe: null,
  symbol: null,
  symbols: [],
  favoriteSymbolName: null,
  tradeAlertsEnabled: true,
  priceAlertsEnabled: true,
  newsUpdatesEnabled: false,
  darkModeEnabled: true,
  adminModeEnabled: false,
  uiModeOverride: 'auto',
  webTestOrders: [],
  liveFollowThresholdBars: LIVE_FOLLOW_THRESHOLD_BARS,
  allChartsLiveFollow: { enabled: true, requestId: 0 },
};

export const settingsFeature = createFeature({
  name: 'settingsState',
  reducer: createReducer(
    initialState,
    // The command counter survives a clear, so subscribers never mistake the reset for a new command.
    on(SettingsActions.clear, (state) => ({
      ...initialState,
      allChartsLiveFollow: state.allChartsLiveFollow,
    })),
    on(SettingsActions.setSelectedExchange, (state, { exchange }) => ({
      ...state,
      exchange,
    })),
    on(SettingsActions.setSelectedTimeframe, (state, { timeframe }) => ({
      ...state,
      timeframe,
    })),
    on(SettingsActions.setSelectedSymbol, (state, { symbol }) => ({
      ...state,
      symbol,
    })),
    on(SettingsActions.setSymbolsList, (state, { symbols }) => ({
      ...state,
      symbols: (symbols || []).map(s => ({ ...s, isFavorite: s.SymbolName === state.favoriteSymbolName })),
    })),
    on(SettingsActions.setFavoriteSymbolName, (state, { symbolName }) => ({
      ...state,
      favoriteSymbolName: symbolName,
      symbols: (state.symbols || []).map(s => ({ ...s, isFavorite: s.SymbolName === symbolName })),
    })),
    on(SettingsActions.setTradeAlertsEnabled, (state, { enabled }) => ({
      ...state,
      tradeAlertsEnabled: enabled,
    })),
    on(SettingsActions.setPriceAlertsEnabled, (state, { enabled }) => ({
      ...state,
      priceAlertsEnabled: enabled,
    })),
    on(SettingsActions.setNewsUpdatesEnabled, (state, { enabled }) => ({
      ...state,
      newsUpdatesEnabled: enabled,
    })),
    on(SettingsActions.setDarkModeEnabled, (state, { enabled }) => ({
      ...state,
      darkModeEnabled: enabled,
    })),
    on(SettingsActions.setAdminModeEnabled, (state, { enabled }) => ({
      ...state,
      adminModeEnabled: enabled,
    })),
    on(SettingsActions.setUiModeOverride, (state, { mode }) => ({
      ...state,
      uiModeOverride: mode,
    })),
    on(SettingsActions.setWebTestOrders, (state, { orders }) => ({
      ...state,
      webTestOrders: orders || [],
    })),
    on(SettingsActions.setLiveFollowThresholdBars, (state, { bars }) => ({
      ...state,
      liveFollowThresholdBars:
        Number.isFinite(bars) && bars >= 0 ? bars : LIVE_FOLLOW_THRESHOLD_BARS,
    })),
    on(SettingsActions.setAllChartsLiveFollow, (state, { enabled }) => ({
      ...state,
      allChartsLiveFollow: {
        enabled,
        requestId: state.allChartsLiveFollow.requestId + 1,
      },
    })),
  ),
});
