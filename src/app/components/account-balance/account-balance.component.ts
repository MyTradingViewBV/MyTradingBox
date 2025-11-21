import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountBalanceService } from '../../modules/shared/services/http/account-balance.service';
import { AccountBalanceResponse } from 'src/app/modules/shared/models/accountBallance/accountBalanceResponse.dto';

@Component({
  selector: 'app-account-balance',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './account-balance.component.html',
  styleUrl: './account-balance.component.scss'
})
export class AccountBalanceComponent implements OnInit {
  loading = true;
  error: string | null = null;
  balanceData: AccountBalanceResponse | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logEntries: any;
  accountId = 1;

  // UI data arrays adopted from former BalanceComponent styling
  uiBalanceCards: Array<{ label: string; value: string; change: string; positive: boolean; icon: string }> = [];
  uiPnlCards: Array<{ label: string; value: string; change: string; positive: boolean }> = [];
  uiRecentTransactions: Array<{ type: 'buy' | 'sell'; pair: string; amount: string; value: string; time: string }> = [];

  constructor(private _balanceService: AccountBalanceService) {}

  ngOnInit(): void {
    this.fetch();
  }

  refresh(): void { this.fetch(); }

  private buildUiData(): void {
    if (!this.balanceData) return;
    const b = this.balanceData;
    // Balance summary cards
    this.uiBalanceCards = [
      { label: 'Totale Balans', value: `$${b.AccountBalance.toFixed(2)}`, change: '', positive: true, icon: 'wallet' },
      { label: 'Incl. Orders', value: `$${b.AccountBalanceWithOpenOrders.toFixed(2)}`, change: '', positive: true, icon: 'pie' },
      { label: 'Open Orders', value: `${b.OpenOrdersCount}`, change: '', positive: true, icon: 'dollar' }
    ];
    // PnL cards (unrealized only available; realized placeholder)
    this.uiPnlCards = [
      { label: 'Open Orders P/L', value: `$${b.OpenOrdersPnlAmount.toFixed(2)}`, change: '', positive: b.OpenOrdersPnlAmount >= 0 },
      { label: 'Marktwaarde Orders', value: `$${b.MarketValueOpenOrders.toFixed(2)}`, change: '', positive: true }
    ];
    // Recent transactions placeholder (domain data not available yet)
    this.uiRecentTransactions = [];
  }

  fetch(): void {
    this.loading = true;
    this.error = null;
    this._balanceService.getAccountBalance(this.accountId).subscribe({
      next: (data) => {
        this.balanceData = data;
        this.buildUiData();
        this._balanceService.getAccountBalanceLog(this.accountId).subscribe({
          next: (log) => {
            this.logEntries = log;
            this.loading = false;
          },
          error: (err) => {
            console.error(err);
            this.error = 'Kon balans log niet laden';
            this.loading = false;
          }
        });
      },
      error: (err) => {
        console.error(err);
        this.error = 'Kon account balans niet laden';
        this.loading = false;
      }
    });
  }

  pnlClass(value: number): string {
    if (value > 0) return 'pos';
    if (value < 0) return 'neg';
    return 'neutral';
  }

  trackIndex(_: number, item: unknown): unknown { return item; }
}
