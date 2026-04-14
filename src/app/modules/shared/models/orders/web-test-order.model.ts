export type WebTestOrderStatus = 'actief' | 'completed' | 'removed';
export type WebTestOrderSide = 'long' | 'short';

export interface WebTestOrder {
  id: number;
  number: string;
  exchange: string;
  symbol: string;
  side: WebTestOrderSide;
  datetime: string;
  startPrice: number;
  stopPrice: number;
  leverage: number;
  transactionCostPct: number;
  stopLoss: number;
  startDate: string;
  stopDate: string;
  expectedProfit: number;
  currentProfit: number;
  status: WebTestOrderStatus;
  showOnChart: boolean;
}

export interface WebTestOrderDraft {
  id?: number;
  side: WebTestOrderSide;
  startPrice: number;
  stopPrice: number;
  leverage: number;
  transactionCostPct: number;
  stopLoss: number;
  startDate: string;
  stopDate: string;
  expectedProfit: number;
  currentProfit: number;
  status: WebTestOrderStatus;
}
