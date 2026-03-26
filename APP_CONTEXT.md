# MyTradingBox App Context

## App Overview
- **Type:** Angular (standalone components, modern Angular)
- **Domain:** Trading dashboard (crypto/finance)
- **Key Features:**
  - Trading chart with overlays, indicators, drawing tools
  - Modular settings (profile, preferences, alerts, etc.)
  - Alerts system (mocked, extensible)
  - Multi-language (i18n: en, nl)
  - Responsive, glassmorphism UI

## Main Components
- `SettingsComponent` (src/app/components/settings/settings.component.ts)
  - Profile, preferences, general settings
  - Modular sections, dynamic items
  - Uses `settingsSections` array for config
  - Navigation to subpages (e.g., Alerts)
- `AlertsSettingsComponent` (src/app/components/settings/alerts-settings.component.ts)
  - Standalone, imports CommonModule, RouterModule, FormsModule
  - Mock alert toggles (trade orders, box candles, watchlist, capital flow)
  - Can be extended for real alert logic
- `ChartComponent` (src/app/components/chart/chart-component.ts)
  - Chart.js integration, overlays, toolbars, settings panel
  - Responsive, glassmorphism style
- `FooterComponent` (src/app/components/footer/footer-compenent.ts)
  - Navigation bar, 5 main routes

## Routing
- Uses Angular Router with lazy loading for most feature modules
- Example route for alerts: `/settings/alerts` (standalone component)

## Style & UI
- **Glassmorphism:**
  - Backdrop blur, semi-transparent backgrounds, gold gradients
  - Consistent use of `.glass`, `.gradient-gold`, `.gradient-red` classes
- **Responsive:**
  - Mobile and desktop layouts
  - Flex/grid for settings, toolbars
- **Icons:**
  - Inline SVGs for all settings items
- **Toggles:**
  - Custom gold slider switches (see settings and alerts)

## Coding Style
- **TypeScript:**
  - Strong typing, interfaces for config
  - Use of Angular dependency injection (`inject()`)
- **Angular:**
  - Standalone components (no NgModules)
  - Template-driven forms (ngModel)
  - Structural directives: `*ngFor`, `*ngIf`, `@for`, `@if` (Angular v17+)
- **i18n:**
  - All labels use `| translate` pipe
  - Keys in `src/assets/i18n/en.json` and `nl.json`

## Extensibility
- Add new settings: push to `settingsSections` in `SettingsComponent`
- Add new alert types: extend arrays in `AlertsSettingsComponent`
- Add new pages: create standalone component, add to router

## Usage in Prompts
- Reference this file for:
  - Component structure and naming
  - Style conventions (glassmorphism, icons, toggles)
  - How to add new settings or alerts
  - Routing and navigation patterns
  - i18n usage

---
_Last updated: 2026-03-25_
