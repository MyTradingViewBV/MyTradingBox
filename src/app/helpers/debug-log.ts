import { environment } from 'src/environments/environment';

/** Verbose diagnostics; silenced in production builds. */
const DEBUG = !environment.production;

export function debugLog(...args: unknown[]): void {
  if (DEBUG) console.log(...args);
}
