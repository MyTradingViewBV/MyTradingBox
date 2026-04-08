import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: false,
  version: '#{Build.BuildNumber}#',
  //apiUrl: 'https://localhost:7212/',
  apiUrl: 'https://bot002api-gbh3hwe2egepfph6.swedencentral-01.azurewebsites.net/',
  tradeAssistantPath: '/api/TradeAssistant/chat',
  vapidPublicKey: 'REPLACE_WITH_YOUR_PUBLIC_VAPID_KEY',
  disablePush: false,
  github: {
    owner: 'MyTradingViewBV',
    repo: 'MyTradingBox',
    token: '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'
  }
};
