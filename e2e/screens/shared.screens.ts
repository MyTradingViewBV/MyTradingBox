export const AUTH_FILE = 'e2e/.auth/user.json';

/** Routes to capture. `auth: false` routes are captured in a fresh, logged-out context. */
export const ROUTES: { path: string; auth: boolean; slow?: boolean }[] = [
  { path: '', auth: true },
  { path: 'dashboard', auth: true },
  { path: 'settings', auth: true },
  { path: 'orders', auth: true },
  { path: 'watchlist', auth: true },
  { path: 'watchlist/add', auth: true },
  { path: 'coin/BTCUSDT', auth: true },
  { path: 'settings/alerts', auth: true },
  { path: 'settings/alerts/BTCUSDT', auth: true },
  { path: 'settings/release-notes', auth: true },
  { path: 'balance', auth: true },
  { path: 'admin', auth: true },
  { path: 'contact', auth: true },
  { path: 'mcb-chart/BTCUSDT/12m', auth: true, slow: true },
  { path: 'chart/BTCUSDT', auth: true, slow: true },
  { path: 'login', auth: false },
];

export const VIEWPORTS = {
  mobile: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  desktop: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
} as const;

export const THEMES = ['dark', 'light'] as const;

export function slug(path: string): string {
  return path === '' ? 'home' : path.replace(/\//g, '-');
}
