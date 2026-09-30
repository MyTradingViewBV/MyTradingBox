import { Injectable } from '@angular/core';
import {
  BrowserExchangeCandleStreamService,
  ParsedStreamCandle,
} from './exchange-candle-stream.service';
import {
  binanceCombinedStreamUrl,
  binanceMarketForExchange,
  DEFAULT_BINANCE_EXCHANGE_ID,
} from '../utils/binance-market';

@Injectable({ providedIn: 'root' })
export class BinanceStreamService extends BrowserExchangeCandleStreamService {
  override readonly exchangeName = 'BINANCE';

  /** Exchange ids 2 (prod) and 7 (test) both map to USDT-M futures, see binance-market.ts. */
  protected override getSocketUrl(symbol: string): string {
    return binanceCombinedStreamUrl(
      binanceMarketForExchange(DEFAULT_BINANCE_EXCHANGE_ID),
      [`${symbol.toLowerCase()}@kline_1m`],
    );
  }

  protected override parseMessage(messageData: string): ParsedStreamCandle[] {
    try {
      const message = JSON.parse(messageData) as Record<string, unknown>;
      const data = (message['data'] ?? message) as Record<string, unknown>;
      const kline = data['k'];
      const symbol = String(data['s'] ?? '').toUpperCase();
      if (!symbol || !kline || typeof kline !== 'object') return [];

      const row = kline as Record<string, unknown>;
      return [
        {
          symbol,
          candle: {
            time: this.readNumber(row['t']),
            open: this.readNumber(row['o']),
            high: this.readNumber(row['h']),
            low: this.readNumber(row['l']),
            close: this.readNumber(row['c']),
            volume: this.readNumber(row['v']),
          },
          isClosed: Boolean(row['x']),
        },
      ].filter((update) => Number.isFinite(update.candle.time));
    } catch {
      return [];
    }
  }
}
