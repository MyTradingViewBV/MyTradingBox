export interface IEnvironment {
  production: boolean;
  version: string;
  apiUrl: string;
  vapidPublicKey?: string; // Base64URL encoded VAPID public key for Web Push
}
