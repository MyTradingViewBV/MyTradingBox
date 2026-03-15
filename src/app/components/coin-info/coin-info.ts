import { Component, ChangeDetectionStrategy, ChangeDetectorRef, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { BinanceTickerService } from '../watchlist/services/binance-ticker.service';

interface CoinInfo {
  symbol: string;
  name: string;
  description: string;
  priceUsd: number | null;
  change24hPct: number | null;
  high24h: number | null;
  low24h: number | null;
  volume24h: number | null;
  marketCapUsd: number | null;
  athUsd: number | null;
  circulatingSupply: number | null;
}

@Component({
  selector: 'app-coin-info',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './coin-info.html',
  styleUrl: './coin-info.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoinInfoComponent implements OnChanges {
  @Input() symbolInput: string | null = null;
  @Input() embedded = false;
  symbol = '';
  info: CoinInfo | null = null;
  loading = false;
  error = '';

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly tickerService = inject(BinanceTickerService);

  constructor() {
    const fromRoute = (this.route.snapshot.paramMap.get('symbol') || '').trim();
    if (fromRoute) {
      this.symbol = fromRoute;
      this.loadInfo(this.symbol);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('symbolInput' in changes) {
      const s = (this.symbolInput || '').trim();
      if (s) {
        this.symbol = s;
        this.loadInfo(s);
      }
    }
  }

  private extractBase(symbol: string): string {
    const upper = symbol.toUpperCase();
    const quotes = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB', 'EUR'];
    for (const q of quotes) {
      if (upper.endsWith(q) && upper.length > q.length) return upper.slice(0, -q.length);
    }
    return upper;
  }

  private loadInfo(symbol: string): void {
    const upper = symbol.toUpperCase();
    this.loading = true;
    this.error = '';
    this.info = null;
    this.cdr.markForCheck();

    const partial: CoinInfo = {
      symbol: upper, name: upper, description: '',
      priceUsd: null, change24hPct: null, high24h: null,
      low24h: null, volume24h: null, marketCapUsd: null,
      athUsd: null, circulatingSupply: null,
    };

    // Seed with live WebSocket ticker price if already available
    const ticker = this.tickerService.getLatest().get(upper);
    if (ticker) {
      partial.priceUsd = ticker.close;
      partial.change24hPct = ticker.changePct;
    }

    if (upper.includes('DOMINANCE')) {
      partial.description = 'Dominance index — not a directly tradeable asset.';
      this.info = { ...partial };
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    // CoinGecko search → coin detail (free, no API key, CORS-friendly)
    const base = this.extractBase(upper);
    this.http.get<any>(`https://api.coingecko.com/api/v3/search?query=${base}`).subscribe({
      next: (resp) => {
        const coin = (resp?.coins ?? []).find((c: any) =>
          (c.symbol ?? '').toUpperCase() === base
        ) ?? resp?.coins?.[0];
        if (!coin?.id) { this.info = { ...partial }; this.loading = false; this.cdr.markForCheck(); return; }

        this.http.get<any>(
          `https://api.coingecko.com/api/v3/coins/${coin.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`
        ).subscribe({
          next: (data) => {
            partial.name = data.name ?? upper;
            partial.description = (data.description?.en ?? '')
              .replace(/<[^>]+>/g, '').trim().slice(0, 500);
            partial.marketCapUsd = data.market_data?.market_cap?.usd ?? null;
            partial.athUsd = data.market_data?.ath?.usd ?? null;
            partial.circulatingSupply = data.market_data?.circulating_supply ?? null;
            partial.high24h = data.market_data?.high_24h?.usd ?? null;
            partial.low24h = data.market_data?.low_24h?.usd ?? null;
            partial.volume24h = data.market_data?.total_volume?.usd ?? null;
            // Use CoinGecko price only if ticker WS didn't have it
            if (partial.priceUsd == null) {
              partial.priceUsd = data.market_data?.current_price?.usd ?? null;
              partial.change24hPct = data.market_data?.price_change_percentage_24h ?? null;
            }
            this.info = { ...partial };
            this.loading = false;
            this.cdr.markForCheck();
          },
          error: () => { this.info = { ...partial }; this.loading = false; this.cdr.markForCheck(); },
        });
      },
      error: () => { this.info = { ...partial }; this.loading = false; this.cdr.markForCheck(); },
    });
  }

  goBack(): void {
    this.router.navigate(['/watchlist']);
  }

  openChart(): void {
    if (this.symbol) this.router.navigate(['/chart', this.symbol, '1d']);
  }
}
