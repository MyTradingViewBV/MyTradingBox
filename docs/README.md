# MyTradingBox Documentation

Welcome to the comprehensive documentation for MyTradingBox, a Progressive Web App for cryptocurrency trading.

## Quick Links

### Getting Started
- **[README](../README.md)** - Project overview and quick start
- **[How It Works](HOW_IT_WORKS.md)** - Application architecture and workflow
- **[User Manual](USER_MANUAL.md)** - Complete user guide

### Development
- **[Rules](RULES.md)** - Development guidelines and coding standards
- **[Deployment](DEPLOYMENT.md)** - Build, deployment, and release procedures
- **[Component Documentation](components/)** - Individual component guides

### Project Management
- **[Changelog](../CHANGELOG.md)** - Version history and release notes

## Application Overview

MyTradingBox is built with Angular and provides:
- **Real-time Charts**: Interactive cryptocurrency price visualization
- **Portfolio Management**: Account balance and P&L tracking
- **Order Management**: Buy/sell order placement and monitoring
- **Watchlist**: Favorite coin tracking with alerts
- **PWA Features**: Offline support and native app installation
- **Mobile Support**: iOS and Android apps via Capacitor

## Architecture

### Frontend
- **Framework**: Angular 17+
- **State Management**: NgRx
- **UI Components**: Angular Material
- **Charts**: Chart.js with ng2-charts
- **PWA**: Angular Service Worker

### Backend Integration
- **API Communication**: RESTful APIs for market data
- **Authentication**: Secure user authentication
- **Real-time Data**: WebSocket connections for live updates

### Mobile
- **Capacitor**: Native mobile app packaging
- **iOS Support**: Xcode project generation
- **Android Support**: Android Studio integration

## Development Environment

### Prerequisites
- Node.js 18+
- npm 9+
- Git
- VS Code (recommended)

### Setup
```bash
git clone <repository-url>
cd MyTradingBox
npm install
npm start
```

### Key Commands
- `npm start` - Development server
- `npm test` - Run unit tests
- `npm run build` - Production build
- `npm run lint` - Code linting

## Contributing

1. Review the [Rules](RULES.md) for coding standards
2. Create feature branches for new work
3. Write comprehensive tests
4. Update documentation as needed
5. Submit pull requests with clear descriptions

## Support

### Documentation Updates
- Keep component docs current with code changes
- Update user manual for new features
- Maintain accurate changelog entries

### Issue Reporting
- Use GitHub issues for bugs and features
- Include reproduction steps and environment details
- Tag appropriately (bug, enhancement, documentation)

### Community
- Check existing documentation first
- Search issues before creating new ones
- Contribute improvements via pull requests

## Version History

See [Changelog](../CHANGELOG.md) for detailed version information and release notes.

---

**Last Updated**: May 2026
**Version**: 1.0.0