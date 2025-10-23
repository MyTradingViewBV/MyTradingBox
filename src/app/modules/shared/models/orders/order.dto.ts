export class OrderModel {
  CurrentPrice = 0;
  PnlAmount = 0;
  PnlPercent = 0;
  RealizedAmount = 0;
  UnrealizedAmount = 0;

  /** Identifiers */
  Id = 0;
  Symbol = '';
  Direction = ''; // LONG / SHORT
  TradePlanId = 0;
  AccountId = 0;
  BoxId = 0;

  /** Entry/Exit info */
  EntryPrice = 0;
  StopLoss = 0;
  TargetPrice = 0;
  Target2Price = 0;
  ExitPrice: number | null = null;
  ExitType: string | null = null;
  Status = ''; // NEW / DONE / etc.

  /** Strategy info */
  SourceSignalType = '';
  ExecutionTimeframe = '';
  ConfirmationTimeframe = '';
  EntryOption = ''; // e.g. "CF timeframe divergence close"

  /** Confidence & rationale */
  ConfidenceScore = 0;
  ConfidenceReason = '';

  /** Targets info */
  Target1ExitedQuantity = 0;
  Target1ExitPrice: number | null = null;
  Target2ExitedQuantity = 0;
  Target2ExitPrice: number | null = null;

  /** Meta */
  CreatedAt = ''; // ISO string
  FailureReason: string | null = null;
  Quantity = 0;
}
