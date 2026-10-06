import { environment } from 'src/environments/environment';

/** The configured API base URL without trailing slashes (e.g. 'https://host'). */
export function getApiBase(): string {
  return (environment.apiUrl || '').replace(/\/+$/, '');
}
