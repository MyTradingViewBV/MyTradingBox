import { Injectable } from '@angular/core';
import {
  BrowserExchangeCandleStreamService,
  ParsedStreamCandle,
} from './exchange-candle-stream.service';

@Injectable({ providedIn: 'root' })
export class KrakenStreamService extends BrowserExchangeCandleStreamService {
  override readonly exchangeName = 'KRAKEN';

  protected override getSocketUrl(): string {
    return 'wss://futures.kraken.com/ws/v1';
  }

  protected override getSubscribeMessage(symbol: string): unknown {
    return {
      event: 'subscribe',
      feed: 'candles_trade_1m',
      product_ids: [symbol],
    };
  }

  protected override parseMessage(messageData: string): ParsedStreamCandle[] {
    try {
      const message = JSON.parse(messageData) as Record<string, unknown>;
      if (message['feed'] !== 'candles_trade_1m') return [];
      const symbol = String(message['product_id'] ?? '').toUpperCase();
      const candle = message['candle'];
      if (!symbol || !candle || typeof candle !== 'object') return [];
      const row = candle as Record<string, unknown>;

      return this.rolloverClose(symbol, {
        time: this.readNumber(row['time']),
        open: this.readNumber(row['open']),
        high: this.readNumber(row['high']),
        low: this.readNumber(row['low']),
        close: this.readNumber(row['close']),
        volume: this.readNumber(row['volume']),
      });
    } catch {
      return [];
    }
  }
}
