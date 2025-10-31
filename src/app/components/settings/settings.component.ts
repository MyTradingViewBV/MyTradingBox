import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from 'src/app/helpers/theme.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  exchanges: Exchange[] = [];
  currencies = ['Euro', 'Dollar'];

  selectedExchange = new Exchange();
  selectedCurrency = 'Euro';

  constructor(
    private _settingsService: SettingsService,
    private _marketService: ChartService,
    private _cdr: ChangeDetectorRef,
    public theme: ThemeService,
  ) {}

  ngOnInit(): void {
    // Check if there is a default set
    this._settingsService.getSelectedCurrency().subscribe((currency) => {
      if (!currency) {
        this.currencyChange(this.selectedCurrency);
      } else {
        this.selectedCurrency = currency;
        this._cdr.detectChanges();
      }
    });

    this.getExchanges();

    this._settingsService.getSelectedExchange().subscribe((exchange) => {
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
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedCurrency({ currency: currency }),
    );
  }

  exchangeChange(exchange: Exchange): void {
    this._settingsService.dispatchAppAction(
      SettingsActions.setSelectedExchange({ exchange: exchange }),
    );
  }

  // Theme helpers
  setTheme(themeName: 'dark'): void {
    this.theme.applyTheme(themeName);
  }

  isActive(themeName: 'dark'): boolean {
    return this.theme.activeTheme === themeName;
  }

  cycleTheme(): void {
    this.theme.cycleTheme();
  }
}
