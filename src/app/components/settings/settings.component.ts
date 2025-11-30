import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
// Angular Material removed
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { FormsModule } from '@angular/forms';
import { ThemeService } from 'src/app/helpers/theme.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import { Router } from '@angular/router';
import { AppService } from 'src/app/modules/shared/services/services/appService';
import { switchMap, tap } from 'rxjs';

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
        { label: 'App Version', action: true, value: 'v0.1.1', icon: 'smartphone' },
      ],
    },
  ];


  constructor(
    private _settingsService: SettingsService,
    private _marketService: ChartService,
    private _cdr: ChangeDetectorRef,
    public theme: ThemeService,
    private _appService: AppService,
    private _router: Router,
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
    // Load exchanges first, then align selected exchange from store to list instance for proper select binding
    this._marketService
      .getExchanges()
      .pipe(
        tap((exchanges) => {
          this.exchanges = exchanges || [];
          console.log('[Settings] Exchanges loaded:', this.exchanges);
        }),
        switchMap(() => this._settingsService.getSelectedExchange()),
      )
      .subscribe((exchange) => {
      console.log('[Settings] Store selectedExchange emitted:', exchange);
      if (exchange) {
        console.log('[Settings] Attempting to map store exchange to list instance...');
        const match = this.exchanges.find((ex: any) => {
          if ((exchange as any).Id != null && ex.Id === (exchange as any).Id) return true;
          if ((exchange as any).Name && ex.Name === (exchange as any).Name) return true;
          return false;
        });
        if (match) {
          this.selectedExchange = match as Exchange;
          console.log('[Settings] Mapped to list instance:', this.selectedExchange);
        } else if (this.exchanges.length) {
          this.selectedExchange = this.exchanges[0] as Exchange;
          this._settingsService.dispatchAppAction(
            SettingsActions.setSelectedExchange({ exchange: this.selectedExchange }),
          );
          console.warn('[Settings] Store exchange not found in list; falling back to first:', this.selectedExchange);
        } else {
          this.selectedExchange = exchange;
          console.warn('[Settings] Exchanges list empty; keeping store object as selection:', this.selectedExchange);
        }
        this._cdr.detectChanges();
        console.log('[Settings] Dropdown selection set to:', this.selectedExchange);
      } else {
        // No exchange in store: if we already have exchanges loaded, choose first and dispatch
        if (this.exchanges.length) {
          // Try restore from localStorage if available
          let restored: Exchange | null = null;
          try {
            const storedId = localStorage.getItem('selectedExchangeId');
            const storedName = localStorage.getItem('selectedExchangeName');
            console.log('[Settings] Attempting localStorage restore:', { storedId, storedName });
            if (storedId) {
              restored = (this.exchanges.find((ex: any) => String(ex.Id) === storedId) as Exchange) || null;
            }
            if (!restored && storedName) {
              restored = (this.exchanges.find((ex: any) => (ex.Name || '') === storedName) as Exchange) || null;
            }
          } catch {}
          this.selectedExchange = (restored as Exchange) || (this.exchanges[0] as Exchange);
          this._settingsService.dispatchAppAction(
            SettingsActions.setSelectedExchange({ exchange: this.selectedExchange }),
          );
          console.log('[Settings] Restored selection (store was empty):', this.selectedExchange);
          this._cdr.detectChanges();
        }
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
      // Persist to store and apply theme
      this._settingsService.dispatchAppAction(
        SettingsActions.setDarkModeEnabled({ enabled: item.enabled ?? true }),
      );
      this.cycleTheme();
      return;
    }
    if (item.label === 'Trade Alerts') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setTradeAlertsEnabled({ enabled: item.enabled ?? true }),
      );
      return;
    }
    if (item.label === 'Price Alerts') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setPriceAlertsEnabled({ enabled: item.enabled ?? true }),
      );
      return;
    }
    if (item.label === 'News Updates') {
      this._settingsService.dispatchAppAction(
        SettingsActions.setNewsUpdatesEnabled({ enabled: item.enabled ?? false }),
      );
      return;
    }
  }

  logout(): void {
    this._appService.logout();
    this._router.parseUrl('/login');
  }
}
