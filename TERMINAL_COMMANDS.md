# MyTradingBox - Capacitor iOS Setup - Terminal Commands Reference

## Prerequisites Installation

```bash
# Install Capacitor CLI globally
npm install -g @capacitor/cli

# Install Capacitor packages
npm install @capacitor/core @capacitor/ios --save-exact

# Install Capacitor CLI locally
npm install --save-dev @capacitor/cli --save-exact

# Install Network plugin for offline detection
npm install @capacitor/network

# Install other useful Capacitor plugins
npm install @capacitor/storage @capacitor/preferences @capacitor/toast
```

---

## Initial Setup (One-time)

```bash
# Initialize Capacitor (interactive - fills capacitor.config.ts)
npx cap init

# Add iOS platform to project
npx cap add ios

# Sync to iOS and install dependencies
npx cap sync ios
```

---

## Development Workflow

### Building and Syncing

```bash
# Development build
npm run build

# Production build
npm run build -- --configuration production

# Sync web build to iOS
npx cap sync ios

# Full sync (copies code + plugins)
npx cap sync

# Copy web assets only
npx cap copy ios

# Update native dependencies
npx cap update ios
```

### Testing

```bash
# Open Xcode for development/debugging
npx cap open ios

# Build for iOS simulator
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build

# Build for device
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS' \
  build

# Run tests
npm run test
```

### Debugging

```bash
# Check Capacitor health and configuration
npx cap doctor

# View project configuration
npx cap doctor --fix

# List available iOS devices
xcrun instruments -s devices

# View Xcode build logs
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -verbose
```

---

## Production Build for App Store

### Step 1: Prepare Production Build

```bash
# Production build
npm run build -- --configuration production

# Sync to iOS
npx cap sync ios
```

### Step 2: Build Archive

```bash
# Create archive for iOS
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination generic/platform=iOS \
  -archivePath build/MyTradingBox.xcarchive \
  archive
```

### Step 3: Export for App Store

```bash
# Export archive to .ipa file
xcodebuild -exportArchive \
  -archivePath build/MyTradingBox.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/ipa

# Or use Xcode (GUI) for more control
open -a Xcode ios/App/App.xcodeproj
```

### Step 4: Upload to App Store

**Option A: Using Transporter (GUI)**
```bash
# Open Transporter app and drag .ipa file
# Or download from: https://apps.apple.com/us/app/transporter/id1450874784

cd build/ipa && open .
```

**Option B: Using altool (CLI)**
```bash
# Create app-specific password from Apple ID account
# https://appleid.apple.com → Security → App Specific Passwords

xcrun altool --upload-app \
  --type ios \
  --file build/ipa/MyTradingBox.ipa \
  --username your-apple-id@example.com \
  --password your-app-specific-password \
  --bundle-id com.mytradingbox.app
```

**Option C: Using xcrun (modern approach)**
```bash
xcrun notarytool submit build/ipa/MyTradingBox.ipa \
  --apple-id your-apple-id@example.com \
  --password your-app-specific-password \
  --team-id YOUR_TEAM_ID
```

---

## Configuration Updates

### Update Angular Output Path

```bash
# In angular.json, change build outputPath to "www"
# Verify with:
grep -A 5 '"outputPath"' angular.json
```

### Update capacitor.config.ts

```bash
# Check current configuration
cat capacitor.config.ts

# Regenerate if corrupted
rm capacitor.config.ts
npx cap init
```

### Update Service Worker Configuration

```bash
# Build includes Service Worker if configured
npm run build -- --configuration production

# Verify ngsw-worker.js was generated
ls -la www/ngsw-worker.js
```

---

## Troubleshooting Commands

### Clean Build

```bash
# Remove build artifacts
rm -rf www
rm -rf build
rm -rf ios/App/build

# Reinstall dependencies
rm -rf node_modules
rm package-lock.json
npm install

# Rebuild from scratch
npm run build -- --configuration production
npx cap sync ios
```

### Fix iOS Build Issues

```bash
# Clean Xcode build cache
xcodebuild -project ios/App/App.xcodeproj -scheme App clean

# Clear derived data
rm -rf ~/Library/Developer/Xcode/DerivedData/*

# Update CocoaPods
sudo gem install cocoapods
cd ios/App && pod repo update && pod install && cd ../../
```

