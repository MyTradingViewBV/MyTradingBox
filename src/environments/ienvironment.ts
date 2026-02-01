export interface IEnvironment {
  production: boolean;
  version: string;
  apiUrl: string;
  vapidPublicKey?: string; // Base64URL encoded VAPID public key for Web Push
  disablePush?: boolean; // Temporarily disable push subscription feature
  disableSw?: boolean; // Temporarily disable Service Worker in production
}
