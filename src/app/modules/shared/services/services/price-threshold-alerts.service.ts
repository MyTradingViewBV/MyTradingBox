import { Injectable } from '@angular/core';

export interface PriceThresholdAlert {
  id: string;
  exchangeId: number;
  symbol: string;
  targetPrice: number;
  enabled: boolean;
  createdAt: number;
}

export interface TriggeredPriceThresholdAlert extends PriceThresholdAlert {
  previousPrice: number;
  currentPrice: number;
}

@Injectable({ providedIn: 'root' })
export class PriceThresholdAlertsService {
  // API endpoint will be added later. All methods throw for now.
  getAlerts(exchangeId: number, symbol: string): PriceThresholdAlert[] {
    throw new Error('Not implemented: getAlerts (replace with API call)');
  }

  hasEnabledAlerts(exchangeId: number, symbol: string): boolean {
    throw new Error('Not implemented: hasEnabledAlerts (replace with API call)');
  }

  setAlerts(exchangeId: number, symbol: string, alerts: PriceThresholdAlert[]): void {
    throw new Error('Not implemented: setAlerts (replace with API call)');
  }

  clearAlerts(exchangeId: number, symbol: string): void {
    throw new Error('Not implemented: clearAlerts (replace with API call)');
  }

  checkTriggered(exchangeId: number, symbol: string, currentPrice: number): TriggeredPriceThresholdAlert[] {
    throw new Error('Not implemented: checkTriggered (replace with API call)');
  }
}
