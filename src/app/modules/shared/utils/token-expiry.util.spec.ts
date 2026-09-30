import {
  extractExpiry,
  isAdminToken,
  isTokenExpired,
} from './token-expiry.util';
import { LoginResponse } from '../models/login/loginResponse.dto';

function buildJwtWithPayload(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadPart = btoa(JSON.stringify(payload));
  return `${header}.${payloadPart}.sig`; // signature dummy
}

function buildJwt(expSecondsFromNow: number): string {
  return buildJwtWithPayload({
    exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
  });
}

describe('token-expiry.util', () => {
  it('extracts expiry from JWT exp claim', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwt(60);
    const { expiryTimestamp, source } = extractExpiry(token);
    expect(source).toBe('jwt-exp');
    expect(expiryTimestamp).toBeGreaterThan(Date.now());
  });

  it('falls back to ExpiresIn (seconds) + CreatedAt when no JWT exp', () => {
    const token = new LoginResponse();
    token.AccessToken = 'not.a.jwt.token';
    const createdAt = new Date('2026-01-01T00:00:00Z');
    token.CreatedAt = createdAt;
    token.ExpiresIn = '30';
    const { expiryTimestamp, source } = extractExpiry(token);
    expect(source).toBe('expires-in');
    expect(expiryTimestamp).toBe(createdAt.getTime() + 30_000);
  });

  it('always interprets ExpiresIn as seconds, even for large values', () => {
    const token = new LoginResponse();
    token.AccessToken = 'opaque';
    const createdAt = new Date('2026-01-01T00:00:00Z');
    token.CreatedAt = createdAt;
    token.ExpiresIn = '86000';
    const { expiryTimestamp } = extractExpiry(token);
    expect(expiryTimestamp).toBe(createdAt.getTime() + 86_000_000);
  });

  it('accepts a numeric ExpiresIn as sent by the backend', () => {
    const token = new LoginResponse();
    token.AccessToken = 'opaque';
    const createdAt = new Date('2026-01-01T00:00:00Z');
    token.CreatedAt = createdAt;
    (token as unknown as { ExpiresIn: number }).ExpiresIn = 60;
    expect(extractExpiry(token).expiryTimestamp).toBe(
      createdAt.getTime() + 60_000,
    );
  });

  it('returns unknown when ExpiresIn is not a positive number', () => {
    const token = new LoginResponse();
    token.AccessToken = 'opaque';
    token.ExpiresIn = 'abc';
    expect(extractExpiry(token)).toEqual({
      expiryTimestamp: null,
      source: 'unknown',
    });
  });

  it('isTokenExpired returns true for expired JWT', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwt(-10);
    expect(isTokenExpired(token)).toBe(true);
  });

  it('isTokenExpired returns false for a JWT that is still valid', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwt(3600);
    expect(isTokenExpired(token)).toBe(false);
  });

  it('isTokenExpired treats a JWT within the skew window as expired', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwt(5);
    expect(isTokenExpired(token, 10_000)).toBe(true);
  });

  it('isTokenExpired fails closed when expiry cannot be determined', () => {
    const token = new LoginResponse();
    token.AccessToken = 'opaque';
    // No ExpiresIn set and no JWT exp claim
    expect(isTokenExpired(token)).toBe(true);
  });

  it('isTokenExpired fails closed for a JWT without exp and no ExpiresIn', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwtWithPayload({ sub: 'user-1' });
    expect(isTokenExpired(token)).toBe(true);
  });

  it('isAdminToken returns true when role claim is Admin', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwtWithPayload({
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'Admin',
    });
    expect(isAdminToken(token)).toBe(true);
  });

  it('isAdminToken returns true when user has Admin and Guest roles', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwtWithPayload({
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': [
        'Guest',
        'Admin',
      ],
    });
    expect(isAdminToken(token)).toBe(true);
  });

  it('isAdminToken supports lowercase roles claim array', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwtWithPayload({ roles: ['guest', 'admin'] });
    expect(isAdminToken(token)).toBe(true);
  });

  it('isAdminToken returns false for guest-only role', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwtWithPayload({
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'Guest',
    });
    expect(isAdminToken(token)).toBe(false);
  });
});
