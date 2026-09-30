import { CapacitorConfig } from '@capacitor/cli';

// Live reload is strictly opt-in: set CAP_LIVE_RELOAD_URL (e.g. http://192.168.1.10:4200)
// when running `npx cap run` against a local dev server. Release builds never set it.
const liveReloadUrl = process.env['CAP_LIVE_RELOAD_URL']?.trim();

const config: CapacitorConfig = {
  appId: 'com.mytradingbox.app',
  appName: 'MyTradingBox',
  webDir: 'dist/MyTradingBox/browser',
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
      overlaysWebView: false,
    },

    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
      sound: 'beep.wav',
    },
  },

  server: {
    androidScheme: 'https',
    ...(liveReloadUrl
      ? {
          url: liveReloadUrl,
          // Cleartext is only allowed when the dev server itself is plain HTTP.
          cleartext: liveReloadUrl.startsWith('http://'),
        }
      : {}),
  },

  ios: {
    contentInsetAdjustmentBehavior: 'automatic',
  },
};

export default config;
