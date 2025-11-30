import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: true,
  version: '#{Build.BuildNumber}#',
  apiUrl: 'https://bot002api-gbh3hwe2egepfph6.swedencentral-01.azurewebsites.net/'
  //apiUrl: 'https://localhost:7212/',
};
