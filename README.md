# MyTradingBox

Modern Angular application for trading dashboards, charts, orders and admin utilities. Built with Angular 20, standalone components, NgRx state, and a custom PWA setup.

## Quick Start

- Prerequisites: Node.js 18+, npm 9+, Angular CLI 20
- Install dependencies:
	```powershell
	npm install
	```
- Start dev server (watch mode):
	```powershell
	npm start
	```
- Open the app: `http://127.0.0.1:4200/`

## Project Structure

- `src/app/components/` main UI components (settings, chart, orders, watchlist, login, onboarding, admin)
- `src/app/modules/shared/` shared services, models, contracts, utils
- `src/app/store/` NgRx state for settings and app
- `src/assets/` i18n, icons, version
- `environments/` environment configs

## Key Features

- Standalone Angular components and route-based lazy loading
- NgRx for settings state with localStorage persistence (via meta-reducer)
- Settings page with toggles (Trade/Price/News alerts, Dark mode, Key Zones)
- Chart module (Bybit candles, watchlist) and Orders
- Notification log and Service Worker helpers
- New Admin module (mocked Heartbeat + Logs segments)

## Scripts

- `npm start`: runs dev server at `http://127.0.0.1:4200/`
- `npm test`: runs unit tests
- `npm run build`: builds production bundle to `dist/`

Angular CLI equivalents:
```powershell
ng serve
ng test
ng build
```

## Routing

- `/` and `/dashboard`: `SettingsComponent` (with `authGuard`)
- `/login`: `LoginComponent`
- `/orders`: lazy `OrdersComponent` (with `authGuard`)
- `/watchlist`: lazy `WatchlistComponent` (with `authGuard`)
- `/chart`: `ChartComponent` with optional `symbol` / `timeframe`
- `/balance`: `AccountBalanceComponent`
- `/admin`: `AdminComponent` (guard currently allows access; configurable)

## Admin Module (Mocked)

- Location: `src/app/components/admin/`
- Segments:
	- Heartbeat: shows mocked statuses for APIs, services, and bots. Data updates every few seconds.
	- Logs: mocked log entries with filter by level/source/message.
- Mock services:
	- `HeartbeatService`: emits statuses; `seedExtraMocks()` adds more items when Admin opens.
	- `LogsService`: emits new entries; `seedBurst()` pushes a burst when Admin opens.
- Guard:
	- `AdminGuard`: currently set to always return `true`. Can be switched to check NgRx `adminModeEnabled` later.

## Settings + NgRx

- Actions: see `src/app/store/settings/settings.actions.ts`
	- Includes `setSelectedCurrency`, `setSelectedExchange`, alert toggles, dark mode, onboarding, and `setAdminModeEnabled`.
- State: `src/app/store/settings/settings.reducer.ts`
	- Holds currency, exchange, symbol, toggles, onboarding, and `adminModeEnabled`.
- Service: `src/app/modules/shared/services/services/settingsService.ts`
	- Exposes selectors like `getAdminModeEnabled()`, `getSelectedExchange()`, etc.
- UI integration: `SettingsComponent`
	- Reads toggles from store, dispatches via `this._settingsService.dispatchAppAction(SettingsActions.xyz)`.

## Development Notes

- Notifications & SW:
	- Debug panel in Settings shows secure context, SW registration, and permission state.
	- Buttons to test notifications and register service workers.
- Key Zones:
	- Master toggle and per-timeframe toggles are available in Settings.
	- Settings are managed by `KeyZoneSettingsService`.
- Onboarding:
	- Overlay steps live in `src/app/components/onboarding/`.
	- Reset with `localStorage.removeItem('onboardingDone')`.

## Build & Deploy

- Production build:
	```powershell
	npm run build
	```
	Outputs to `dist/mytradingbox/browser`.

- Deploy to GitHub Pages (example):
	```powershell
	npx angular-cli-ghpages --dir=dist/mytradingbox/browser
	```

## API References (WIP / Mock)

- Swagger: `https://botapi-f3fkahc9eadkfveh.swedencentral-01.azurewebsites.net/swagger/index.html`
- Symbols: `https://botapi-f3fkahc9eadkfveh.swedencentral-01.azurewebsites.net/Symbols`
- Candles (Bybit): `https://botapi-f3fkahc9eadkfveh.swedencentral-01.azurewebsites.net/Candles/bybit?symbol=BTCUSDT&timeframe=1h&limit=100`

Notes:
- Boxes only fetched from 1D chart; show only where `Type = "Range"`.

## Troubleshooting

- Dev server shows Sass mixed declarations warning:
	- Consider wrapping mixed declarations in `& {}` (see Sass docs).
- If routes don’t open, ensure guard configuration matches your intent (Admin currently allows all).
- If state doesn’t persist, verify NgRx localStorage meta-reducer is enabled for `settingsState`.

## License

Proprietary — MyTradingViewBV. All rights reserved.

## Contributing

- Branch from `start-info-stepper` (or the relevant feature branch).
- Keep changes focused and consistent with existing style.
- Run formatting and tests locally before PR:
	```powershell
	npm run lint ; npm test
	```
- Prefer standalone components and NgRx actions/selectors for new state.
- Avoid adding unrelated dependencies unless necessary.

## CI / Quality (optional)

- Lint: configure `eslint.config.js` to cover TypeScript and Angular rules.
- Formatting: align with project’s Prettier/Sass conventions.
- Build check: ensure `npm run build` passes without warnings.
- If desired, add GitHub Actions workflow to run `npm ci`, `npm run lint`, `npm test`, and `npm run build` on PRs.