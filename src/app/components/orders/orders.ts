import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { TradePlanModel } from '../../modules/shared/models/orders/tradeOrders.dto';
import { Router } from '@angular/router';
import { WatchlistDTO } from '../../modules/shared/models/watchlist/watchlist.dto';
import { FormsModule } from '@angular/forms';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { OrderModel } from 'src/app/modules/shared/models/orders/order.dto';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';

@Component({
  selector: 'app-orders',
  imports: [CommonModule, FormsModule],
  templateUrl: './orders.html',
  styleUrl: './orders.scss',
})
export class OrdersComponent implements OnInit {
  orders: OrderModel[] = [];
  filteredOrders: OrderModel[] = [];
  selectedStatus = 'ACTIVE';
  fullResult: TradePlanModel = new TradePlanModel();
  loading = false;
  watchlist: WatchlistDTO[] = [];
  selectedTimeframe = '';

  constructor(
    private _chartService: ChartService,
    private router: Router,
    private _settingsService: SettingsService,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this._chartService.getTradeOrdersV2().subscribe((data) => {
      console.log('DATA: ', data);
      this.orders = data.Orders;
      this.fullResult = data;
      this.filteredOrders = [...this.orders];
      this.loading = false;
      this.filterOrders();
      console.log('Orders fetched:', this.orders);
      this._chartService.getWatchlist().subscribe((data) => {
        this.watchlist = data;
        console.log('watchlist fetched:', this.watchlist);
        this.watchlist =
          this.watchlist?.filter((i) => i.Status === 'BTC-DIV') ?? [];
      });
    });
  }

  goToChart(symbol: string, timeframe: string): void {
    if (!symbol) return;

    this._chartService.getSymbols().subscribe((symbols) => {
      if (symbols) {
        const symModel = symbols.find((s) => s.SymbolName == symbol) as SymbolModel;
        this._settingsService.dispatchAppAction(
          SettingsActions.setSelectedSymbol({ symbol: symModel }),
        );
        // Determine navigation target based on available params.
        // Routes supported: /chart, /chart/:symbol, /chart/:symbol/:timeframe
        const cleanedSymbol = symbol.trim();
        const cleanedTimeframe = (timeframe || '').trim();
        if (cleanedSymbol && cleanedTimeframe) {
          this.router.navigate(['/chart', cleanedSymbol, cleanedTimeframe]);
        } else if (cleanedSymbol) {
          this.router.navigate(['/chart', cleanedSymbol]);
        } else {
          this.router.navigate(['/chart']);
        }
      }
    });
  }

  filterOrders(): void {
    if (!this.selectedStatus) {
      this.filteredOrders = [...this.orders]; // show all
    } else {
      if (this.selectedStatus === 'ACTIVE') {
        this.filteredOrders = this.orders.filter(
          (x) => x.Status === 'NEW' || x.Status === 'TARGET1',
        );
      } else {
        this.filteredOrders = this.orders.filter(
          (o) => o.Status === this.selectedStatus,
        );
      }
    }
  }

  getStatusColor(status: string): string {
    return status === 'NEW' ? 'primary' : status === 'DONE' ? 'accent' : '';
  }

  deleteOrder(orderId: number): void {
    this._chartService.deleteOrder(orderId).subscribe(() => {
      this.orders = this.orders.filter((order) => order.Id !== orderId);
      console.log(`Order with ID ${orderId} deleted.`);
    });
  }

  refresh(): void {
    this.loading = true;
    this._chartService.getTradeOrdersV2().subscribe((data) => {
      this.orders = data.Orders;
      this.fullResult = data;
      this.filteredOrders = [...this.orders];
      console.log('Orders refreshed:', this.orders);
      this.loading = false;
      this.selectedStatus = 'NEW';
      this.filterOrders();
      console.log('Orders refreshed');
    });
  }

  back(): void {
    window.history.back();
  }
}
