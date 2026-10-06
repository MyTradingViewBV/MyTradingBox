import { Drawing } from '../../../../components/chart/services/drawing-tools.service';

/** Chart visual toggle settings persisted alongside drawings. */
export interface ChartSettingsSnapshot {
  showBoxes: boolean;
  showKeyZones: boolean;
  /** Key-zone layer toggles (see KeyZoneLayer); absent = defaults. */
  keyZoneLayers?: Partial<Record<string, boolean>>;
  showOrders: boolean;
  showIndicators: boolean;
  showMarketCipher: boolean;
  showDivergences: boolean;
  boxMode: 'boxes' | 'all';
  /** Market Cipher B panel parts (see McbVisibility); absent = all shown. */
  mcb?: Record<string, boolean>;
}

export type CapitalFlowTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/**
 * Chart settings-panel selections stored on this device (localStorage via the
 * state persistence meta-reducer). Absent fields keep the chart's defaults.
 * Key-zone timeframe toggles are stored with the key-zone slice instead.
 */
export interface ChartDeviceSettings extends Partial<ChartSettingsSnapshot> {
  capitalFlowTiers?: Partial<Record<CapitalFlowTier, boolean>>;
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
