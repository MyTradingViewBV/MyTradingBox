# MyTradingBox

Lightweight runbook for developing and maintaining MyTradingBox (updated Feb 2026).

## Documentation

- **[How It Works](docs/HOW_IT_WORKS.md)** - Application architecture and workflow
- **[User Manual](docs/USER_MANUAL.md)** - User guide and features
- **[Rules](docs/RULES.md)** - Development and application rules
- **[Deployment](docs/DEPLOYMENT.md)** - Deployment and release procedures
- **[Changelog](CHANGELOG.md)** - Version history and changes
- **[Component Documentation](docs/components/)** - Individual component docs

## Quick Start

### Prerequisites
- Node.js 18+, npm 9+.

### Installation
```powershell
npm install
```

### Development
```powershell
npm start
```
Open: http://127.0.0.1:4200/

### Production Build
```powershell
npm run build -- --configuration production
```

## Development Commands

- Install: `npm install`
- Prune unused and reinstall: `npm prune && npm install`
- Run tests: `npm test`
- Lint & fix: `npm run lint`
- Build production: `npm run build`

## Maintenance

### Dependency Management
- Check unused deps: `npx depcheck --json`
- Check outdated packages: `npm outdated --json`
- Security audit: `npm audit` then `npm audit fix`

### Project Structure
- `src/app/components/` — UI components (chart, orders, watchlist, admin, etc.)
- `src/app/modules/shared/` — shared services and utilities
- `src/app/store/` — NgRx state management
- `docs/` — Documentation files
- `capacitor.config.ts` — Mobile app configuration

## Contributing

See [Rules](docs/RULES.md) for development guidelines and coding standards.