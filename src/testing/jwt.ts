/**
 * Unsigned JWT builders for specs. Test-only: imported exclusively from *.spec.ts files.
 * The client never verifies signatures, it only decodes the payload.
 */
import { LoginResponse } from 'src/app/modules/shared/models/login/loginResponse.dto';

export const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
export const NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
export const NAME_IDENTIFIER_CLAIM =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/** Builds an unsigned JWT with the given payload. */
export function buildJwtWithPayload(payload: Record<string, unknown>): string {
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url(payload)}.signature`;
}

/** Builds an unsigned JWT whose `exp` lies `secondsFromNow` in the future (negative: past). */
export function buildJwt(secondsFromNow: number, claims: Record<string, unknown> = {}): string {
  return buildJwtWithPayload({ ...claims, exp: Math.floor(Date.now() / 1000) + secondsFromNow });
}

/** A LoginResponse carrying the given access token. */
export function loginResponse(accessToken: string): LoginResponse {
  const token = new LoginResponse();
  token.AccessToken = accessToken;
  return token;
}
