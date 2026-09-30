import { Routes } from '@angular/router';
import { authGuard } from './modules/shared/auth/guards/auth.guard';
import { loginGuard } from './modules/shared/auth/guards/login.guard';
import { adminGuard } from './modules/shared/auth/guards/admin.guard';

// All feature routes are lazy-loaded so the initial bundle only contains the shell.
const loadSettings = () =>
  import('./components/settings/settings.component').then(
    (m) => m.SettingsComponent,
  );
const loadChart = () =>
  import('./components/chart/chart-component').then((m) => m.ChartComponent);

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    canActivate: [authGuard],
    loadComponent: loadSettings,
  },
  {
    path: 'login',
    canActivate: [loginGuard],
    loadComponent: () =>
      import('./components/login/login.component').then(
        (m) => m.LoginComponent,
      ),
  },
  { path: 'dashboard', canActivate: [authGuard], loadComponent: loadSettings },
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
  { path: 'settings', canActivate: [authGuard], loadComponent: loadSettings },
  // { path: 'chartTest/:symbol/:timeframe', component: ChartTestComponent },
  // { path: 'chartTest/:symbol', component: ChartTestComponent }, // ?? chart with symbol
  {
    path: 'chart/:symbol/:timeframe',
    canActivate: [authGuard],
    loadComponent: loadChart,
  },
  { path: 'chart/:symbol', canActivate: [authGuard], loadComponent: loadChart },
  { path: 'chart', canActivate: [authGuard], loadComponent: loadChart }, // fallback simple chart
  {
    path: 'web-chart',
    loadComponent: () =>
      import('./components/web-chart/web-chart.component').then(
        (m) => m.WebChartComponent,
      ),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'chart-v3',
    loadComponent: () =>
      import('./components/chart-v3/chart-v3.component').then(
        (m) => m.ChartV3Component,
      ),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'market-cipher-b-chart',
    loadComponent: () =>
      import('./components/market-cipher-b-chart/market-cipher-b-chart.component').then(
        (m) => m.MarketCipherBChartComponent,
      ),
    canActivate: [authGuard, adminGuard],
  },
  {
    path: 'tv-chart',
    loadComponent: () =>
      import('./components/tv-chart/tv-chart.component').then(
        (m) => m.TvChartComponent,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'balance',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/account-balance/account-balance.component').then(
        (m) => m.AccountBalanceComponent,
      ),
  },
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./components/admin/admin.component').then(
        (m) => m.AdminComponent,
      ),
  },
  {
    path: 'contact',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/contact/contact.component').then(
        (m) => m.ContactComponent,
      ),
  },
];
