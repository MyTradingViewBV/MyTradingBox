import {
  Component,
  DestroyRef,
  OnInit,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, catchError, finalize, switchMap } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FooterComponent } from '../footer/footer.component';
import { AccountBalanceService } from '../../modules/shared/services/http/account-balance.service';
import { AccountBalanceResponse } from 'src/app/modules/shared/models/accountBallance/accountBalanceResponse.dto';
import { AccountBalanceLogEntry } from 'src/app/modules/shared/models/accountBallance/accountBalanceLogEntry.dto';
import { TranslateModule } from '@ngx-translate/core';
import { BackButtonComponent } from '../shared/back-button/back-button.component';
import { RefreshButtonComponent } from '../shared/refresh-button/refresh-button.component';
import { PnlClassPipe } from './pnl-class.pipe';

@Component({
  selector: 'app-account-balance',
  standalone: true,
  imports: [
    CommonModule,
    FooterComponent,
    TranslateModule,
    BackButtonComponent,
    RefreshButtonComponent,
    PnlClassPipe,
  ],
  templateUrl: './account-balance.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './account-balance.component.scss',
})
export class AccountBalanceComponent implements OnInit {
  loading = true;
  error: string | null = null;
  balanceData: AccountBalanceResponse | null = null;

  logEntries: AccountBalanceLogEntry[] = [];
  accountId = 1;

  // UI data arrays adopted from former BalanceComponent styling
  uiBalanceCards: Array<{
    label: string;
    value: string;
    change: string;
    positive: boolean;
    icon: string;
  }> = [];
  uiPnlCards: Array<{
    label: string;
    value: string;
    change: string;
    positive: boolean;
  }> = [];
  uiRecentTransactions: Array<{
    type: 'buy' | 'sell';
    pair: string;
    amount: string;
    value: string;
    time: string;
  }> = [];

  private readonly _balanceService = inject(AccountBalanceService);
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    this.fetch();
  }

  refresh(): void {
    this.fetch();
  }

  private buildUiData(): void {
    if (!this.balanceData) return;
    const b = this.balanceData;
    // Bereken eenvoudige procentuele veranderingen (placeholder logica)
    const diffInclOrders = b.AccountBalanceWithOpenOrders - b.AccountBalance;
    const pctInclOrders =
      b.AccountBalance === 0 ? 0 : (diffInclOrders / b.AccountBalance) * 100;

    // Balance summary cards (matching design structuur)
    this.uiBalanceCards = [
      {
        label: 'Total Balance',
        value: `$${b.AccountBalance.toFixed(2)}`,
        change: '+22.04%', // Placeholder tot echte berekening beschikbaar
        positive: true,
        icon: 'wallet',
      },
      {
        label: 'Available',
        value: `$${b.AccountBalance.toFixed(2)}`,
        change: '+18.5%', // Placeholder
        positive: true,
        icon: 'dollar',
      },
      {
        label: 'In Orders',
        value: `$${b.AccountBalanceWithOpenOrders.toFixed(2)}`,
        change:
          pctInclOrders === 0
            ? ''
            : `${pctInclOrders >= 0 ? '+' : ''}${pctInclOrders.toFixed(2)}%`,
        positive: pctInclOrders >= 0,
        icon: 'pie',
      },
    ];

    // P/L cards
    this.uiPnlCards = [
      {
        label: 'Unrealized P/L',
        value: `$${b.OpenOrdersPnlAmount.toFixed(2)}`,
        change:
          b.OpenOrdersPnlAmount === 0
            ? ''
            : `${b.OpenOrdersPnlAmount >= 0 ? '+' : ''}${((Math.abs(b.OpenOrdersPnlAmount) / (b.AccountBalance || 1)) * 100).toFixed(2)}%`,
        positive: b.OpenOrdersPnlAmount >= 0,
      },
      {
        label: 'Realized P/L',
        value: '-$110.10', // Placeholder tot er echte realized P/L data is
        change: '-1.52%',
        positive: false,
      },
    ];

    // Recent transactions demo (indien geen echte data)
    if (!this.uiRecentTransactions.length) {
      this.uiRecentTransactions = [
        {
          type: 'buy',
          pair: 'BTC-EUR',
          amount: '+0.0234 BTC',
          value: '$845.32',
          time: '2h ago',
        },
        {
          type: 'sell',
          pair: 'ETH-EUR',
          amount: '-1.5 ETH',
          value: '$3,241.50',
          time: '5h ago',
        },
        {
          type: 'buy',
          pair: 'HBAR-EUR',
          amount: '+5000 HBAR',
          value: '$245.00',
          time: '1d ago',
        },
        {
          type: 'buy',
          pair: 'SOL-EUR',
          amount: '+12.5 SOL',
          value: '$1,230.62',
          time: '2d ago',
        },
      ];
    }
  }

  fetch(): void {
    this.loading = true;
    this.error = null;
    this._balanceService
      .getAccountBalance(this.accountId)
      .pipe(
        catchError((err) => {
          console.error(err);
          this.error = 'Kon account balans niet laden';
          return EMPTY;
        }),
        switchMap((data) => {
          this.balanceData = data;
          this.buildUiData();
          return this._balanceService.getAccountBalanceLog(this.accountId).pipe(
            catchError((err) => {
              console.error(err);
              this.error = 'Kon balans log niet laden';
              return EMPTY;
            }),
          );
        }),
        finalize(() => (this.loading = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((log) => {
        this.logEntries = log;
      });
  }
}
