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

export interface AccountBalanceResponse {
  AccountBalance: number;
  OpenOrdersPnlAmount: number;
  MarketValueOpenOrders: number;
  AccountBalanceWithOpenOrders: number;
  OpenOrdersCount: number;
  OpenOrders: OpenOrderBalanceEntry[];
}

export interface AccountBalanceLogEntry {
  Id: number;
  AccountId: number;
  ExchangeId: number;
  TradeId: number;
  ChangeAmount: number;
  NewBalance: number;
  ChangeType: string; // RESERVE | STOPLOSS | TARGET1 | TARGET2 | etc.
  CreatedAt: string; // ISO timestamp
}

// Convenience wrapper if API returns an array
export type AccountBalanceLogResponse = AccountBalanceLogEntry[];
