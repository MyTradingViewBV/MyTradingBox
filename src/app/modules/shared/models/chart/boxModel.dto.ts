export interface BoxModel {
  Id: number;
  Symbol: string;
  Timeframe: string;
  ZoneMin: number;
  ZoneMax: number;
  Reason: number;
  Strength: number;
  Color?: string;
  PositionType?: string;
  Type?: string;
  CreatedAt?: string;
}