# MyTradingBox - iOS Setup - Quick Reference Card

## Installation (Copy-Paste Ready)

```bash
# 1. Install Capacitor packages
npm install @capacitor/core @capacitor/ios @capacitor/network --save-exact
npm install --save-dev @capacitor/cli --save-exact

# 2. Build Angular
npm run build -- --configuration production

# 3. Initialize iOS
npx cap add ios
npx cap sync ios

# 4. Open Xcode
npx cap open ios
```

---

## Essential Configuration Values

| Setting | Value |
|---------|-------|
| **Bundle ID** | `com.mytradingbox.app` |
| **App Name** | `MyTradingBox` |
| **Min iOS Version** | `13.0` |
| **Web Output Path** | `www/` |
| **SW Registration** | `registerImmediately` |
| **Base Href** | `/` |

---

## Key Files & Purpose

| File | Purpose | When to Use |
|------|---------|-----------|
| `capacitor.config.ts` | Capacitor settings | Build time |
| `ngsw-config.json` | Service Worker caching | Build time |
| `sw-update.service.ts` | Update detection | Runtime (auto) |
| `capacitor-offline.service.ts` | Network detection | Runtime (inject) |
| `ExportOptions.plist` | App Store export | Export time |
| `App.entitlements` | iOS capabilities | Xcode signing |

---

## Most Common Commands

```bash
# Develop
ng serve
npm run build
npx cap sync ios
npx cap open ios

# Test on device
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination generic/platform=iOS build

# Build for App Store
npm run build -- --configuration production
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination generic/platform=iOS \
  -archivePath build/MyTradingBox.xcarchive archive

# Export
xcodebuild -exportArchive -archivePath build/MyTradingBox.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/ipa
```

---

## Xcode Configuration Checklist (5 min)

- [ ] Select "App" target in Xcode
- [ ] Go to "Signing & Capabilities"
- [ ] Check "Automatically manage signing"
- [ ] Select Team ID from dropdown
- [ ] Verify Bundle ID: `com.mytradingbox.app`
- [ ] Set Minimum Deployments to `13.0`
- [ ] Go to "General" tab
- [ ] Add app icon (1024x1024)
- [ ] Set version: `1.0.0`, build: `1`

---

## Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| Blank white screen | Check `outputPath: "www"` in angular.json |
| Service Worker not working | Ensure production build: `npm run build -- --configuration production` |
| Cannot sync | Run `npx cap sync ios` instead of `npx cap copy` |
| Pod errors | Run `cd ios/App && pod install && cd ../../` |
| Build fails | Run `xcodebuild clean` then rebuild |
| Icons not showing | Check icon size is exactly 1024x1024 |

---

## Documentation Quick Links

| Document | Purpose | Read Time |
|----------|---------|-----------|
| **QUICK_START.md** | Fast 5-min setup | 5 min |
| **CAPACITOR_IOS_SETUP.md** | Complete guide | 30 min |
| **TERMINAL_COMMANDS.md** | Command reference | 20 min |
| **APP_STORE_SUBMISSION_CHECKLIST.md** | Before submitting | 30 min |
| **ARCHITECTURE_DIAGRAMS.md** | How it works | 15 min |

---

## App Store Submission In 3 Steps

### Step 1: Prepare Build
```bash
npm run build -- --configuration production
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination generic/platform=iOS \
  -archivePath build/MyTradingBox.xcarchive archive
```

### Step 2: Export
```bash
xcodebuild -exportArchive -archivePath build/MyTradingBox.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/ipa
```

### Step 3: Upload
```bash
# Open Transporter app and drag the .ipa file
cd build/ipa && open .

# Or use CLI (requires app-specific password)
xcrun altool --upload-app --type ios \
  --file build/ipa/MyTradingBox.ipa \
  --username your-email@example.com \
  --password your-app-password
```

---

## Environment Setup

### macOS Prerequisites
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install CocoaPods (if needed)
sudo gem install cocoapods

# Verify Node.js and npm
node --version  # Should be 16+
npm --version   # Should be 8+
```

### Required for iOS Dev
- [ ] Xcode 14+ installed
- [ ] Command line tools installed
- [ ] CocoaPods installed
- [ ] Apple Developer account
- [ ] Physical device or simulator

---

## API Endpoint Configuration

### In Your Services
```typescript
// Use HTTPS in production
const API_BASE = 'https://api.example.com';

// For development with local server
const DEV_API_BASE = 'http://localhost:3000';
```

### Network Security (Info.plist)
```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <false/>
  <!-- Only HTTPS in production -->
