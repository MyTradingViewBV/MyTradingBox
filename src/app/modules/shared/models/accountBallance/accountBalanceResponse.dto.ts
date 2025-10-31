import { OpenOrderBalanceEntry } from './openOrderBalanceEntry.dto';

export interface AccountBalanceResponse {
  AccountBalance: number;
  OpenOrdersPnlAmount: number;
  MarketValueOpenOrders: number;
  AccountBalanceWithOpenOrders: number;
  OpenOrdersCount: number;
  OpenOrders: OpenOrderBalanceEntry[];
}
