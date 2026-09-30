import { Injectable } from '@angular/core';
import {
  BrowserExchangeCandleStreamService,
  ParsedStreamCandle,
} from './exchange-candle-stream.service';

/** Quote currencies Bitvavo lists markets in; matched longest-suffix first. */
const BITVAVO_QUOTES = ['USDC', 'USDT', 'EUR', 'BTC', 'ETH'].sort(
  (a, b) => b.length - a.length,
);

/**
 * Map an app symbol to a Bitvavo market id: `BTCEUR` -> `BTC-EUR`.
 * Already dashed markets are kept (upper-cased); unknown quotes are returned as-is.
 */
export function toBitvavoMarket(symbol: string): string {
  const upper = (symbol || '').toUpperCase().trim();
  if (!upper || upper.includes('-')) return upper;
  for (const quote of BITVAVO_QUOTES) {
    if (upper.length > quote.length && upper.endsWith(quote)) {
      return `${upper.slice(0, -quote.length)}-${quote}`;
    }
  }
  return upper;
}

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
          markets: [toBitvavoMarket(symbol)],
        },
      ],
    };
  }

  /** Both the requested symbol and incoming `market` fields normalize to `BASE-QUOTE`. */
  protected override normalizeSymbol(symbol: string): string {
    return toBitvavoMarket(symbol);
  }

  protected override parseMessage(messageData: string): ParsedStreamCandle[] {
    try {
      const message = JSON.parse(messageData) as Record<string, unknown>;
      if (message['event'] !== 'candle') return [];
      const symbol = toBitvavoMarket(String(message['market'] ?? ''));
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
}
