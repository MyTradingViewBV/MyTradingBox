export type WebTestOrderStatus = 'actief' | 'completed' | 'removed';

export interface WebTestOrder {
  id: number;
  number: string;
  symbol: string;
  datetime: string;
  startPrice: number;
  stopPrice: number;
  startDate: string;
  stopDate: string;
  expectedProfit: number;
  currentProfit: number;
  status: WebTestOrderStatus;
  showOnChart: boolean;
}

export interface WebTestOrderDraft {
  id?: number;
  startPrice: number;
  stopPrice: number;
  startDate: string;
  stopDate: string;
  expectedProfit: number;
  currentProfit: number;
  status: WebTestOrderStatus;
}
