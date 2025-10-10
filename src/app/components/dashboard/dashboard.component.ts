import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { AppService } from '../../modules/shared/http/appService';
import { AppActions } from '../../store/app.actions';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatFormFieldModule, MatSelectModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent {
  numbers = [1, 2, 3, 4];
  currencies = ['Euro', 'Dollar'];

  selectedNumber = 1;
  selectedCurrency = 'Euro';

  constructor(private _appService: AppService) {}

  currencyChange(currency: string): void {
    this._appService.dispatchAppAction(
      AppActions.setSelectedCurrency({ currency: currency }),
    );
  }

  exchangeChange(exchange: string): void {
    this._appService.dispatchAppAction(
      AppActions.setSelectedExchange({ exchange: exchange }),
    );
  }
}
