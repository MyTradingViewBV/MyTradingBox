import { jwtDecode } from 'jwt-decode';
import { LoginResponse } from '../models/login/loginResponse.dto';

const ROLE_CLAIM =
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
const ROLE_CLAIMS = [ROLE_CLAIM, 'role', 'roles'] as const;
const NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
const NAME_IDENTIFIER_CLAIM =
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';

function parseRoleClaimValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => parseRoleClaimValue(item));
  }

  if (value == null) return [];

  const asText = String(value).trim();
  if (!asText) return [];

  // Some backends emit JSON-encoded role arrays in a string claim.
  if (asText.startsWith('[') && asText.endsWith(']')) {
    try {
      const parsed = JSON.parse(asText);
      if (Array.isArray(parsed)) {
        return parsed
          .map((role) => String(role).trim().toLowerCase())
          .filter(Boolean);
      }
    } catch {
      // Fall through and handle as plain text.
    }
  }

  return asText
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .filter(Boolean);
}

function getRolesFromDecodedToken(decoded: any): string[] {
  const uniqueRoles = new Set<string>();
  for (const claimKey of ROLE_CLAIMS) {
    for (const role of parseRoleClaimValue(decoded?.[claimKey])) {
      uniqueRoles.add(role);
    }
  }
  return Array.from(uniqueRoles);
}

/**
 * Returns true if the JWT token contains the Admin role claim.
 */
export function isAdminToken(token: LoginResponse): boolean {
  const accessToken = token?.AccessToken;
  if (!accessToken || accessToken.split('.').length !== 3) return false;
  try {
    const decoded: any = jwtDecode(accessToken);
    const roles = getRolesFromDecodedToken(decoded);
    return roles.includes('admin');
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
 * 1. JWT `exp` claim (if AccessToken looks like a JWT). The BotAPI always issues
 *    JWTs with `exp` (TokenService: Jwt:AccessTokenExpirationMinutes), so this is
 *    the normal path.
 * 2. `ExpiresIn` + `CreatedAt` fallback. The backend contract (AuthDTOs.AuthResponse)
 *    defines `ExpiresIn` as an integer number of SECONDS; it is always interpreted
 *    as seconds (no magnitude heuristics). Requires a valid `CreatedAt`.
 * 3. Unknown (null) — callers must treat this as expired (see isTokenExpired).
 */
export function extractExpiry(token: LoginResponse): TokenExpiryInfo {
  const accessToken = token?.AccessToken;
  if (accessToken && accessToken.split('.').length === 3) {
    try {
      const decoded: any = jwtDecode(accessToken);
      const exp = Number(decoded?.exp);
      if (Number.isFinite(exp) && exp > 0) {
        return { expiryTimestamp: exp * 1000, source: 'jwt-exp' };
      }
    } catch {
      // ignore decode errors; fall through
    }
  }

  const rawExpiresIn = token?.ExpiresIn as unknown;
  if (
    rawExpiresIn !== undefined &&
    rawExpiresIn !== null &&
    String(rawExpiresIn).trim() !== ''
  ) {
    const expiresInSeconds = Number(rawExpiresIn);
    const createdAtMs = token?.CreatedAt
      ? new Date(token.CreatedAt).getTime()
      : Number.NaN;
    if (
      Number.isFinite(expiresInSeconds) &&
      expiresInSeconds > 0 &&
      Number.isFinite(createdAtMs)
    ) {
      return {
        expiryTimestamp: createdAtMs + expiresInSeconds * 1000,
        source: 'expires-in',
      };
    }
  }

  return { expiryTimestamp: null, source: 'unknown' };
}

/**
 * Returns true if the token is expired. A small skew (default 1000ms) is added
 * so that near-expiry tokens are treated as expired to avoid race conditions.
 * Fails closed: if the expiry cannot be determined the token is treated as expired.
 */
export function isTokenExpired(token: LoginResponse, skewMs = 1000): boolean {
  const { expiryTimestamp } = extractExpiry(token);
  if (expiryTimestamp === null) return true;
  return Date.now() + skewMs >= expiryTimestamp;
}
