# Angular PWA to iOS App Store with Capacitor - Complete Setup Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Install Capacitor](#step-1-install-capacitor)
3. [Step 2: Configure Build Output](#step-2-configure-build-output)
4. [Step 3: PWA Assets & Service Worker](#step-3-pwa-assets--service-worker)
5. [Step 4: Add iOS Platform](#step-4-add-ios-platform)
6. [Step 5: Splash Screens & Icons](#step-5-splash-screens--icons)
7. [Step 6: Offline Caching](#step-6-offline-caching)
8. [Step 7: App Store Preparation](#step-7-app-store-preparation)
9. [Step 8: Terminal Commands](#step-8-terminal-commands)

---

## Prerequisites

- **macOS** with Xcode 14+
- **Node.js** 16+
- **npm** or **yarn**
- **CocoaPods** (auto-installed with Xcode)
- **Apple Developer Account**
- An existing Angular project with PWA setup

---

## Step 1: Install Capacitor

### 1.1 Install Capacitor Core and CLI

```bash
npm install -g @capacitor/cli
npm install @capacitor/core @capacitor/ios
npm install --save-dev @capacitor/cli
```

### 1.2 Initialize Capacitor

From your Angular project root:

```bash
npx cap init
```

**Prompts to answer:**
- App name: `MyTradingBox`
- Package ID: `com.mytradingbox.app` (reverse domain format)
- Directory: `www` (default - we'll update this)

---

## Step 2: Configure Build Output

### 2.1 Update `angular.json`

Capacitor expects the web build in the `www` directory. Update your build configuration:

```json
{
  "projects": {
    "MyTradingBox": {
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:browser",
          "options": {
            "outputPath": "www",
            "index": "src/index.html",
            "main": "src/main.ts",
            "polyfills": ["src/polyfills.ts"],
            "tsConfig": "tsconfig.app.json",
            "assets": [
              "src/favicon.ico",
              "src/assets",
              "src/manifest.json"
            ],
            "styles": ["src/styles.scss"],
            "scripts": []
          },
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "2mb",
                  "maximumError": "5mb"
                },
                {
                  "type": "anyComponentStyle",
                  "maximumWarning": "2kb",
                  "maximumError": "4kb"
                }
              ],
              "outputHashing": "all",
              "aot": true
            }
          }
        }
      }
    }
  }
}
```

**Key changes:**
- `outputPath`: Changed to `www` (Capacitor requirement)
- Ensure `manifest.json` is in assets

### 2.2 Create/Update `capacitor.config.ts`

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mytradingbox.app',
  appName: 'MyTradingBox',
  webDir: 'www',
  bundledWebRuntime: false,
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      androidScaleType: 'CENTER_CROP',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1a1a2e',
    },
  },
  server: {
    url: 'http://192.168.x.x:4200', // For local testing only
    cleartext: true, // Allow HTTP in dev mode
  },
};

export default config;
```

---

## Step 3: PWA Assets & Service Worker

### 3.1 Verify Manifest Configuration

Update `src/manifest.json`:

```json
{
  "name": "MyTradingBox",
  "short_name": "TradingBox",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a1a2e",
  "orientation": "portrait-primary",
  "scope": "/",
  "description": "Trading application for crypto and stocks",
  "screenshots": [
    {
      "src": "/assets/icons/screenshot-narrow.png",
      "sizes": "540x720",
      "type": "image/png",
      "form_factor": "narrow"
    },
    {
      "src": "/assets/icons/screenshot-wide.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    }
  ],
  "icons": [
    {
      "src": "/assets/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/assets/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/assets/icons/icon-512x512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

### 3.2 Update `src/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>MyTradingBox</title>
    <base href="/" />
    <meta name="color-scheme" content="light dark" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <meta name="theme-color" content="#1a1a2e" />
    <meta name="description" content="MyTradingBox - Trading Application" />
    
    <!-- PWA Manifest -->
    <link rel="manifest" href="manifest.json" />
    
    <!-- Icons -->
    <link rel="icon" type="image/png" href="assets/icons/favicon-32x32.png" sizes="32x32" />
    <link rel="icon" type="image/png" href="assets/icons/favicon-16x16.png" sizes="16x16" />
    <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png" />
    
    <!-- Capacitor plugin scripts -->
    <script src="capacitor.js"></script>
  </head>
  <body>
    <app-root></app-root>
    <!-- Service Worker Registration (if not auto) -->
    <noscript>Please enable JavaScript to run this app.</noscript>
  </body>
</html>
```

### 3.3 Update `src/main.ts` for Service Worker

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/platform-browser';
import { AppComponent } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(AppComponent, {
  ...appConfig,
  providers: [
    ...appConfig.providers,
    provideServiceWorker('ngsw-worker.js', {
      enabled: true,
      registrationStrategy: 'registerImmediately', // Important for Capacitor
    }),
  ],
});
```

---

## Step 4: Add iOS Platform

### 4.1 Add iOS Platform

```bash
npx cap add ios
```

This creates an `ios/` folder with an Xcode project.

### 4.2 Update Capacitor Plugin Configuration

Edit `capacitor.config.ts` to include iOS-specific settings:

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mytradingbox.app',
  appName: 'MyTradingBox',
  webDir: 'www',
  bundledWebRuntime: false,
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
      showSpinner: true,
      androidScaleType: 'CENTER_CROP',
      iosScaleType: 'CENTER_CROP',
      spinnerColor: '#ffffff',
    },
    
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1a1a2e',
    },
    
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
      sound: 'beep.wav',
    },
  },

  server: {
    androidScheme: 'https',
  },
  
  // iOS-specific configuration
  ios: {
    contentInsetAdjustmentBehavior: 'automatic',
  },
};

export default config;
```

### 4.3 Sync Native Project

```bash
npx cap sync ios
```

This copies the web build to the iOS project and installs native dependencies.

---

## Step 5: Splash Screens & Icons

### 5.1 Install Capacitor Assets Plugin

```bash
npm install --save-dev @capacitor/assets
npx cap-assets generate --source ./src/assets/app-icon.png --platforms ios
```

**Requirements:**
- Source icon: Minimum 512x512px (preferably 1024x1024px)
- Place in: `src/assets/app-icon.png`

### 5.2 Manual Configuration in Xcode (if needed)

**Open in Xcode:**
```bash
npx cap open ios
```

**Steps in Xcode:**
1. Select `App` target
2. Go to **General** tab
3. Under **App Icons and Launch Screen**:
   - Drag your icon assets
   - Configure launch screen

### 5.3 iOS App Icon Set

Create `ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json`:

```json
{
  "images": [
    {
      "filename": "icon-20.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "20x20"
    },
    {
      "filename": "icon-29.png",
      "idiom": "iphone",
      "scale": "1x",
      "size": "29x29"
    },
    {
      "filename": "icon-40.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "40x40"
    },
    {
      "filename": "icon-60.png",
      "idiom": "iphone",
      "scale": "2x",
      "size": "60x60"
    },
    {
      "filename": "icon-180.png",
      "idiom": "iphone",
      "scale": "3x",
      "size": "60x60"
    },
    {
      "filename": "icon-1024.png",
      "idiom": "ios-marketing",
      "scale": "1x",
      "size": "1024x1024"
    }
  ],
  "info": {
    "author": "xcode",
    "version": 1
  }
}
```

---

## Step 6: Offline Caching

### 6.1 Enable Service Worker in Angular

Update `src/app/app.config.ts`:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/platform-browser';
import { appRoutes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(appRoutes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: true,
      registrationStrategy: 'registerImmediately',
    }),
  ],
};
```

### 6.2 Create `ngsw-config.json`

```json
{
  "$schema": "./node_modules/@angular/service-worker/config/schema.json",
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app",
      "installMode": "prefetch",
      "resources": {
        "files": [
          "/favicon.ico",
          "/index.html",
          "/*.css",
          "/*.js"
        ]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/assets/**",
          "!/**/.*"
        ]
      }
    }
  ],
  "dataGroups": [
    {
      "name": "api-cache",
      "urls": [
        "/api/**"
      ],
      "cacheConfig": {
        "strategy": "performance",
        "maxAge": "24h",
        "maxSize": 100
      }
    }
  ],
  "navigationUrls": [
    "/**",
    "!/**/*.*",
    "!/**/*__*"
  ]
}
```

### 6.3 Create Service Worker Update Service

Create `src/app/helpers/sw-update.service.ts`:

```typescript
import { Injectable, inject } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { interval, filter, switchMap } from 'rxjs';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root',
})
export class SwUpdateService {
  private swUpdate = inject(SwUpdate);
  private notificationService = inject(NotificationService);

  constructor() {
    this.checkForUpdates();
  }

  private checkForUpdates(): void {
    // Check for updates every 6 hours
    interval(6 * 60 * 60 * 1000)
      .pipe(
        switchMap(() => this.swUpdate.checkForUpdate()),
        filter(() => this.swUpdate.isEnabled),
      )
      .subscribe({
        next: (updateAvailable) => {
          if (updateAvailable) {
            this.notificationService.showNotification(
              'App Update Available',
              'A new version is available. Refresh to update.'
            );
          }
        },
        error: (err) => console.error('SW update check error:', err),
      });

    // Listen for activation
    this.swUpdate.activated.subscribe(() => {
      this.notificationService.showNotification(
        'App Updated',
        'The app has been updated successfully.'
      );
    });
  }

  public forceUpdate(): void {
    this.swUpdate.activateUpdate().then(() => {
      window.location.reload();
    });
  }
}
```

### 6.4 Test Service Worker Inside Capacitor

Create `src/app/helpers/capacitor-offline.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { Network } from '@capacitor/network';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class CapacitorOfflineService {
  public isOnline$ = new BehaviorSubject<boolean>(true);

  constructor() {
    this.initNetworkListener();
  }

  private async initNetworkListener(): Promise<void> {
    const status = await Network.getStatus();
    this.isOnline$.next(status.connected);

    Network.addListener('networkStatusChange', (status) => {
      this.isOnline$.next(status.connected);
      console.log('Network status:', status.connected ? 'online' : 'offline');
    });
  }
}
```

### 6.5 Install Network Capacitor Plugin

```bash
npm install @capacitor/network
npx cap sync ios
```

---

## Step 7: App Store Preparation

### 7.1 Setup App ID and Bundle Identifier

In Xcode:
1. Open `ios/App/App.xcodeproj`
2. Select **App** target
3. Go to **General** tab
4. Set **Bundle Identifier** to `com.mytradingbox.app`
5. Set **Minimum Deployments** to iOS 13.0+
6. Set **Team ID** (your Apple Developer account)

### 7.2 Create `ios/App/App/Info.plist` Additions

Add to Xcode's Info.plist (or edit directly):

```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
  <key>NSExceptionDomains</key>
  <dict>
    <key>localhost</key>
    <dict>
      <key>NSIncludesSubdomains</key>
      <true/>
      <key>NSTemporaryExceptionAllowsInsecureHTTPLoads</key>
      <true/>
    </dict>
  </dict>
</dict>

<key>NSLocalNetworkUsageDescription</key>
<string>This app needs access to your local network for development purposes.</string>

<key>NSBonjourServices</key>
<array>
  <string>_http._tcp</string>
  <string>_https._tcp</string>
</array>

<key>NSLocationWhenInUseUsageDescription</key>
<string>MyTradingBox needs location access for market data.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>MyTradingBox needs access to your photo library.</string>
```

### 7.3 Create App Store Connect Entry

1. Log in to [App Store Connect](https://appstoreconnect.apple.com)
2. Click **My Apps** > **+** (New App)
3. Select **iOS**
4. Fill in:
   - **Name**: `MyTradingBox`
   - **Bundle ID**: `com.mytradingbox.app`
   - **SKU**: `MYTRADINGBOX001`
   - **Primary Category**: `Finance` or `Business`

### 7.4 Create Certificates and Provisioning Profiles

1. Go to **Certificates, Identifiers & Profiles** in Apple Developer
2. Create:
   - **App ID** matching your bundle ID
   - **iOS Distribution Certificate**
   - **Ad Hoc Provisioning Profile** (for testing)
   - **App Store Provisioning Profile** (for submission)
3. Download and install certificates

### 7.5 Configure Code Signing in Xcode

1. In Xcode: Select **App** target
2. Go to **Signing & Capabilities** tab
3. Check **Automatically manage signing**
4. Select your Team ID
5. Ensure provisioning profile is set for **App Store**

### 7.6 Create Entitlements File

Create `ios/App/App/App.entitlements`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.associated-domains</key>
  <array>
    <string>applinks:mytradingbox.com</string>
  </array>
  <key>com.apple.developer.networking.vpn</key>
  <array>
    <string>allow</string>
  </array>
  <key>com.apple.security.application-groups</key>
  <array>
    <string>group.com.mytradingbox.app</string>
  </array>
  <key>keychain-access-groups</key>
  <array>
    <string>$(AppIdentifierPrefix)com.mytradingbox.app</string>
  </array>
</dict>
</plist>
```

### 7.7 Create Build Configuration for App Store

Update `capacitor.config.ts` for production:

```typescript
const isProduction = process.env.NODE_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'com.mytradingbox.app',
  appName: 'MyTradingBox',
  webDir: 'www',
  bundledWebRuntime: false,
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1a2e',
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1a1a2e',
    },
  },

  server: {
    androidScheme: 'https',
    // Remove dev server in production
    ...(isProduction ? {} : { url: 'http://192.168.x.x:4200' }),
  },
};

export default config;
```

---

## Step 8: Terminal Commands

### 8.1 Development Build & Test

```bash
# Install dependencies
npm install

# Build Angular for web
npm run build

# Sync to iOS
npx cap sync ios

# Open Xcode to test on simulator
npx cap open ios

# Run on iOS simulator from CLI
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15' build
```

### 8.2 Production Build

```bash
# Production build
npm run build -- --configuration production

# Update iOS with production build
npx cap sync ios

# Build for App Store (creates .ipa)
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination generic/platform=iOS \
  -archivePath build/App.xcarchive \
  archive

# Export to App Store
xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportOptionsPlist ios/App/ExportOptions.plist \
  -exportPath build/App.ipa
```

### 8.3 Create `ios/App/ExportOptions.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>thinning</key>
  <string><none></string>
  <key>teamID</key>
  <string>YOUR_TEAM_ID</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>com.mytradingbox.app</key>
    <string>match AppStore com.mytradingbox.app</string>
  </dict>
</dict>
</plist>
```

### 8.4 Upload to App Store

```bash
# Using Transporter (recommended)
cd build/App.ipa && open .

# Or use xcrun
xcrun altool --upload-app \
  --type ios \
  --file build/App.ipa \
  --username your-apple-id@example.com \
  --password your-app-specific-password
```

### 8.5 Useful Debugging Commands

```bash
# View iOS build logs
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15' clean build -v

# Check Capacitor health
npx cap doctor

# Update plugins
npx cap update

# Print all devices
xcrun instruments -s devices

# Test on specific device
npx cap run ios --target="iPhone 15"
```

---

## Checklist for App Store Submission

- [ ] App name and description finalized
- [ ] Privacy policy URL added
- [ ] Minimum iOS version set (13.0+)
- [ ] App icons (1024x1024) provided
- [ ] Screenshots for iPhone and iPad
- [ ] Splash screen configured
- [ ] Service Worker caching verified
- [ ] Offline functionality tested
- [ ] All capabilities/permissions declared
- [ ] Build version incremented (Info.plist)
- [ ] No external links without App Store approval
- [ ] No hardcoded API endpoints (use secure backend)
- [ ] Performance optimized (< 100MB)
- [ ] Content rating completed
- [ ] Developer info and contact added
- [ ] Archive tested on real device
- [ ] ExportOptions.plist verified
- [ ] App reviewed by TestFlight (optional but recommended)

---

## Common Issues & Solutions

### Issue: Service Worker not caching inside Capacitor

**Solution**: Ensure `registrationStrategy: 'registerImmediately'` in `provideServiceWorker()`

### Issue: Blank white screen on iOS

**Solution**: Check `capacitor.config.ts` `webDir` points to correct build output

### Issue: API calls blocked by CORS

**Solution**: Configure `NSAppTransportSecurity` in Info.plist or use HTTPS endpoints

### Issue: App crashes on cold start

**Solution**: Increase `SplashScreen.launchShowDuration` to allow Service Worker initialization

### Issue: Images not loading in WebView

**Solution**: Ensure paths are absolute (`/assets/...`) not relative

---

## Performance Tips

1. **Enable Gzip compression** in Angular build
2. **Lazy load modules** to reduce initial bundle size
3. **Use image optimization** (WebP format with fallbacks)
4. **Implement virtual scrolling** for large lists
5. **Cache HTTP requests** via Service Worker with `performance` strategy
6. **Monitor memory** using Xcode Debugger


