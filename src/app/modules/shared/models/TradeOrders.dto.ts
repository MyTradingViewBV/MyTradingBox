// trade-plan.model.ts

export class TradePlanModel {
  /** 💰 Account balances */
  AccountBalance = 0; // e.g. 9798.39
  AccountBalanceWithOpenOrders = 0; // e.g. 9992.7479
  MarketValueOpenOrders = 0; // e.g. 194.35
  OpenUnrealizedAmount = 0; // e.g. -5.64
  ClosedRealizedAmount = 0; // e.g. -14.28
  TotalPercentageAmount = 0; // e.g. 1.9835
  PricesCount = 0; // e.g. 4

  /** 📊 Orders in the plan */
  Orders: OrderModel[] = [];

  /** 🧮 (Optional) backwards-compatible fields */
  BaseStake = 0;
  TotalPnlAmount = 0;
  TotalPnlPercent = 0;
  DonePnlAmount = 0;
}

/** 📦 Individual order/trade entry */
export class OrderModel {
  /** Price & PnL */
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

/** ⚙️ Exchange entity (unchanged) */
export class Exchange {
  Id = 0;
  Name = '';
  Status = '';
}
