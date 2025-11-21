import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// Angular Material removed
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { FormsModule } from '@angular/forms';
import { ThemeService } from 'src/app/helpers/theme.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
  ],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
})
export class SettingsComponent implements OnInit {
  exchanges: Exchange[] = [];
  currencies = ['Euro', 'Dollar'];
  selectedExchange = new Exchange();
  selectedCurrency = 'Euro';
  userProfile = { name: 'John Trader', email: 'john.trader@email.com' };

  settingsSections: Array<{
    title: string;
    items: Array<{
      label: string;
      icon?: string; // using simple icon class names or svg refs
      toggle?: boolean;
      enabled?: boolean;
      action?: boolean;
      value?: string;
    }>;
  }> = [
    {
      title: 'Account',
      items: [
        { label: 'Profile Settings', action: true, icon: 'user' },
        { label: 'Security & Privacy', action: true, icon: 'shield' },
        { label: 'Payment Methods', action: true, icon: 'card' },
        { label: 'Two-Factor Auth', action: true, icon: 'lock' },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { label: 'Trade Alerts', toggle: true, enabled: true, icon: 'bell' },
        { label: 'Price Alerts', toggle: true, enabled: true, icon: 'bell' },
        { label: 'News Updates', toggle: true, enabled: false, icon: 'bell' },
        { label: 'Dark Mode', toggle: true, enabled: true, icon: 'moon' },
      ],
    },
    {
      title: 'General',
      items: [
        { label: 'Language', action: true, value: 'English', icon: 'globe' },
        { label: 'App Version', action: true, value: 'v0.1.0', icon: 'smartphone' },
      ],
    },
  ];


  constructor(
    private _settingsService: SettingsService,
    private _marketService: ChartService,
    private _cdr: ChangeDetectorRef,
    public theme: ThemeService,
  ) {}

  ngOnInit(): void {
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

  toggleItem(sectionIndex: number, itemIndex: number): void {
    const item = this.settingsSections[sectionIndex].items[itemIndex];
    if (!item.toggle) return;
    item.enabled = !item.enabled;
    if (item.label === 'Dark Mode') {
      this.cycleTheme();
    }
  }
}
