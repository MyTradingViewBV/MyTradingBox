import { OrderModel } from './order.dto';

export class TradePlanModel {
  AccountBalance = 0; // e.g. 9798.39
  AccountBalanceWithOpenOrders = 0; // e.g. 9992.7479
  MarketValueOpenOrders = 0; // e.g. 194.35
  OpenUnrealizedAmount = 0; // e.g. -5.64
  ClosedRealizedAmount = 0; // e.g. -14.28
  TotalPercentageAmount = 0; // e.g. 1.9835
  PricesCount = 0; // e.g. 4

  Orders: OrderModel[] = [];

  BaseStake = 0;
  TotalPnlAmount = 0;
  TotalPnlPercent = 0;
  DonePnlAmount = 0;
}
