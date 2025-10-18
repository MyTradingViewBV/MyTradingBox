import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AppService } from '../../modules/shared/http/appService';
import { AppActions } from '../../store/app.actions';
import { Exchange } from '../../modules/shared/models/TradeOrders.dto';
import { MarketService } from '../../modules/shared/http/market.service';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from 'src/app/services/theme.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatFormFieldModule, MatSelectModule, MatIconModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  exchanges: Exchange[] = [];
  currencies = ['Euro', 'Dollar'];

  selectedExchange = new Exchange();
  selectedCurrency = 'Euro';

  constructor(
    private _appService: AppService,
    private _marketService: MarketService,
    private _cdr: ChangeDetectorRef,
    public theme: ThemeService
  ) {}

  ngOnInit(): void {
    
    // Check if there is a default set
    this._appService.getSelectedCurrency().subscribe((currency) => {
      if (!currency) {
        this.currencyChange(this.selectedCurrency);
      } else {
        this.selectedCurrency = currency;
        this._cdr.detectChanges();
      }
    });

    this.getExchanges();

    this._appService.getSelectedExchange().subscribe((exchange) => {
      if (!exchange) {
        this.exchangeChange(this.selectedExchange);
      } else {
        this.selectedExchange = exchange;
        this._cdr.detectChanges();
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
