export class WatchlistDTO {
  Id = 0;
  Symbol = '';
  Timeframe = '';
  BoxId = 0;
  Direction = ''; // restrict if known
  State = '';
  CreatedAt = '';
  Status = '';
  MonitoringStatus = '';
  TradePlanId = 0;
  // new
  ExecutionTimeframe = '';
  ConfirmationTimeframe = '';
  EntryOption = '';
  //! old
  // BarsSince = 0;
  // MaxBars = 0;
}
