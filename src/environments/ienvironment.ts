export interface IEnvironment {
  production: boolean;
  version: string;
  apiUrl: string;
  tradeAssistantPath?: string;
  vapidPublicKey?: string; // Base64URL encoded VAPID public key for Web Push
  disablePush?: boolean; // Temporarily disable push subscription feature
  disableSw?: boolean; // Temporarily disable Service Worker in production
  github?: {
    owner: string;
    repo: string;
    token: string;
  };
}
