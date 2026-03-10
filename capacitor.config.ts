import { CapacitorConfig } from '@capacitor/cli';

const isProduction = process.env.NODE_ENV === 'production';

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
    // Development server (remove for production builds)
    ...(isProduction
      ? {}
      : {
          url: 'http://192.168.1.100:4200', // Change to your machine IP
          cleartext: true,
        }),
  },

  ios: {
    contentInsetAdjustmentBehavior: 'automatic',
  },
};

export default config;
