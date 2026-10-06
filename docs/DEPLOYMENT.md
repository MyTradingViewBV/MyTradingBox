# Deployment Guide

## Overview

MyTradingBox supports multiple deployment targets: web (PWA), iOS, and Android.

## Web Deployment

### Prerequisites
- Node.js 18+
- npm 9+
- Web server (nginx, Apache, etc.)

### Build Process
```bash
# Install dependencies
npm install

# Run tests
npm test

# Build for production
npm run build -- --configuration production
```

### Publishing to GitHub Pages (`npm run deploy`)

The live web app is published to GitHub Pages with `npm run deploy`. The script runs these steps in
order and stops at the first failure:

1. `scripts/predeploy-check.js`: refuses to continue if `git status --porcelain` shows any change,
   including untracked files. Commit or stash first.
2. `npm run lint` and `npm run test`.
3. `set-version`, `log-deploy` and `release-notes:sync`: bump the version and update
   `updates/RELEASE_LOG.md` and the release notes.
4. Production build with `--base-href=/MyTradingBox/`, then publish with `angular-cli-ghpages`.

Step 3 modifies tracked files (`package.json`, `src/assets/version.json`,
`updates/RELEASE_LOG.md`, `src/assets/release-notes.mock.json`). Commit them after a deploy, or the
next deploy will be refused by step 1.

GitHub Pages cannot send HTTP headers, so the Content-Security-Policy lives in a `<meta>` tag in
`src/index.html`. If you add a new external host (API, WebSocket, image CDN), add it to that policy.
CI checks that the build's inline script hash is still allowed by the policy.

### Server Configuration
- Serve static files from `dist/mytradingbox/browser/`
- Configure SSL certificate
- Set up proper CORS headers
- Enable gzip compression

### PWA Setup
- Service worker automatically registered
- Web app manifest configured
- Install prompts enabled

## iOS Deployment

### Prerequisites
- macOS with Xcode
- Apple Developer account
- Capacitor CLI

### Build Steps
```bash
# Install Capacitor
npm install -g @capacitor/cli

# Add iOS platform
npx cap add ios

# Build Angular
npm run build -- --configuration production

# Sync to iOS
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### Xcode Configuration
- Set bundle identifier: `com.mytradingbox.app`
- Configure signing certificate
- Set minimum iOS version: 13.0
- Add app icons and launch screens

### App Store Submission
- Create App Store Connect record
- Upload build via Xcode or Transporter
- Configure app metadata
- Submit for review

## Android Deployment

### Prerequisites
- Android Studio
- Java JDK
- Capacitor CLI

### Build Steps
```bash
# Add Android platform
npx cap add android

# Build Angular
npm run build -- --configuration production

# Sync to Android
npx cap sync android

# Open in Android Studio
npx cap open android
```

### Android Studio Configuration
- Set package name: `com.mytradingbox.app`
- Configure signing keys
- Set minimum Android API level
- Add app icons

### Google Play Submission
- Create Google Play Console project
- Upload APK/AAB bundle
- Configure store listing
- Publish to production

## CI/CD Pipeline

### GitHub Actions
- Automated testing on push/PR
- Production builds on main branch
- Mobile app builds for releases

### Environment Variables
- API keys for external services
- Build configuration
- Signing certificates

## Monitoring and Maintenance

### Performance Monitoring
- Lighthouse PWA audits
- Bundle size analysis
- Core Web Vitals tracking

### Error Tracking
- Sentry integration for error reporting
- User feedback collection
- Crash analytics

### Updates
- Service worker update mechanism
- In-app update prompts
- Version management

## Rollback Procedures

### Web Rollback
- Deploy previous build version
- Clear CDN cache if applicable
- Notify users of temporary issues

### Mobile Rollback
- Submit previous version to app stores
- Update store listings
- Communicate with users

## Security Checklist

- [ ] SSL certificates valid
- [ ] API keys secured
- [ ] Dependencies updated
- [ ] Security audit passed
- [ ] Code signing configured
- [ ] Privacy policy updated