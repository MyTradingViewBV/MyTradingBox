import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: true,
  version: '#{Build.BuildNumber}#',
  apiUrl: 'https://bot002api-gbh3hwe2egepfph6.swedencentral-01.azurewebsites.net/',
  vapidPublicKey: 'REPLACE_WITH_YOUR_PUBLIC_VAPID_KEY',
  disablePush: false
  //apiUrl: 'https://localhost:7212/',
  ,disableSw: false
};
