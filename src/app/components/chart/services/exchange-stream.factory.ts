import { Injectable, inject } from '@angular/core';
import { BinanceStreamService } from './binance-stream.service';
import { BitvavoStreamService } from './bitvavo-stream.service';
import { BybitStreamService } from './bybit-stream.service';
import { ExchangeCandleStreamService } from './exchange-candle-stream.service';
import { KrakenStreamService } from './kraken-stream.service';
import { isBinanceExchangeId } from '../utils/binance-market';

/**
 * Exchange ids (Bots ExchangeCandleServiceFactory): 1/6=Bybit, 2/7=Binance,
 * 3/8=Kraken, 4/9=Bitvavo (production/test). Binance ids resolve through
 * `isBinanceExchangeId` so the candle stream, chart price ticker and
 * watchlist ticker agree on spot vs futures (see binance-market.ts).
 */

@Injectable({ providedIn: 'root' })
export class ExchangeStreamFactory {
  private readonly bybit = inject(BybitStreamService);
  private readonly binance = inject(BinanceStreamService);
  private readonly kraken = inject(KrakenStreamService);
  private readonly bitvavo = inject(BitvavoStreamService);

  create(exchangeId: number): ExchangeCandleStreamService {
    if (isBinanceExchangeId(exchangeId)) return this.binance;
    switch (exchangeId) {
      case 1:
      case 6:
        return this.bybit;
      case 3:
      case 8:
        return this.kraken;
      case 4:
      case 9:
        return this.bitvavo;
      default:
        return this.bybit;
    }
  }
}
