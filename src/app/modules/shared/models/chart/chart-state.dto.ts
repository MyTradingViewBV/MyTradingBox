import { Drawing } from '../../../../components/chart/services/drawing-tools.service';

/** Chart visual toggle settings persisted alongside drawings. */
export interface ChartSettingsSnapshot {
  showBoxes: boolean;
  showKeyZones: boolean;
  showOrders: boolean;
  showIndicators: boolean;
  showMarketCipher: boolean;
  showDivergences: boolean;
  boxMode: 'boxes' | 'all';
}

/** Full chart state record returned from / sent to the API. */
export interface ChartStateDto {
  id?: string;
  userId?: string;
  exchangeId: number;
  symbol: string;
  timeframe: string;
  drawings: Drawing[];
  settings: ChartSettingsSnapshot;
  createdAt?: string;
  updatedAt?: string;
}
