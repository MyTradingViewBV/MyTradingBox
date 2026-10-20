/** Fixed Volume Profile as returned by the FixedVolumeProfiles API (PascalCase). */
export interface FixedVolumeProfileDto {
  Id: number;
  ExchangeId: number;
  Symbol: string;
  Timeframe: string;
  Name: string;
  StartTime: string;
  EndTime: string;
  ExtendRight: boolean;
  CreatedAt?: string;
}
