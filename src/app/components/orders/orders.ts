import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ChangeDetectorRef } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { FooterComponent } from '../footer/footer-compenent';
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
  imports: [CommonModule, FormsModule, FooterComponent, ScrollingModule],
  templateUrl: './orders.html',
  styleUrl: './orders.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent implements OnInit {
  orders: OrderModel[] = [];
  filteredOrders: OrderModel[] = [];
  selectedStatus = 'ACTIVE';
  private selectedStatusChanges = new Subject<string>();
  fullResult: TradePlanModel = new TradePlanModel();
  loading = false;
  watchlist: WatchlistDTO[] = [];
  selectedTimeframe = '';
  expandedOrderIds = new Set<number>();

  constructor(
    private _chartService: ChartService,
    private router: Router,
    private _settingsService: SettingsService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    // Debounce status filter changes to avoid frequent recalculations
    this.selectedStatusChanges.pipe(debounceTime(150)).subscribe((status) => {
      this.selectedStatus = status;
      this.filterOrders();
    });
    this.loading = true;
    forkJoin({
      orders: this._chartService.getTradeOrdersV2(),
      watchlist: this._chartService.getWatchlist(),
    }).subscribe(({ orders, watchlist }) => {
      this.orders = orders.Orders;
      this.fullResult = orders;
      this.filteredOrders = [...this.orders];
      this.watchlist = (watchlist ?? []).filter((i) => i.Status === 'BTC-DIV');
      this.filterOrders();
      this.loading = false;
      this.cdr.markForCheck();
    });
  }
  onStatusChange(status: string): void {
    this.selectedStatusChanges.next(status);
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
    this.cdr.markForCheck();
  }

  getStatusColor(status: string): string {
    return status === 'NEW' ? 'primary' : status === 'DONE' ? 'accent' : '';
  }

  deleteOrder(orderId: number): void {
    this._chartService.deleteOrder(orderId).subscribe(() => {
      this.orders = this.orders.filter((order) => order.Id !== orderId);
      this.filterOrders();
      this.cdr.markForCheck();
    });
  }

  refresh(): void {
    this.loading = true;
    this._chartService.getTradeOrdersV2().subscribe((data) => {
      this.orders = data.Orders;
      this.fullResult = data;
      this.filteredOrders = [...this.orders];
      this.selectedStatus = 'NEW';
      this.filterOrders();
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  toggleOrder(order: OrderModel): void {
    const id = order.Id;
    if (this.expandedOrderIds.has(id)) {
      this.expandedOrderIds.delete(id);
    } else {
      this.expandedOrderIds.add(id);
    }
    this.cdr.markForCheck();
  }

  isExpanded(order: OrderModel): boolean {
    return this.expandedOrderIds.has(order.Id);
  }

  trackByOrderId(index: number, order: OrderModel): number {
    return order.Id;
  }

  trackByWatchlist(index: number, item: WatchlistDTO): string {
    return `${item.Timeframe}-${item.Direction}-${item.Status}-${item.CreatedAt}`;
  }

  back(): void {
    window.history.back();
  }
}
