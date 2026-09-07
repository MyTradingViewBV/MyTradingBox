import { Injectable, inject } from '@angular/core';
import { BinanceStreamService } from './binance-stream.service';
import { BitvavoStreamService } from './bitvavo-stream.service';
import { BybitStreamService } from './bybit-stream.service';
import { ExchangeCandleStreamService } from './exchange-candle-stream.service';
import { KrakenStreamService } from './kraken-stream.service';

@Injectable({ providedIn: 'root' })
export class ExchangeStreamFactory {
  private readonly bybit = inject(BybitStreamService);
  private readonly binance = inject(BinanceStreamService);
  private readonly kraken = inject(KrakenStreamService);
  private readonly bitvavo = inject(BitvavoStreamService);

  create(exchangeId: number): ExchangeCandleStreamService {
    switch (exchangeId) {
      case 1:
      case 6:
        return this.bybit;
      case 2:
      case 7:
        return this.binance;
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
