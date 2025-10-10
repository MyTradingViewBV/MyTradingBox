export class TradePlanModel {
  BaseStake = 0;
  TotalPnlAmount = 0;
  TotalPnlPercent = 0;
  DonePnlAmount = 0;
  Orders: OrderModel[] = [];
}

export class OrderModel {
  CurrentPrice = 0;
  PnlAmount = 0;
  PnlPercent = 0;
  Id = 0;
  Symbol = '';
  Direction = '';
  EntryPrice = 0;
  StopLoss = 0;
  TargetPrice = 0;
  Target2Price = 0;
  SourceSignalType = '';
  CreatedAt = ''; // ISO date string
  Status = '';
  TradePlanId = 0;
  FailureReason = '';
  ExitPrice = 0;
  ExitType = '';
  ExecutionTimeframe = '';
  ConfirmationTimeframe = '';
  //! new
  EntryOption = '';
  ConfidenceReason = '';
  ConfidenceScore = 0;
}

export class Exchange {
  Id = 0;
  Name = '';
  Status = '';
}
