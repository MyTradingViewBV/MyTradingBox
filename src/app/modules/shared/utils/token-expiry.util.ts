import { jwtDecode } from 'jwt-decode';
import { LoginResponse } from '../models/login/loginResponse.dto';

const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
const NAME_IDENTIFIER_CLAIM =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';

/**
 * Returns true if the JWT token contains the Admin role claim.
 */
export function isAdminToken(token: LoginResponse): boolean {
  const accessToken = token?.AccessToken;
  if (!accessToken || accessToken.split('.').length !== 3) return false;
  try {
    const decoded: any = jwtDecode(accessToken);
    return (decoded?.[ROLE_CLAIM] ?? '').toLowerCase() === 'admin';
  } catch {
    return false;
  }
}

/**
 * Returns the email address embedded in the JWT name claim, or empty string.
 */
export function getEmailFromToken(token: LoginResponse): string {
  const accessToken = token?.AccessToken;
  if (!accessToken || accessToken.split('.').length !== 3) return '';
  try {
    const decoded: any = jwtDecode(accessToken);
    return decoded?.[NAME_CLAIM] ?? '';
  } catch {
    return '';
  }
}

/**
 * Returns the best available user identifier claim from the JWT, or empty string.
 */
export function getUserIdFromToken(token: LoginResponse): string {
  const accessToken = token?.AccessToken;
  if (!accessToken || accessToken.split('.').length !== 3) return '';
  try {
    const decoded: any = jwtDecode(accessToken);
    const claimValue =
      decoded?.[NAME_IDENTIFIER_CLAIM] ??
      decoded?.oid ??
      decoded?.nameid ??
      decoded?.sub ??
      decoded?.userId ??
      decoded?.uid ??
      decoded?.[NAME_CLAIM] ??
      decoded?.email ??
      decoded?.unique_name;
    if (!claimValue) return '';
    return String(claimValue).trim();
  } catch {
    return '';
  }
}

export interface TokenExpiryInfo {
  expiryTimestamp: number | null; // ms since epoch
  source: 'jwt-exp' | 'expires-in' | 'unknown';
}

/**
 * Attempts to derive an absolute expiry timestamp for the given LoginResponse.
 * Order of precedence:
 * 1. JWT exp claim (if AccessToken looks like a JWT)
 * 2. ExpiresIn + CreatedAt fallback
 * 3. Unknown (null)
 */
export function extractExpiry(token: LoginResponse): TokenExpiryInfo {
  const accessToken = token?.AccessToken;
  if (accessToken && accessToken.split('.').length === 3) {
    try {
       
      const decoded: any = jwtDecode(accessToken);
      if (decoded?.exp) {
        return { expiryTimestamp: decoded.exp * 1000, source: 'jwt-exp' };
      }
    } catch {
      // ignore decode errors; fall through
    }
  }

  if (token?.ExpiresIn) {
    const createdAtMs = token.CreatedAt ? new Date(token.CreatedAt).getTime() : Date.now();
    const raw = Number(token.ExpiresIn);
    if (!Number.isNaN(raw)) {
      // Heuristic: If raw is very large (e.g. > 5 years in seconds), treat as milliseconds.
      // 5 years in seconds ≈ 157_680_000. Provided sample 180_000_000 likely ms (~50h) not seconds (~5.7y).
      const treatAsMs = raw > 157_680_000;
      const expiryMs = treatAsMs ? raw : raw * 1000;
      return { expiryTimestamp: createdAtMs + expiryMs, source: 'expires-in' };
    }
  }

  return { expiryTimestamp: null, source: 'unknown' };
}

/**
 * Returns true if the token is expired. A small skew (default 1000ms) is added
 * so that near-expiry tokens are treated as expired to avoid race conditions.
 */
export function isTokenExpired(token: LoginResponse, skewMs = 1000): boolean {
  const { expiryTimestamp } = extractExpiry(token);
  if (!expiryTimestamp) return false; // treat unknown expiry as not expired
  return Date.now() + skewMs >= expiryTimestamp;
}
