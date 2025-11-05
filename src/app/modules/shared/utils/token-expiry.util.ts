import { jwtDecode } from 'jwt-decode';
import { LoginResponse } from '../models/login/loginResponse.dto';

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
