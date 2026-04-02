
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import {
  UserSymbolsService,
  UserSymbolProfile,
} from 'src/app/modules/shared/services/http/user-symbols.service';
import {
  UserNotificationSettingsService,
  UserNotificationSettings,
} from 'src/app/modules/shared/services/http/user-notification-settings.service';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { forkJoin, catchError, of } from 'rxjs';

interface AlertOption {
  label: string;
  enabled: boolean;
}

interface CoinAlertSettings {
  symbol: string;
  icon: string | undefined;
  exchangeId: number;
  userId: string;
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
  imports: [CommonModule, RouterModule, FormsModule, BackButtonComponent],
  templateUrl: './alerts-settings.component.html',
  styleUrls: ['./alerts-settings.component.scss']
})
export class AlertsSettingsComponent implements OnInit {
  private readonly userSymbolsService = inject(UserSymbolsService);
  private readonly notificationSettingsService = inject(UserNotificationSettingsService);
  private readonly appService = inject(AppService);
  private readonly settingsService = inject(SettingsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  loading = false;
  saving = false;
  saveError = false;
  saveSuccess = false;
  coinAlerts: CoinAlertSettings[] = [];
  selectedCoin: CoinAlertSettings | null = null;
  private autoSelectSymbol: string | null = null;
  private currentExchangeId = 0;
  private currentUserId = '';

  ngOnInit(): void {
    this.autoSelectSymbol = (this.route.snapshot.paramMap.get('symbol') || '').trim().toUpperCase() || null;
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;
    forkJoin({
      profiles: this.userSymbolsService.getUserSymbolsProfile().pipe(catchError(() => of([]))),
      notifSettings: this.notificationSettingsService.getAll().pipe(catchError(() => of([]))),
      exchangeId: this.settingsService.waitForExchangeId$(),
      userId: this.appService.getUserId$(),
    }).subscribe({
      next: ({ profiles, notifSettings, exchangeId, userId }) => {
        this.currentExchangeId = exchangeId;
        this.currentUserId = userId ?? '';
        const settingsMap = new Map<string, UserNotificationSettings>(
          (notifSettings ?? []).map((s) => [s.Symbol.toUpperCase(), s])
        );
        this.coinAlerts = (profiles ?? [])
          .filter((p) => !(p.Symbol || p.Name || '').toUpperCase().includes('DOMINANCE'))
          .map((p) => this.buildCoinAlerts(p, settingsMap));
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

  private buildCoinAlerts(
    profile: UserSymbolProfile,
    settingsMap: Map<string, UserNotificationSettings>
  ): CoinAlertSettings {
    const symbol = (profile.Symbol || profile.Name || '').toUpperCase();
    const ns = settingsMap.get(symbol);
    return {
      symbol,
      icon: resolveIconUrl(symbol, profile.Icon || undefined),
      exchangeId: this.currentExchangeId,
      userId: this.currentUserId,
      tradeOrderAlerts: [
        { label: 'New Order', enabled: ns ? ns.NotifyTradeOrderNew : false },
        { label: 'Target 1 Reached', enabled: ns ? ns.NotifyTradeOrderTarget1 : false },
        { label: 'Target 2 Reached', enabled: ns ? ns.NotifyTradeOrderTarget2 : false },
        { label: 'Order Stopped', enabled: ns ? ns.NotifyTradeOrderStopped : false },
      ],
      boxCandleAlerts: [
        { label: 'Candle in Box', enabled: ns ? ns.NotifyBoxCandleIn : false },
        { label: 'Candle through Box', enabled: ns ? ns.NotifyBoxCandleThrough : false },
      ],
      watchlistAlerts: [
        { label: 'Active Monitoring', enabled: ns ? ns.NotifyWatchlistActive : false },
      ],
      capitalFlowTiers: [
        { label: 'Bronze', enabled: ns ? ns.NotifyCapitalFlowBronze : false },
        { label: 'Silver', enabled: ns ? ns.NotifyCapitalFlowSilver : false },
        { label: 'Gold', enabled: ns ? ns.NotifyCapitalFlowGold : false },
        { label: 'Platinum', enabled: ns ? ns.NotifyCapitalFlowPlatinum : false },
      ],
      capitalFlowTimeframes: [
        { label: '12min', enabled: ns ? ns.NotifyCfTF12m : false },
        { label: '24min', enabled: ns ? ns.NotifyCfTF24m : false },
        { label: '1h', enabled: ns ? ns.NotifyCfTF1h : false },
        { label: '4h', enabled: ns ? ns.NotifyCfTF4h : false },
        { label: '1day', enabled: ns ? ns.NotifyCfTF1d : false },
        { label: '1w', enabled: ns ? ns.NotifyCfTF1w : false },
        { label: '1month', enabled: ns ? ns.NotifyCfTF1M : false },
      ],
    };
  }

  private toApiModel(coin: CoinAlertSettings): UserNotificationSettings {
    return {
      ExchangeId: coin.exchangeId,
      Symbol: coin.symbol,
      UserId: coin.userId,
      NotifyTradeOrderNew: coin.tradeOrderAlerts[0].enabled,
      NotifyTradeOrderTarget1: coin.tradeOrderAlerts[1].enabled,
      NotifyTradeOrderTarget2: coin.tradeOrderAlerts[2].enabled,
      NotifyTradeOrderStopped: coin.tradeOrderAlerts[3].enabled,
      NotifyBoxCandleIn: coin.boxCandleAlerts[0].enabled,
      NotifyBoxCandleThrough: coin.boxCandleAlerts[1].enabled,
      NotifyWatchlistActive: coin.watchlistAlerts[0].enabled,
      NotifyCapitalFlowBronze: coin.capitalFlowTiers[0].enabled,
      NotifyCapitalFlowSilver: coin.capitalFlowTiers[1].enabled,
      NotifyCapitalFlowGold: coin.capitalFlowTiers[2].enabled,
      NotifyCapitalFlowPlatinum: coin.capitalFlowTiers[3].enabled,
      NotifyCfTF12m: coin.capitalFlowTimeframes[0].enabled,
      NotifyCfTF24m: coin.capitalFlowTimeframes[1].enabled,
      NotifyCfTF1h: coin.capitalFlowTimeframes[2].enabled,
      NotifyCfTF4h: coin.capitalFlowTimeframes[3].enabled,
      NotifyCfTF1d: coin.capitalFlowTimeframes[4].enabled,
      NotifyCfTF1w: coin.capitalFlowTimeframes[5].enabled,
      NotifyCfTF1M: coin.capitalFlowTimeframes[6].enabled,
    };
  }

  saveCoinSettings(): void {
    if (!this.selectedCoin || this.saving) return;
    this.saving = true;
    this.saveError = false;
    this.saveSuccess = false;
    this.notificationSettingsService.update(this.toApiModel(this.selectedCoin)).subscribe({
      next: () => {
        this.saving = false;
        this.saveSuccess = true;
        setTimeout(() => (this.saveSuccess = false), 2500);
      },
      error: () => {
        this.saving = false;
        this.saveError = true;
        setTimeout(() => (this.saveError = false), 3000);
      },
    });
  }

  selectCoin(coin: CoinAlertSettings): void {
    this.selectedCoin = coin;
    this.saveSuccess = false;
    this.saveError = false;
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
