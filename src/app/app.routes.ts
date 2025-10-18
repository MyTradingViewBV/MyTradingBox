import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './modules/shared/auth/guards/auth.guard';
import { ChartComponent } from './components/chart/chart-component';
import { SettingsComponent } from './components/settings/settings.component';
import { AccountBalanceComponent } from './components/account-balance/account-balance.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    component: SettingsComponent,
  },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: SettingsComponent },
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
  // { path: 'chartTest/:symbol/:timeframe', component: ChartTestComponent },
  // { path: 'chartTest/:symbol', component: ChartTestComponent }, // ?? chart with symbol
  { path: 'chart/:symbol/:timeframe', component: ChartComponent },
  { path: 'chart/:symbol', component: ChartComponent },
  { path: 'chart', component: ChartComponent }, // fallback simple chart
  { path: 'balance', component: AccountBalanceComponent },
];
