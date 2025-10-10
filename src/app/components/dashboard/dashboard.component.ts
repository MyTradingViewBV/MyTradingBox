import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AppService } from '../../modules/shared/http/appService';
import { AppActions } from '../../store/app.actions';
import { Exchange } from '../../modules/shared/models/TradeOrders.dto';
import { MarketService } from '../../modules/shared/http/market.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  exchanges: Exchange[] = [];
  currencies = ['Euro', 'Dollar'];

  selectedNumber = 1;
  selectedCurrency = 'Euro';

  constructor(
    private _appService: AppService,
    private _marketService: MarketService,
  ) {}

  ngOnInit(): void {
    // Check if there is a default set
    this._appService.getSelectedCurrency().subscribe((currency) => {
      if (!currency) {
        this.currencyChange(this.selectedCurrency);
      }
    });
  }

  getExchanges(): void {
    this._marketService.getExchanges().subscribe((exchanges) => {
      if (exchanges) {
        this.exchanges = exchanges;
      }
    });
  }

  currencyChange(currency: string): void {
    this._appService.dispatchAppAction(
      AppActions.setSelectedCurrency({ currency: currency }),
    );
  }

  exchangeChange(exchange: Exchange): void {
    this._appService.dispatchAppAction(
      AppActions.setSelectedExchange({ exchange: exchange }),
    );
  }
}
