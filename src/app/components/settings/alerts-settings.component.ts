
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import {
  UserSymbolsService,
  UserSymbolProfile,
} from 'src/app/modules/shared/services/http/user-symbols.service';

interface AlertOption {
  label: string;
  enabled: boolean;
}

interface CoinAlertSettings {
  symbol: string;
  icon: string | undefined;
  tradeOrderAlerts: AlertOption[];
  boxCandleAlerts: AlertOption[];
  watchlistAlerts: AlertOption[];
  capitalFlowTiers: AlertOption[];
  capitalFlowTimeframes: AlertOption[];
}

function resolveIconUrl(symbolName: string, apiBase64?: string): string | undefined {
  if (apiBase64) {
    const s = apiBase64.trim();
    return s.startsWith('data:') ? s : `data:image/png;base64,${s}`;
  }
  const name = (symbolName || '').toUpperCase();
  if (name.includes('DOMINANCE')) return undefined;
  const quotes = ['USDT', 'USDC', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB', 'EUR'];
  let base = name;
  for (const q of quotes) {
    if (name.length > q.length && name.endsWith(q)) {
      base = name.slice(0, -q.length);
      break;
    }
  }
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base.toLowerCase()}.png`;
}

@Component({
  selector: 'app-alerts-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './alerts-settings.component.html',
  styleUrls: ['./alerts-settings.component.scss']
})
export class AlertsSettingsComponent implements OnInit {
  private readonly userSymbolsService = inject(UserSymbolsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loading = false;
  coinAlerts: CoinAlertSettings[] = [];
  selectedCoin: CoinAlertSettings | null = null;
  private autoSelectSymbol: string | null = null;

  ngOnInit(): void {
    this.autoSelectSymbol = (this.route.snapshot.paramMap.get('symbol') || '').trim().toUpperCase() || null;
    this.loadUserSymbols();
  }

  private loadUserSymbols(): void {
    this.loading = true;
    this.userSymbolsService.getUserSymbolsProfile().subscribe({
      next: (profiles) => {
        this.coinAlerts = (profiles ?? [])
          .filter((p) => !(p.Symbol || p.Name || '').toUpperCase().includes('DOMINANCE'))
          .map((p) => this.buildCoinAlerts(p));
        if (this.autoSelectSymbol) {
          const match = this.coinAlerts.find((c) => c.symbol === this.autoSelectSymbol);
          if (match) this.selectedCoin = match;
          this.autoSelectSymbol = null;
        }
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  private buildCoinAlerts(profile: UserSymbolProfile): CoinAlertSettings {
    const symbol = (profile.Symbol || profile.Name || '').toUpperCase();
    return {
      symbol,
      icon: resolveIconUrl(symbol, profile.Icon || undefined),
      tradeOrderAlerts: [
        { label: 'New Order', enabled: true },
        { label: 'Target 1 Reached', enabled: false },
        { label: 'Target 2 Reached', enabled: false },
        { label: 'Order Stopped', enabled: true },
      ],
      boxCandleAlerts: [
        { label: 'Candle in Box', enabled: true },
        { label: 'Candle through Box', enabled: false },
      ],
      watchlistAlerts: [
        { label: 'Active Monitoring', enabled: true },
      ],
      capitalFlowTiers: [
        { label: 'Bronze', enabled: true },
        { label: 'Silver', enabled: false },
        { label: 'Gold', enabled: true },
        { label: 'Platinum', enabled: false },
      ],
      capitalFlowTimeframes: [
        { label: '12min', enabled: true },
        { label: '24min', enabled: false },
        { label: '1h', enabled: true },
        { label: '4h', enabled: false },
        { label: '1day', enabled: true },
        { label: '1w', enabled: false },
        { label: '1month', enabled: true },
      ],
    };
  }

  selectCoin(coin: CoinAlertSettings): void {
    this.selectedCoin = coin;
  }

  clearIcon(coin: CoinAlertSettings): void {
    coin.icon = undefined;
  }

  goBack(): void {
    if (this.selectedCoin) {
      this.selectedCoin = null;
    } else {
      this.router.navigate(['/settings']);
    }
  }
}
