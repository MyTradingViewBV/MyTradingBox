import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MarketService } from '../../modules/shared/http/market.service';
import {
  OrderModel,
  TradePlanModel,
} from '../../modules/shared/models/TradeOrders.dto';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';

@Component({
  selector: 'app-orders',
  imports: [
    MatCardModule,
    MatButtonModule,
    CommonModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './orders.html',
  styleUrl: './orders.scss',
})
export class OrdersComponent implements OnInit {
  orders: OrderModel[] = [];
  filteredOrders: OrderModel[] = [];
  selectedStatus = '';
  fullResult: TradePlanModel = new TradePlanModel();
  loading = false;

  constructor(
    private _marketService: MarketService,
    private _snackbar: MatSnackBar,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loading = true;
    this._marketService.getTradeOrders().subscribe((data) => {
      this.orders = data.Orders;
      this.fullResult = data;
      this.filteredOrders = [...this.orders];
      this.loading = false;
      console.log('Orders fetched:', this.orders);
    });
  }

  goToChart(symbol: string): void {
    this.router.navigate(['/chartTest', symbol, '4h']); // 👈 send both
  }

  filterOrders(): void {
    if (!this.selectedStatus) {
      this.filteredOrders = [...this.orders]; // show all
    } else {
      this.filteredOrders = this.orders.filter(
        (o) => o.Status === this.selectedStatus,
      );
    }
  }

  getStatusColor(status: string): string {
    return status === 'NEW' ? 'primary' : status === 'DONE' ? 'accent' : '';
  }

  deleteOrder(orderId: number): void {
    this._marketService.deleteOrder(orderId).subscribe(() => {
      this.orders = this.orders.filter((order) => order.Id !== orderId);
      console.log(`Order with ID ${orderId} deleted.`);
    });
  }

  refresh(): void {
    this.loading = true;
    this._marketService.getTradeOrders().subscribe((data) => {
      this.orders = data.Orders;
      this.fullResult = data;
      this.filteredOrders = [...this.orders];
      console.log('Orders refreshed:', this.orders);
      this.loading = false;
      this._snackbar.open('Orders refreshed', 'Close', { duration: 2000 });
    });
  }

  back(): void {
    window.history.back();
  }
}
