import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  extractExpiry,
  getEmailFromToken,
  getUserIdFromToken,
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

describe('token-expiry.util edge cases', () => {
  const NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name';
  const NAME_IDENTIFIER_CLAIM =
    'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier';
  const ROLE_CLAIM = 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role';
  const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

  function tokenWith(accessToken: string): LoginResponse {
    const token = new LoginResponse();
    token.AccessToken = accessToken;
    return token;
  }

  describe('isTokenExpired at a fixed time', () => {
    afterEach(() => vi.restoreAllMocks());

    // Pins Date.now() only; no fake timers needed.
    function atNow(): void {
      vi.spyOn(Date, 'now').mockReturnValue(NOW);
    }

    it('treats a token as expired exactly when now + skew reaches the expiry', () => {
      atNow();
      const token = tokenWith(buildJwtWithPayload({ exp: NOW / 1000 + 2 }));

      expect(isTokenExpired(token, 1999)).toBe(false);
      expect(isTokenExpired(token, 2000)).toBe(true);
    });

    it('uses a default skew of one second', () => {
      atNow();
      expect(isTokenExpired(tokenWith(buildJwtWithPayload({ exp: NOW / 1000 + 1 })))).toBe(true);
      expect(isTokenExpired(tokenWith(buildJwtWithPayload({ exp: NOW / 1000 + 2 })))).toBe(false);
    });

    it('expires an ExpiresIn-based token relative to CreatedAt', () => {
      atNow();
      const token = tokenWith('opaque');
      token.ExpiresIn = '60';
      token.CreatedAt = new Date(NOW - 30_000);
      expect(isTokenExpired(token)).toBe(false);

      token.CreatedAt = new Date(NOW - 60_000);
      expect(isTokenExpired(token)).toBe(true);
    });
  });

  describe('extractExpiry', () => {
    it.each([
      ['a non-numeric exp', { exp: 'soon' }],
      ['a zero exp', { exp: 0 }],
      ['a negative exp', { exp: -5 }],
    ])('ignores %s and falls back to ExpiresIn', (_, payload) => {
      const token = tokenWith(buildJwtWithPayload(payload));
      token.CreatedAt = new Date(NOW);
      token.ExpiresIn = '10';

      expect(extractExpiry(token)).toEqual({ expiryTimestamp: NOW + 10_000, source: 'expires-in' });
    });

    it('falls back to ExpiresIn when a three-part token cannot be decoded', () => {
      const token = tokenWith('%%%.%%%.%%%');
      token.CreatedAt = new Date(NOW);
      token.ExpiresIn = '5';

      expect(extractExpiry(token).source).toBe('expires-in');
    });

    it.each([
      ['zero', '0'],
      ['negative', '-30'],
      ['whitespace', '   '],
    ])('returns unknown for a %s ExpiresIn', (_, expiresIn) => {
      const token = tokenWith('opaque');
      token.CreatedAt = new Date(NOW);
      token.ExpiresIn = expiresIn;

      expect(extractExpiry(token)).toEqual({ expiryTimestamp: null, source: 'unknown' });
    });

    it('returns unknown when CreatedAt is missing or invalid', () => {
      const token = tokenWith('opaque');
      token.ExpiresIn = '60';
      (token as unknown as { CreatedAt: unknown }).CreatedAt = undefined;
      expect(extractExpiry(token).source).toBe('unknown');

      (token as unknown as { CreatedAt: unknown }).CreatedAt = 'not a date';
      expect(extractExpiry(token).source).toBe('unknown');
    });

    it('accepts an ISO string CreatedAt (as restored from JSON)', () => {
      const token = tokenWith('opaque');
      token.ExpiresIn = '60';
      (token as unknown as { CreatedAt: unknown }).CreatedAt = new Date(NOW).toISOString();

      expect(extractExpiry(token).expiryTimestamp).toBe(NOW + 60_000);
    });

    it('returns unknown for a null token', () => {
      expect(extractExpiry(null as unknown as LoginResponse).source).toBe('unknown');
    });
  });

  describe('isAdminToken', () => {
    it.each([
      ['a comma separated role string', { [ROLE_CLAIM]: 'Guest, ADMIN' }],
      ['a JSON-encoded role array string', { role: '["guest","Admin"]' }],
      ['nested role arrays', { roles: [['guest'], ['admin']] }],
    ])('recognises admin in %s', (_, payload) => {
      expect(isAdminToken(tokenWith(buildJwtWithPayload(payload)))).toBe(true);
    });

    it.each([
      ['a malformed JSON array string', { role: '[admin' }],
      ['an empty role', { role: '' }],
      ['a null role', { role: null }],
      ['a role that only contains admin as a substring', { role: 'administrator' }],
    ])('does not grant admin for %s', (_, payload) => {
      expect(isAdminToken(tokenWith(buildJwtWithPayload(payload)))).toBe(false);
    });

    it('returns false for opaque, empty and undecodable tokens', () => {
      expect(isAdminToken(tokenWith('opaque'))).toBe(false);
      expect(isAdminToken(tokenWith(''))).toBe(false);
      expect(isAdminToken(tokenWith('%%%.%%%.%%%'))).toBe(false);
      expect(isAdminToken(null as unknown as LoginResponse)).toBe(false);
    });
  });

  describe('getEmailFromToken', () => {
    it('returns the name claim', () => {
      expect(getEmailFromToken(tokenWith(buildJwtWithPayload({ [NAME_CLAIM]: 'a@b.nl' })))).toBe(
        'a@b.nl',
      );
    });

    it('returns an empty string when the claim is missing or the token is not a JWT', () => {
      expect(getEmailFromToken(tokenWith(buildJwtWithPayload({ sub: '1' })))).toBe('');
      expect(getEmailFromToken(tokenWith('opaque'))).toBe('');
      expect(getEmailFromToken(tokenWith('%%%.%%%.%%%'))).toBe('');
    });
  });

  describe('getUserIdFromToken', () => {
    it('prefers the nameidentifier claim over other identifiers', () => {
      const jwt = buildJwtWithPayload({ [NAME_IDENTIFIER_CLAIM]: ' 42 ', sub: 'sub-1', email: 'x@y.z' });
      expect(getUserIdFromToken(tokenWith(jwt))).toBe('42');
    });

    it.each([
      [{ oid: 'oid-1', sub: 'sub-1' }, 'oid-1'],
      [{ sub: 'sub-1', email: 'x@y.z' }, 'sub-1'],
      [{ userId: 7 }, '7'],
      [{ [NAME_CLAIM]: 'a@b.nl', email: 'x@y.z' }, 'a@b.nl'],
      [{ email: 'x@y.z' }, 'x@y.z'],
      [{ unique_name: 'erwin' }, 'erwin'],
    ])('falls back through the claim list (%o -> %s)', (payload, expected) => {
      expect(getUserIdFromToken(tokenWith(buildJwtWithPayload(payload)))).toBe(expected);
    });

    it('returns an empty string without any identifier claim or for non-JWT tokens', () => {
      expect(getUserIdFromToken(tokenWith(buildJwtWithPayload({ exp: 1 })))).toBe('');
      expect(getUserIdFromToken(tokenWith('opaque'))).toBe('');
      expect(getUserIdFromToken(tokenWith('%%%.%%%.%%%'))).toBe('');
    });
  });
});
