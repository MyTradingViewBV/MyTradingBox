import { Injectable } from '@angular/core';
import {
  BrowserExchangeCandleStreamService,
  ParsedStreamCandle,
} from './exchange-candle-stream.service';

@Injectable({ providedIn: 'root' })
export class BitvavoStreamService extends BrowserExchangeCandleStreamService {
  override readonly exchangeName = 'BITVAVO';

  protected override getSocketUrl(): string {
    return 'wss://ws.bitvavo.com/v2/';
  }

  protected override getSubscribeMessage(symbol: string): unknown {
    return {
      action: 'subscribe',
      channels: [
        {
          name: 'candles',
          interval: ['1m'],
          markets: [this.toBitvavoMarket(symbol)],
        },
      ],
    };
  }

  protected override normalizeSymbol(symbol: string): string {
    return this.toBitvavoMarket(symbol).toUpperCase().trim();
  }

  protected override parseMessage(messageData: string): ParsedStreamCandle[] {
    try {
      const message = JSON.parse(messageData) as Record<string, unknown>;
      if (message['event'] !== 'candle') return [];
      const symbol = String(message['market'] ?? '').toUpperCase();
      const candleRows = message['candle'];
      if (!symbol || !Array.isArray(candleRows)) return [];

      const updates: ParsedStreamCandle[] = [];
      for (const row of candleRows) {
        if (!Array.isArray(row) || row.length < 6) continue;
        updates.push(
          ...this.rolloverClose(symbol, {
            time: this.readNumber(row[0]),
            open: this.readNumber(row[1]),
            high: this.readNumber(row[2]),
            low: this.readNumber(row[3]),
            close: this.readNumber(row[4]),
            volume: this.readNumber(row[5]),
          }),
        );
      }
      return updates;
    } catch {
      return [];
    }
  }

  private toBitvavoMarket(symbol: string): string {
    return (symbol || '').includes('-') ? symbol : symbol;
  }
}
