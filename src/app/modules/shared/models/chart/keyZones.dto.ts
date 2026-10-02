import { FibLevel } from './fibLevel.dto';
import { VolumeProfile } from './volumeProfile.dto';

/** Support/resistance level (naked = not yet traded through). */
export interface KeyZoneLevel {
  Symbol: string;
  Timeframe: string;
  Price: number | null;
  Indicator: string;
  Naked: boolean | null;
  Time: string | null;
}

/** Point of control of a closed period (day/week/month). */
export interface NakedPocLevel {
  Id: number;
  Symbol: string;
  /** Period the POC belongs to: '1d' | '1w' | '1M'. */
  Period: string;
  Name: string;
  Timeframe: string;
  PeriodStart: string;
  Poc: number;
  IsNaked: boolean;
  TestedAt: string | null;
}

/** Fixed range volume profile (named range with POC / value area). */
export interface FixedVolumeProfileLevel {
  ProfileId: number;
  Symbol: string;
  Timeframe: string;
  StartTime: string;
  EndTime: string;
  PocPrice: number;
  ValueAreaHigh: number;
  ValueAreaLow: number;
  RangeHigh: number;
  RangeLow: number;
  TotalVolume: number;
  Name: string | null;
}

export interface OrderBlock {
  Id: number;
  Symbol: string;
  Timeframe: string;
  /** 'Bullish' | 'Bearish' */
  Type: string;
  Top: number;
  Bottom: number;
  Strength: number;
  Session: string | null;
  CandleTime: string;
}

/** Liquidity pool at a swing high (Side 1, buy-side) or swing low (Side -1, sell-side). */
export interface LiquidityLevel {
  Id: number;
  Symbol: string;
  Timeframe: string;
  Side: number;
  TopPrice: number;
  BottomPrice: number;
  Weight: number;
  Touched: boolean;
  LeftTime: string;
}

export interface KeyZonesModel {
  Symbol: string;
  Levels?: KeyZoneLevel[];
  NakedPocLevels?: NakedPocLevel[];
  FixedVolumeProfileLevels?: FixedVolumeProfileLevel[];
  OrderBlocks?: OrderBlock[];
  LiquidityLevels?: LiquidityLevel[];
  FibLevels?: FibLevel[];
  /** Legacy payload (pre fixed-range profiles). */
  VolumeProfiles?: VolumeProfile[];
}
