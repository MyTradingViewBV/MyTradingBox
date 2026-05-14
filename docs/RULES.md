# MyTradingBox Rules and Guidelines

## Application Rules

### User Interface Rules
- All components must follow Angular Material design principles
- Charts must use Chart.js with ng2-charts integration
- Responsive design required for all screen sizes
- Dark theme support mandatory

### State Management Rules
- All application state must use NgRx store
- Actions must follow the pattern: `[Feature] Action Description`
- Effects must handle side effects (API calls, etc.)
- Selectors must be pure functions

### Component Rules
- Components must be standalone where possible
- Use OnPush change detection strategy
- Implement proper lifecycle management
- Handle subscriptions with takeUntil pattern

### Service Rules
- Services must be injectable
- API calls must handle errors gracefully
- Use RxJS operators for data transformation
- Implement retry logic for failed requests

### Security Rules
- Admin routes must use AdminGuard
- Sensitive data must be encrypted using Encryptor service
- API keys must be stored securely
- Input validation required for all forms

### Performance Rules
- Lazy loading required for feature modules
- Bundle size must be optimized
- Images must be properly sized
- Service worker must cache critical resources

### Testing Rules
- Unit tests required for all services and components
- Test coverage minimum 80%
- E2E tests for critical user flows
- Mock data for external API dependencies

### Code Quality Rules
- ESLint must pass without errors
- TypeScript strict mode enabled
- No console.log in production code
- Proper error handling throughout

### Deployment Rules
- Production builds must pass all tests
- Bundle analyzer must show optimized sizes
- PWA audit must pass Lighthouse checks
- Mobile builds must work on target platforms

### Maintenance Rules
- Dependencies must be kept up to date
- Security vulnerabilities must be addressed immediately
- Documentation must be updated with code changes
- Breaking changes require migration guides