# Changelog

All notable changes to MyTradingBox will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Chart: "Return to live" button, shown when the view is detached from the latest candle
- Chart: realtime follow settings (`liveFollowThresholdBars`, global `setAllChartsLiveFollow` command)
- Chart: pointer-anchored zoom everywhere (wheel, trackpad pinch, two-finger pinch with moving centroid, time-axis and price-axis drag)
- Chart interaction and coordinate system documentation (`docs/components/CHART_INTERACTIONS.md`, `docs/COORDINATE_SYSTEM.md`)
- Initial documentation setup
- User manual
- Application rules and guidelines
- How it works documentation

### Changed
- Updated README with better structure
- Chart: double click / double tap on the price axis fits the price with margins (Y AUTO); on the time axis it resets the bar spacing (right offset restored when following, center kept when detached); on the plot it only toggles fullscreen
- Chart: one synchronized crosshair across panes (labels only in the pane under the pointer, hidden while zooming)
- Chart: realtime follow shifts the view by exactly the new bars while following and never moves a detached view
- Architecture: a single `TimeScale` (logical index, bar spacing, right offset) is the authority for the time axis of all panes; one interaction state machine (pan, zoom-x, zoom-y, pinch, MCB value-scale claim) replaces the per-handler zoom/pan code; legacy `ChartViewport`/`indexToX`/`priceToY`/`buildViewport` APIs removed

### Removed
- Chart: double click jumping to the latest candle (use "Return to live"); plot double click Y auto-fit

### Fixed
- Various bug fixes from previous versions
- Chart: pan speed matches the pointer (pan computed from the drag start state, also continues outside the window)

## [1.0.0] - 2024-01-01

### Added
- Initial release of MyTradingBox
- Core trading functionality
- Chart visualization with Chart.js
- Portfolio management
- Watchlist feature
- PWA capabilities
- iOS support via Capacitor

### Features
- Real-time cryptocurrency tracking
- Buy/sell order placement
- Account balance management
- Push notifications
- Offline support
- Admin panel

## [0.9.0] - 2023-12-01

### Added
- Beta release features
- Basic trading interface
- User authentication
- Core components structure

### Changed
- Improved UI/UX design
- Enhanced performance

### Fixed
- Initial bug fixes and optimizations