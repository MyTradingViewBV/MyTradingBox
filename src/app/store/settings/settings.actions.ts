import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { WebTestOrder } from 'src/app/modules/shared/models/orders/web-test-order.model';
import type { ChartDeviceSettings } from 'src/app/modules/shared/models/chart/chart-state.dto';

export const SettingsActions = createActionGroup({
  source: 'SettingsState',
  events: {
    clear: emptyProps(),
    setSelectedExchange: props<{ exchange: Exchange }>(),
    setSelectedTimeframe: props<{ timeframe: string }>(),
    setSelectedSymbol: props<{ symbol: SymbolModel }>(),
    setSymbolsList: props<{ symbols: SymbolModel[] }>(),
    setFavoriteSymbolName: props<{ symbolName: string | null }>(),
    setTradeAlertsEnabled: props<{ enabled: boolean }>(),
    setPriceAlertsEnabled: props<{ enabled: boolean }>(),
    setNewsUpdatesEnabled: props<{ enabled: boolean }>(),
    setDarkModeEnabled: props<{ enabled: boolean }>(),
    setAdminModeEnabled: props<{ enabled: boolean }>(),
    setUiModeOverride: props<{ mode: 'auto' | 'web' | 'mobile' }>(),
    setWebTestOrders: props<{ orders: WebTestOrder[] }>(),
    /** Bars the chart's right edge may move away from the live edge (+ right offset) before a pan detaches it. */
    setLiveFollowThresholdBars: props<{ bars: number }>(),
    /** Merge chart settings-panel selections into the ones stored on this device. */
    patchChartSettings: props<{ settings: ChartDeviceSettings }>(),
    /**
     * Global realtime-follow command for every chart that subscribes (today: the one active chart page).
     * true = go to realtime and follow, false = stop following (viewport untouched).
     */
    setAllChartsLiveFollow: props<{ enabled: boolean }>(),
  },
});
