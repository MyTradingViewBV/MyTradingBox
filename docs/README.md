# MyTradingBox

Lightweight runbook for developing and maintaining MyTradingBox (updated Feb 2026).

Quick start
-----------

- Prerequisites: Node.js 18+, npm 9+.
- Install dependencies:

```powershell
npm install
```

- Start dev server:

```powershell
npm start
```

- Open: http://127.0.0.1:4200/

Notes about dependencies
------------------------

- Chart-related packages must remain (chart.js, chartjs plugins, ng2-charts).
- PWA and NgRx packages are used and kept.
- I removed legacy packages you approved earlier (`moment`, `uuid`).

Useful developer commands
------------------------

- Install: `npm install`
- Prune unused and reinstall: `npm prune && npm install`
- Run tests: `npm test`
- Lint & fix: `npm run lint`
- Build production: `npm run build`

Maintenance notes
-----------------

- To check unused deps: `npx depcheck --json` (may show false positives for config files).
- To see outdated packages: `npm outdated --json`.
- Address vulnerabilities: `npm audit` then `npm audit fix`.

Project structure (short)
-------------------------

- `src/app/components/` â€” UI components (chart, orders, watchlist, admin, etc.)
- `src/app/modules/shared/` â€” shared services and utils
- `src/app/store/` â€” NgRx state

If you want, I can also add a short CONTRIBUTING section or CI workflow next.
