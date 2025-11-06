import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: false,
  version: '#{Build.BuildNumber}#',
  //apiUrl: 'https://localhost:7212/',
  apiUrl: 'https://bot002api-gbh3hwe2egepfph6.swedencentral-01.azurewebsites.net/'
};
