import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AccountBalanceService } from '../../modules/shared/services/http/account-balance.service';
// import { AccountBalanceLogEntry } from 'src/app/modules/shared/models/accountBallance/accountBalanceLogEntry.dto';
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
  logEntries: any; //AccountBalanceLogEntry[] = [];
  accountId = 1; // could be dynamic later

  displayedOpenOrdersColumns = ['Symbol','Direction','EntryPrice','CurrentPrice','InvestedUsd','RemainingCoinQuantity','PnlAmount','PnlPercent'];
  displayedLogColumns = ['CreatedAt','ChangeType','ChangeAmount','NewBalance','TradeId'];

  constructor(private _balanceService: AccountBalanceService) {}

  ngOnInit(): void {
    this.fetch();
  }

  refresh(): void { this.fetch(); }

  fetch(): void {
    this.loading = true;
    this.error = null;
    this._balanceService.getAccountBalance(this.accountId).subscribe({
      next: (data) => {
        this.balanceData = data;
        this._balanceService.getAccountBalanceLog(this.accountId).subscribe({
          next: (log) => {
            //todo
            console.log(log);
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
    if (value > 0) return 'positive';
    if (value < 0) return 'negative';
    return 'neutral';
  }
}
