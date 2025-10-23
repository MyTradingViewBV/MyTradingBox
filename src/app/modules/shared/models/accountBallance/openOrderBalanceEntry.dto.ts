export interface OpenOrderBalanceEntry {
  Id: number;
  Symbol: string;
  Direction: string; // LONG / SHORT
  EntryPrice: number;
  InvestedUsd: number;
  RemainingInvestedUsd: number;
  RemainingCoinQuantity: number;
  CurrentPrice: number;
  PnlAmount: number;
  PnlPercent: number;
}