### Check Pod Dependencies

```bash
cd ios/App
pod install --repo-update
cd ../../
```

### View iOS Build Warnings/Errors

```bash
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  clean build 2>&1 | tee build.log

# View log
cat build.log | grep -E 'error:|warning:'
```

---

## Local Development Testing

### Development Server with Capacitor

```bash
# Start development server
npm start

# In capacitor.config.ts, set server URL to your machine IP:
# server: { url: 'http://192.168.1.100:4200' }

# Sync with dev server
npx cap sync ios

# Open in Xcode
npx cap open ios

# Build and run on simulator (will load from dev server)
```

### Test Service Worker Locally

```bash
# Build production version
npm run build -- --configuration production

# Start local server to test SW
npx http-server -c-1 -p 8080 -o www

# Open http://localhost:8080
# Check DevTools > Application > Service Workers
```

### Test Offline Functionality

```bash
# Build production
npm run build -- --configuration production

# Start http-server
npx http-server -c-1 -p 8080 www

# Open browser and check Service Worker
# Go to offline mode in DevTools Network tab
# Verify app still works
```

---

## Continuous Integration Commands

### GitHub Actions / CI Pipeline

```bash
# Full CI build
set -e

# Install dependencies
npm ci

# Lint (if configured)
npm run lint

# Run tests
npm run test -- --watch=false --browsers=ChromeHeadless

# Build production
npm run build -- --configuration production

# Capacitor sync
npx cap sync ios

# Verify iOS project
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath build/MyTradingBox.xcarchive \
  archive

echo "✓ Build successful - Ready for submission"
```

---

## Plugin Installation Commands

### Additional Capacitor Plugins

```bash
# Offline/Storage
npm install @capacitor/storage
npm install @capacitor/preferences

# Push Notifications
npm install @capacitor/push-notifications

# Splash Screen & Status Bar
npm install @capacitor/splash-screen
npm install @capacitor/status-bar

# App Information
npm install @capacitor/app

# File handling
npm install @capacitor/filesystem

# Native dialogs
npm install @capacitor/dialog

# Toast notifications
npm install @capacitor/toast

# Sync all plugins to iOS
npx cap sync ios
```

---

## Environment Variables

### For Development

```bash
# Set development environment
export NODE_ENV=development
export CAPACITOR_ENV=development

npm start
npx cap sync ios
```

### For Production

```bash
# Set production environment
export NODE_ENV=production
export CAPACITOR_ENV=production

npm run build -- --configuration production
npx cap sync ios
```

---

## Package.json Scripts (Add These)

```json
{
  "scripts": {
    "ng": "ng",
    "start": "ng serve",
    "build": "ng build",
    "build:prod": "ng build --configuration production",
    "build:capacitor": "npm run build:prod && npx cap sync ios",
    "test": "ng test",
    "test:ci": "ng test --watch=false --browsers=ChromeHeadless",
    "lint": "ng lint",
    "ios:open": "npx cap open ios",
    "ios:sync": "npx cap sync ios",
    "ios:build": "xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination 'platform=iOS Simulator,name=iPhone 15' build",
    "ios:archive": "xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination generic/platform=iOS -archivePath build/MyTradingBox.xcarchive archive",
    "ios:export": "xcodebuild -exportArchive -archivePath build/MyTradingBox.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/ipa",
    "clean": "rm -rf www build && npm run build:prod",
    "doctor": "npx cap doctor"
  }
}
```

### Then run commands like:

```bash
npm run build:capacitor
npm run ios:open
npm run ios:build
npm run ios:archive
npm run ios:export
```

---

## Notes

- **Team ID**: Get from https://developer.apple.com → Certificates, IDs & Profiles
- **Bundle ID**: Must match your App ID (e.g., com.mytradingbox.app)
- **Provisioning Profile**: Download from Apple Developer and select in Xcode
- **App-Specific Password**: Create at https://appleid.apple.com for app submissions
- **Certificate**: Export from Keychain Access if needed for CI/CD
