# How MyTradingBox Works

## Overview

MyTradingBox is a Progressive Web App (PWA) built with Angular that provides cryptocurrency trading functionality. The app is designed to work both as a web application and as a native mobile app through Capacitor.

## Core Architecture

### Frontend Framework
- **Angular**: Main framework for building the user interface
- **NgRx**: State management for application data
- **Angular Material**: UI components (implied from structure)

### Key Features
- **Real-time Charts**: Cryptocurrency price visualization using Chart.js
- **Portfolio Management**: Account balance tracking
- **Order Management**: Buy/sell order placement and tracking
- **Watchlist**: Favorite cryptocurrencies monitoring
- **Admin Panel**: Administrative functions (protected by guard)
- **Push Notifications**: Real-time alerts
- **Offline Support**: PWA capabilities for offline functionality

### PWA Capabilities
- **Service Worker**: Caching and offline support via ngsw-config.json
- **Web App Manifest**: Installation as native app
- **Background Sync**: Data synchronization when online

### Mobile Support
- **Capacitor**: Cross-platform native runtime
- **iOS Support**: Native iOS app packaging
- **Push Notifications**: Native mobile notifications

## Data Flow

1. **User Authentication**: Login component handles user authentication
2. **Data Fetching**: Services retrieve cryptocurrency data from APIs
3. **State Management**: NgRx store manages application state
4. **UI Updates**: Components subscribe to state changes and update views
5. **Offline Storage**: Service worker caches data for offline use

## Component Structure

- **Header/Footer**: Navigation and branding
- **Chart Component**: Price visualization and trading interface
- **Orders Component**: Order history and management
- **Watchlist Component**: Favorite coins tracking
- **Account Balance**: Portfolio overview
- **Settings**: User preferences and configuration

## Security Features

- **Admin Guard**: Protects administrative routes
- **Data Encryption**: Encryptor service for sensitive data
- **Key Zone Settings**: Secure key management

## Deployment

- **Web**: Standard Angular build process
- **Mobile**: Capacitor build for iOS/Android
- **PWA**: Automatic installation prompts

## Development Workflow

1. **Development**: `npm start` for local development
2. **Testing**: `npm test` for unit tests
3. **Building**: `npm run build` for production builds
4. **Mobile Build**: Capacitor sync and build process