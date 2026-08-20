import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: true,
  version: '#{Build.BuildNumber}#',
  apiUrl: 'https://mytradingbox.com/',
  tradeAssistantPath: '/api/TradeAssistant/chat',
  vapidPublicKey: 'REPLACE_WITH_YOUR_PUBLIC_VAPID_KEY',
  disablePush: false,
  disableSw: false,
};
