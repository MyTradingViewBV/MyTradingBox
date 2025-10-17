import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './modules/shared/auth/guards/auth.guard';
import { DashboardComponent } from './components/dashboard/dashboard.component';
// import { BitcoinCandleChartComponent } from './components/bitcoin-candle-chart-component/bitcoin-candle-chart-component';
import { ChartTestComponent } from './components/chart-test-component/chart-test-component';
import { ChartSimpleComponent } from './components/chart-simple-component/chart-test-component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    component: DashboardComponent,
  },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  // { path: 'bitcoin2', component: BitcoinCandleChartComponent },
  {
    path: 'orders',
    loadComponent: () =>
      import('./components/orders/orders').then((m) => m.OrdersComponent),
  },
  {
    path: 'watchlist',
    loadComponent: () =>
      import('./components/watchlist/watchlist').then(
        (m) => m.WatchlistComponent,
      ),
  },
  { path: 'chartTest', component: ChartTestComponent }, // 👈 default chart
  { path: 'chartTest/:symbol/:timeframe', component: ChartTestComponent },
  { path: 'chartTest/:symbol', component: ChartTestComponent }, // 👈 chart with symbol
  { path: 'chartSimple', component: ChartSimpleComponent }, // 👈 simple chart
];
