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