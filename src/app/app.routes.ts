import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { authGuard } from './modules/shared/auth/guards/auth.guard';
import { loginGuard } from './modules/shared/auth/guards/login.guard';
import { adminGuard } from './modules/shared/auth/guards/admin.guard';
import { ChartComponent } from './components/chart/chart-component';
import { SettingsComponent } from './components/settings/settings.component';
import { AccountBalanceComponent } from './components/account-balance/account-balance.component';
import { AdminComponent } from './components/admin/admin.component';
import { ContactComponent } from './components/contact/contact.component';
import { AlertsSettingsComponent } from './components/settings/alerts-settings.component';

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
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'watchlist/add',
    loadComponent: () =>
      import('./components/watchlist/add-symbol/add-symbol.component').then(
        (m) => m.AddSymbolComponent,
      ),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'coin/:symbol',
    loadComponent: () =>
      import('./components/coin-info/coin-info').then(
        (m) => m.CoinInfoComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'settings/alerts/:symbol',
    loadComponent: () =>
      import('./components/settings/alerts-settings.component').then(
        (m) => m.AlertsSettingsComponent,
      ),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'settings/alerts',
    loadComponent: () =>
      import('./components/settings/alerts-settings.component').then(
        (m) => m.AlertsSettingsComponent,
      ),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'settings/release-notes',
    loadComponent: () =>
      import('./components/settings/release-notes.component').then(
        (m) => m.ReleaseNotesComponent,
      ),
    canActivate: [authGuard],
  },
  { path: 'settings', canActivate: [authGuard], component: SettingsComponent },
  // { path: 'chartTest/:symbol/:timeframe', component: ChartTestComponent },
  // { path: 'chartTest/:symbol', component: ChartTestComponent }, // ?? chart with symbol
  { path: 'chart/:symbol/:timeframe', canActivate: [authGuard], component: ChartComponent },
  { path: 'chart/:symbol', canActivate: [authGuard], component: ChartComponent },
  { path: 'chart', canActivate: [authGuard], component: ChartComponent }, // fallback simple chart
  {
    path: 'web-chart',
    loadComponent: () =>
      import('./components/web-chart/web-chart.component').then(
        (m) => m.WebChartComponent,
      ),
    canActivate: [authGuard, adminGuard],
  },
  { path: 'balance', canActivate: [authGuard], component: AccountBalanceComponent },
  { path: 'admin', canActivate: [authGuard, adminGuard], component: AdminComponent },
  { path: 'contact', canActivate: [authGuard], component: ContactComponent },
];
