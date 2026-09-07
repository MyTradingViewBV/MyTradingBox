import { Injectable } from '@angular/core';
import {
  BrowserExchangeCandleStreamService,
  ParsedStreamCandle,
} from './exchange-candle-stream.service';

@Injectable({ providedIn: 'root' })
export class BybitStreamService extends BrowserExchangeCandleStreamService {
  override readonly exchangeName = 'BYBIT';

  protected override getSocketUrl(): string {
    return 'wss://stream.bybit.com/v5/public/linear';
  }

  protected override getSubscribeMessage(symbol: string): unknown {
    return {
      op: 'subscribe',
      args: [`kline.1.${symbol}`, `tickers.${symbol}`],
    };
  }

  protected override parseMessage(messageData: string): ParsedStreamCandle[] {
    try {
      const message = JSON.parse(messageData) as Record<string, unknown>;
      const topic = String(message['topic'] ?? '');
      if (!topic.toLowerCase().startsWith('kline.1.')) return [];

      const symbol = topic.slice('kline.1.'.length).toUpperCase();
      const data = message['data'];
      const rows = Array.isArray(data) ? data : [data];

      return rows
        .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
        .map((row) => ({
          symbol,
          candle: {
            time: this.readNumber(row['start']),
            open: this.readNumber(row['open']),
            high: this.readNumber(row['high']),
            low: this.readNumber(row['low']),
            close: this.readNumber(row['close']),
            volume: this.readNumber(row['volume']),
          },
          isClosed: Boolean(row['confirm']),
        }))
        .filter((row) => Number.isFinite(row.candle.time));
    } catch {
      return [];
    }
  }
}
