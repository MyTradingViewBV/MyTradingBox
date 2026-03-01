# VAPID Key Configuration Guide

## Overview

VAPID (Voluntary Application Server Identification) keys are required for Web Push notifications to work. You need a **public key** (stored in your app) and a **private key** (stored securely on your backend).

## Step 1: Generate VAPID Keys

### Option A: Using web-push CLI (Recommended)

```bash
# Install web-push globally
npm install -g web-push

# Generate keys
web-push generate-vapid-keys

# Output will look like:
# Public Key: BCk...xyz
# Private Key: 3Kf...abc
```

### Option B: Using Node.js script

Create a temporary file `generate-keys.js`:

```javascript
const webpush = require('web-push');
const vapidKeys = webpush.generateVAPIDKeys();

console.log('Public Key:');
console.log(vapidKeys.publicKey);
console.log('\nPrivate Key:');
console.log(vapidKeys.privateKey);
```

Then run:
```bash
npx node generate-keys.js
```

## Step 2: Configure Public Key in Angular App

### Update development environment

File: `src/environments/environment.ts`

```typescript
import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: false,
  version: 'dev',
  apiUrl: 'https://bot002api-gbh3hwe2egepfph6.swedencentral-01.azurewebsites.net/',
  vapidPublicKey: 'BCk1OGtJTGhkNnR2aUZjS2hNMTJVMzdIUlhDNG5jZHBWdENRbzNQR3kyNW1kcU1jZUZBM3p1ZXJNSkloQjlKQWs=',  // ✅ Replace with your public key
  disablePush: false,
  disableSw: false
};
```

### Update production environment

File: `src/environments/environment.prod.ts`

```typescript
import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: true,
  version: '#{Build.BuildNumber}#',
  apiUrl: 'https://bot002api-gbh3hwe2egepfph6.swedencentral-01.azurewebsites.net/',
  vapidPublicKey: 'BCk1OGtJTGhkNnR2aUZjS2hNMTJVMzdIUlhDNG5jZHBWdENRbzNQR3kyNW1kcU1jZUZBM3p1ZXJNSkloQjlKQWs=',  // ✅ Replace with your public key
  disablePush: false,
  disableSw: false
};
```

## Step 3: Store Private Key Securely on Backend

### Never commit to repository ❌

```bash
# Make sure .gitignore includes:
vapid-private-key.txt
.env
.env.local
```

### Storage Options

#### Option 1: Environment Variables (Recommended for most deployments)

```bash
# .env (add to .gitignore)
VAPID_PRIVATE_KEY=3Kf1VN8f2xYzAbc...xyz
VAPID_PUBLIC_KEY=BCk1OGtJTGhkNnR2aUZjS2h...
```

#### Option 2: Azure Key Vault (For Azure deployments)

```bash
# Store secrets in Key Vault
az keyvault secret set --vault-name MyTradingBoxVault \
  --name vapid-private-key \
  --value "3Kf1VN8f2xYzAbc...xyz"
```

#### Option 3: Config Server (For distributed setups)

Store in secure configuration server and load at runtime.

## Step 4: Use Private Key in Backend Push Service

### Example: Node.js/Express backend

```typescript
import webpush from 'web-push';

// Configure Web Push
webpush.setVapidDetails(
  'mailto:admin@mytradingbox.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Send notification
app.post('/api/notifications/send', async (req, res) => {
  const { subscription, title, body } = req.body;
  
  try {
    await webpush.sendNotification(subscription, JSON.stringify({
      title,
      body,
      icon: '/assets/icons/icon-192x192.png',
      badge: '/assets/icons/icon-96x96.png'
    }));
    res.json({ success: true });
  } catch (error) {
    console.error('Push failed:', error);
    res.status(500).json({ error: error.message });
  }
});
```

### Example: .NET/C# backend

```csharp
using WebPush;

public class PushNotificationService
{
    private readonly WebPushClient _webPushClient;
    private readonly VapidDetails _vapidDetails;
    
    public PushNotificationService(IConfiguration config)
    {
        _webPushClient = new WebPushClient();
        _vapidDetails = new VapidDetails(
            "mailto:admin@mytradingbox.com",
            config["VAPID_PUBLIC_KEY"],
            config["VAPID_PRIVATE_KEY"]
        );
    }
    
    public async Task SendNotificationAsync(PushSubscription subscription, string title, string body)
    {
        var notification = new
        {
            title,
            body,
            icon = "/assets/icons/icon-192x192.png"
        };
        
        await _webPushClient.SendNotificationAsync(
            subscription,
            JsonConvert.SerializeObject(notification),
            _vapidDetails
        );
    }
}
```

