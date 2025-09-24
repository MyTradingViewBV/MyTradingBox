import { IEnvironment } from './ienvironment';

export const environment: IEnvironment = {
  production: false,
  version: '#{Build.BuildNumber}#',
  //apiUrl: 'https://botapi-f3fkahc9eadkfveh.swedencentral-01.azurewebsites.net/'
  apiUrl: 'https://localhost:7212/',
};