</dict>
```

---

## Offline Strategy

### Service Worker
- âœ… Static assets: Prefetch & cache indefinitely
- âœ… API responses: Cache with TTL (1-24h)
- âœ… Images: Lazy load & cache long-term

### Capacitor
- âœ… Monitor network status: `CapacitorOfflineService`
- âœ… Queue offline actions
- âœ… Sync when online

### UI
- âœ… Show offline indicator
- âœ… Disable remote features
- âœ… Queue actions locally

---

## Testing Checklist

- [ ] Runs on iPhone 15/14/13
- [ ] Runs on iOS 13.0+
- [ ] No crashes on cold start
- [ ] Offline functionality works
- [ ] Service Worker updates work
- [ ] Icons display correctly
- [ ] Splash screen shows
- [ ] Status bar styled properly
- [ ] Network permissions granted
- [ ] Data persists across restarts

---

## Performance Tips

```bash
# Check build size
npm run build -- --configuration production --stats-json

# Analyze bundle
npm install -g webpack-bundle-analyzer
webpack-bundle-analyzer dist/*/stats.json

# Lazy load modules
// In routes
loadChildren: () => import('./trading/trading.module').then(m => m.TradingModule)

# Use OnPush change detection
@Component({
  selector: 'app-trading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ...
})
```

---

## Critical Reminders

âš ï¸ **Before Submitting:**
- [ ] Version number updated
- [ ] Build number incremented
- [ ] All icons included
- [ ] Privacy policy linked
- [ ] No test data in screenshots
- [ ] Service Worker enabled
- [ ] API uses HTTPS
- [ ] Team ID configured

âš ï¸ **Development Only:**
- [ ] Remove dev server from capacitor.config.ts
- [ ] Disable console.log statements
- [ ] Test on production build
- [ ] Verify offline caching works

âš ï¸ **Security:**
- [ ] No API keys hardcoded
- [ ] Use environment variables
- [ ] SSL certificate valid
- [ ] Data encrypted in transit
- [ ] No sensitive data in localStorage

---

## Getting Help

### Immediate Issues
1. Run: `npx cap doctor`
2. Check console: Xcode â†’ Debug â†’ Console
3. Look up error in [CAPACITOR_IOS_SETUP.md](CAPACITOR_IOS_SETUP.md)

### Command Reference
â†’ [TERMINAL_COMMANDS.md](TERMINAL_COMMANDS.md)

### Complete Setup Guide
â†’ [CAPACITOR_IOS_SETUP.md](CAPACITOR_IOS_SETUP.md)

### Architecture Overview
â†’ [ARCHITECTURE_DIAGRAMS.md](ARCHITECTURE_DIAGRAMS.md)

### Before Submission
â†’ [APP_STORE_SUBMISSION_CHECKLIST.md](APP_STORE_SUBMISSION_CHECKLIST.md)

---

## One-Command Summary

```bash
# Install, build, and sync in one go
npm install @capacitor/core @capacitor/ios @capacitor/network --save-exact && \
npm run build -- --configuration production && \
npx cap add ios && \
npx cap sync ios && \
echo "âœ… Setup complete! Run: npx cap open ios"
```

---

## Success Indicators

âœ… All checks passed = Ready to test:

```bash
# Command to verify
npx cap doctor

# Expected output
âœ” Capacitor CLI - latest (version X.X.X)
âœ” @capacitor/core - version X.X.X
âœ” @capacitor/ios - version X.X.X
âœ” iOS project available at: ./ios
âœ” CocoaPods already installed
âœ” Xcode available at: /Applications/Xcode.app
```

âœ… App builds in Xcode:
- No red errors
- Only warnings OK
- Build time < 2 minutes

âœ… App runs on simulator:
- Launches successfully
- No immediate crashes
- Content visible
- Can interact with buttons

âœ… Ready for App Store:
- Follow checklist in [APP_STORE_SUBMISSION_CHECKLIST.md](APP_STORE_SUBMISSION_CHECKLIST.md)
- Create app in App Store Connect
- Upload screenshots
- Submit for review

---

## What's Different from Web PWA

| Aspect | Web PWA | iOS App (Capacitor) |
|--------|---------|-------------------|
| **Installation** | Browser install | App Store |
| **Distribution** | URL/QR code | App Store Connect |
| **Access** | Any browser | App launcher only |
| **Offline** | Service Worker | SW + native storage |
| **Permissions** | Browser prompts | iOS settings |
| **Update** | Auto when online | App Store + manual |
| **Performance** | Browser dependent | Native container |
| **Review** | None | App Store review |

---

## Final Checklist Before "Next Steps"

- [ ] Read QUICK_START.md (5 min)
- [ ] Read CAPACITOR_IOS_SETUP.md section 1-4 (15 min)
- [ ] Have macOS with Xcode installed
- [ ] Have Apple Developer account
- [ ] Have your app icon (1024x1024)
- [ ] Ready to commit 2-3 hours for setup

**Then:**
```bash
npm install @capacitor/core @capacitor/ios @capacitor/network --save-exact
# Follow QUICK_START.md from there
```

---

**You're ready! ðŸš€**

Start with: `npm install @capacitor/core @capacitor/ios @capacitor/network --save-exact`

