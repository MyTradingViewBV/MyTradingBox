import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './modules/shared/auth/guards/auth.guard';
import { loginGuard } from './modules/shared/auth/guards/login.guard';
import { ChartComponent } from './components/chart/chart-component';
import { SettingsComponent } from './components/settings/settings.component';
import { AccountBalanceComponent } from './components/account-balance/account-balance.component';
import { AdminComponent } from './components/admin/admin.component';
import { AdminGuard } from './components/admin/admin.guard';
import { ContactComponent } from './components/contact/contact.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    component: SettingsComponent,
  },
  { path: 'login', canActivate: [loginGuard], component: LoginComponent },
  { path: 'dashboard', canActivate: [authGuard], component: SettingsComponent },
  {
    path: 'orders',
    loadComponent: () =>
      import('./components/orders/orders').then((m) => m.OrdersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'watchlist',
    loadComponent: () =>
      import('./components/watchlist/watchlist').then(
        (m) => m.WatchlistComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'watchlist/add',
    loadComponent: () =>
      import('./components/watchlist/add-symbol/add-symbol.component').then(
        (m) => m.AddSymbolComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'coin/:symbol',
    loadComponent: () =>
      import('./components/coin-info/coin-info').then(
        (m) => m.CoinInfoComponent,
      ),
    canActivate: [authGuard],
  },
  // { path: 'chartTest/:symbol/:timeframe', component: ChartTestComponent },
  // { path: 'chartTest/:symbol', component: ChartTestComponent }, // ?? chart with symbol
  { path: 'chart/:symbol/:timeframe', canActivate: [authGuard], component: ChartComponent },
  { path: 'chart/:symbol', canActivate: [authGuard], component: ChartComponent },
  { path: 'chart', canActivate: [authGuard], component: ChartComponent }, // fallback simple chart
  { path: 'balance', canActivate: [authGuard], component: AccountBalanceComponent },
  { path: 'admin', canActivate: [AdminGuard], component: AdminComponent },
  { path: 'contact', canActivate: [authGuard], component: ContactComponent },
];
