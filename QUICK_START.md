# MyTradingBox - iOS Setup Quick Start Guide

## 5-Minute Setup Summary

### Step 1: Install Capacitor (5 minutes)

```bash
# Install globally and locally
npm install -g @capacitor/cli
npm install @capacitor/core @capacitor/ios --save-exact
npm install --save-dev @capacitor/cli --save-exact

# Install additional plugins
npm install @capacitor/network
```

### Step 2: Build Angular (2 minutes)

```bash
npm run build -- --configuration production
```

### Step 3: Initialize iOS Project (3 minutes)

```bash
# Add iOS platform
npx cap add ios

# Sync to iOS
npx cap sync ios
```

### Step 4: Open in Xcode (1 minute)

```bash
npx cap open ios
```

---

## Xcode Configuration (10 minutes)

### In Xcode:

1. **Select "App" target**
   - Click on "App" in left sidebar
   - Select target "App"

2. **Signing & Capabilities tab**
   - Check "Automatically manage signing"
   - Select your Team ID from dropdown
   - Bundle Identifier: `com.mytradingbox.app`
   - Minimum iOS: `13.0`

3. **General tab**
   - Verify app name: "MyTradingBox"
   - Verify bundle ID: `com.mytradingbox.app`
   - Set version: `1.0.0`
   - Set build number: `1`

4. **App Icons and Launch Screen**
   - Add your app icon (1024x1024 PNG)
   - Set launch screen

---

## Test on Simulator (5 minutes)

```bash
# Build for simulator
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 15' \
  build

# Or use Xcode: Product → Run (⌘R)
```

---

## Files Created for Your Project

### Configuration Files
- `capacitor.config.ts` - Capacitor settings
- `ngsw-config.json` - Service Worker caching configuration
- `ExportOptions.plist` - App Store export settings
- `App.entitlements` - App capabilities/entitlements
- `iOS_Info.plist_additions.xml` - Info.plist additions

### Service Files
- `src/app/helpers/sw-update.service.ts` - Service Worker updates
- `src/app/helpers/capacitor-offline.service.ts` - Offline detection

### Updated Files
- `src/index.html` - Updated for Capacitor
- `src/manifest.json` - Updated PWA manifest
- `src/app/app.config.ts` - Added Service Worker provider

### Documentation Files
- `CAPACITOR_IOS_SETUP.md` - Complete setup guide (comprehensive)
- `TERMINAL_COMMANDS.md` - All terminal commands reference
- `APP_STORE_SUBMISSION_CHECKLIST.md` - App Store submission steps
- `capacitor-setup.sh` - Automated setup script

---

## Troubleshooting

### Blank White Screen
**Solution:** Check that `outputPath` in angular.json is set to `"www"`

```bash
grep -A 3 '"outputPath"' angular.json
# Should show: "outputPath": "www",
```

### Module Not Found
**Solution:** Sync again and reinstall dependencies

```bash
npx cap sync ios --clean
cd ios/App && pod install
cd ../../
```

### Service Worker Not Caching
**Solution:** Ensure production build:

```bash
npm run build -- --configuration production
npx cap sync ios
```

### API Calls Blocked
**Solution:** Update Info.plist to allow your API domain or use HTTPS

---

## Development Workflow

### 1. Make Code Changes
```bash
npm run build
npx cap sync ios
npx cap open ios
```

### 2. Test Changes
- Run on simulator with Xcode
- Test offline functionality
- Check console for errors

### 3. Repeat
Modify code → Build → Sync → Test

---

## Before App Store Submission

### Checklist
- [ ] Build production version: `npm run build -- --configuration production`
- [ ] Test on physical device (not just simulator)
- [ ] Test offline functionality
- [ ] Version number updated in Xcode
- [ ] App icon added (1024x1024)
- [ ] Privacy policy link configured
- [ ] ExportOptions.plist updated with your Team ID
- [ ] Create app in App Store Connect
- [ ] Screenshots captured (3-10 per device type)

### Key Commands
```bash
# Production build
npm run build -- --configuration production

# Sync to iOS
npx cap sync ios

# Create archive
xcodebuild -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination generic/platform=iOS \
  -archivePath build/MyTradingBox.xcarchive \
  archive

# Export for App Store
xcodebuild -exportArchive \
  -archivePath build/MyTradingBox.xcarchive \
  -exportOptionsPlist ExportOptions.plist \
  -exportPath build/ipa
```

---

## Important Configuration Values

### Bundle Identifier
```
com.mytradingbox.app
```

### Team ID
Get from: https://developer.apple.com → Certificates, IDs & Profiles

### Minimum iOS Version
```
13.0 (or higher)
```

### App Icon Size
```
1024x1024 PNG (required)
```

---

## Next Steps

1. **Run the setup**:
   ```bash
   # On macOS
   bash capacitor-setup.sh
   
   # Or manually
   npm install @capacitor/core @capacitor/ios --save-exact
   npm install --save-dev @capacitor/cli --save-exact
   npm run build -- --configuration production
   npx cap add ios
   npx cap sync ios
   ```

2. **Configure in Xcode**:
   ```bash
   npx cap open ios
   # Set Team ID, Bundle ID, App Icons in Xcode
   ```

3. **Test on device/simulator**:
   ```bash
   # Run from Xcode: Product → Run
   # Or: xcodebuild command (see TERMINAL_COMMANDS.md)
   ```

4. **Prepare for App Store**:
   - Follow APP_STORE_SUBMISSION_CHECKLIST.md
   - Create app in App Store Connect
   - Upload screenshots
   - Submit build for review

---

## Resources

### Documentation
- Complete Guide: [CAPACITOR_IOS_SETUP.md](CAPACITOR_IOS_SETUP.md)
- Terminal Commands: [TERMINAL_COMMANDS.md](TERMINAL_COMMANDS.md)
- App Store Checklist: [APP_STORE_SUBMISSION_CHECKLIST.md](APP_STORE_SUBMISSION_CHECKLIST.md)

### External Links
- Capacitor Documentation: https://capacitorjs.com
- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple Developer: https://developer.apple.com
- Xcode Help: https://developer.apple.com/xcode/help/

---

## Common Commands Quick Reference

```bash
# Build and sync
npm run build -- --configuration production && npx cap sync ios

# Open Xcode
npx cap open ios

# Check health
npx cap doctor

# Create production archive
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination generic/platform=iOS -archivePath build/MyTradingBox.xcarchive archive

# Export for submission
xcodebuild -exportArchive -archivePath build/MyTradingBox.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/ipa
```

---

## Support

For issues:
1. Check [CAPACITOR_IOS_SETUP.md](CAPACITOR_IOS_SETUP.md) troubleshooting section
2. Run `npx cap doctor` to diagnose
3. Check console logs in Xcode
4. Review [TERMINAL_COMMANDS.md](TERMINAL_COMMANDS.md) for debugging commands

---

Ready? Start with: `npm install @capacitor/core @capacitor/ios --save-exact` ✅
