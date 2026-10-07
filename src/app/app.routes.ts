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
const loadMcbChart = () =>
  import(
    './components/market-cipher-b-chart/market-cipher-b-chart.component'
  ).then((m) => m.MarketCipherBChartComponent);

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
  // Default chart: full chart with all options and the Market Cipher B panel.
  {
    path: 'mcb-chart/:symbol/:timeframe',
    canActivate: [authGuard],
    loadComponent: loadMcbChart,
  },
  {
    path: 'mcb-chart/:symbol',
    canActivate: [authGuard],
    loadComponent: loadMcbChart,
  },
  { path: 'mcb-chart', canActivate: [authGuard], loadComponent: loadMcbChart },
  // Simple chart: boxes (and divergences for admins) only.
  {
    path: 'chart/:symbol/:timeframe',
    canActivate: [authGuard],
    loadComponent: loadChart,
  },
  { path: 'chart/:symbol', canActivate: [authGuard], loadComponent: loadChart },
  { path: 'chart', canActivate: [authGuard], loadComponent: loadChart },
  // Retired chart variants (bookmarks, push links).
  { path: 'market-cipher-b-chart', redirectTo: 'mcb-chart' },
  { path: 'web-chart', redirectTo: 'mcb-chart' },
  { path: 'tv-chart', redirectTo: 'mcb-chart' },
  { path: 'chart-v3', redirectTo: 'chart' },
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