## Step 5: Test Configuration

### Check web-push subscription

Add this to your Angular component to test:

```typescript
import { PushNotificationService } from './helpers/push-notification.service';
import { inject } from '@angular/core';

export class TestPushComponent {
  private pushService = inject(PushNotificationService);
  
  async testPush() {
    const subscription = await this.pushService.ensureSubscription();
    if (subscription) {
      console.log('✅ Subscription created:', subscription);
      console.log('Endpoint:', subscription.endpoint);
      
      // Send to backend to verify
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription)
      });
      
      const result = await response.json();
      console.log('Backend response:', result);
    } else {
      console.error('❌ Failed to create subscription');
    }
  }
}
```

### Send test notification from backend

```bash
# Using curl
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    },
    "title": "Test Notification",
    "body": "If you see this, push is working!"
  }'
```

## Step 6: iOS Testing

### On Physical Device

1. **Install app** via Xcode or TestFlight
2. **Build with updated VAPID keys**:
   ```bash
   npm run build -- --configuration production
   npx cap sync ios
   npx cap open ios
   ```
3. **Grant notification permission** when prompted
4. **Check subscription sent**:
   - Look in browser console for subscription endpoint
   - Verify `/api/notifications/webpush/subscribe` POST request in network tab
5. **Send test notification**:
   - Use backend endpoint to push notification
   - Verify notification appears on home screen or lock screen

### Debugging

Check service worker registration:
```javascript
// In browser console
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => {
    console.log('SW registered:', reg.scope);
    reg.pushManager.getSubscription().then(sub => {
      console.log('Push subscription:', sub);
    });
  });
});
```

## Step 7: Deployment

### Build for production

```bash
# Ensure environment.prod.ts has the correct public key
npm run build -- --configuration production

# Output goes to dist/MyTradingBox
# Capacitor copies to www/
npx cap sync ios

# Open Xcode
npx cap open ios
```

### Archive for App Store

In Xcode:
1. Select "Generic iOS Device" from device dropdown
2. Product → Archive
3. Organizer opens automatically
4. Click "Distribute App" → "App Store Connect"
5. Follow upload prompts

## Security Checklist

- [ ] Public VAPID key stored in environment files (safe to commit)
- [ ] Private VAPID key stored in secure backend config (✅ NOT in repository)
- [ ] Private key restricted to backend-only access
- [ ] Private key never logged or exposed in error messages
- [ ] VAPID keys rotated periodically (every 6-12 months)
- [ ] Expired keys cleaned up from storage
- [ ] Backend validates notification subscriptions before storing

## Common Issues & Solutions

### ❌ Error: "Invalid VAPID keys"

**Cause:** Keys are malformed or swapped

**Solution:**
- Verify public key in environment matches generated key
- Ensure private key used only on backend, not in frontend

### ❌ Notification permission denied

**Cause:** User declined permission or browser doesn't support

**Solution:**
- Test on iOS 16.4+ (requires app installed)
- Check if `disablePush: false` in environment
- Verify notification APIs available in browser/WebView

### ❌ Subscription fails but disablePush is false

**Cause:** Missing notification permission

**Solution:**
- iOS requires explicit user action to grant permission
- Check `push-notification.service.ts` requestPermission() logic
- Test on device (simulator may not work correctly)

### ❌ Backend can't find private key

**Cause:** Environment variable not set or file missing

**Solution:**
```bash
# Verify env var set
echo $VAPID_PRIVATE_KEY

# Or load from secure file
cat /etc/secrets/vapid-private-key
```

---

## Reference Documentation

- **Web Push API:** https://www.w3.org/TR/push-api/
- **VAPID Spec:** https://datatracker.ietf.org/doc/html/draft-thomson-webpush-vapid
- **Web-push NPM:** https://www.npmjs.com/package/web-push
- **Capacitor Push:** https://capacitorjs.com/docs/plugins/push-notifications-fcm (FCM for Android)

---

**Quick Command Reference:**

```bash
# Generate keys
npm install -g web-push && web-push generate-vapid-keys

# Build for production
npm run build -- --configuration production

# Sync to iOS
npx cap sync ios

# Open Xcode
npx cap open ios

# Install app on device
# In Xcode: Product → Run or Cmd+R
```

---

**Status:** Ready for VAPID configuration ✅
