import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

interface MockCoinInfo {
  symbol: string;
  name: string;
  description: string;
  priceUsd: number;
  change24hPct: number;
  marketCapUsd: number;
}

@Component({
  selector: 'app-coin-info',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './coin-info.html',
  styleUrl: './coin-info.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoinInfoComponent {
  symbol = '';
  info: MockCoinInfo | null = null;

  constructor(private route: ActivatedRoute, private router: Router) {
    this.symbol = (this.route.snapshot.paramMap.get('symbol') || '').trim();
    this.info = this.buildMock(this.symbol);
  }

  private buildMock(symbol: string): MockCoinInfo {
    const upper = (symbol || 'UNKNOWN').toUpperCase();
    const baseName = upper.replace('USDT', '');
    const seed = Math.max(1, baseName.charCodeAt(0) - 64);
    return {
      symbol: upper,
      name: `${baseName} Token`,
      description:
        `${baseName} is a mock asset used for preview purposes. ` +
        `This page shows placeholder fundamentals while the real API is not available.`,
      priceUsd: 10 + seed * 3.1415,
      change24hPct: ((seed % 7) - 3),
      marketCapUsd: (seed * 1_000_000_000),
    };
  }

  goBack(): void {
    this.router.navigate(['/watchlist']);
  }

  openChart(): void {
    const tf = '1d';
    if (this.symbol) {
      this.router.navigate(['/chart', this.symbol, tf]);
    }
  }
}
