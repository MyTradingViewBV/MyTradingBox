import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: false,
  version: '#{Build.BuildNumber}#',
  //apiUrl: 'https://localhost:7212/',
  apiUrl: 'https://localhost:7212/', // TEMP mcb-localtest - do not commit (stop.ps1 reverts)
  tradeAssistantPath: '/api/TradeAssistant/chat',
  vapidPublicKey: 'REPLACE_WITH_YOUR_PUBLIC_VAPID_KEY',
  disablePush: false,
};
