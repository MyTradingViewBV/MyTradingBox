import { extractExpiry, isTokenExpired } from './token-expiry.util';
import { LoginResponse } from '../models/login/loginResponse.dto';

function buildJwt(expSecondsFromNow: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + expSecondsFromNow;
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`; // signature dummy
}

describe('token-expiry.util', () => {
  it('extracts expiry from JWT exp claim', () => {
    const token = new LoginResponse();
    token.AccessToken = buildJwt(60); // 60s in future
    const { expiryTimestamp, source } = extractExpiry(token);
    expect(source).toBe('jwt-exp');
    expect(expiryTimestamp).toBeGreaterThan(Date.now());
  });

  it('falls back to ExpiresIn + CreatedAt when no JWT exp', () => {
    const token = new LoginResponse();
    token.AccessToken = 'not.a.jwt.token';
    token.CreatedAt = new Date();
    token.ExpiresIn = '30';
    const { expiryTimestamp, source } = extractExpiry(token);
    expect(source).toBe('expires-in');
    expect(expiryTimestamp).toBeGreaterThan(Date.now());
  });

  it('treats very large ExpiresIn as milliseconds (heuristic)', () => {
    const token = new LoginResponse();
    token.AccessToken = 'opaque';
    token.CreatedAt = new Date();
    token.ExpiresIn = '180000000'; // sample large value (~50h if ms)
  const { expiryTimestamp, source } = extractExpiry(token);
  expect(source).toBe('expires-in');
  expect(expiryTimestamp).toBeTruthy();
  const hoursApprox = ((expiryTimestamp as number) - Date.now()) / (1000 * 60 * 60);
    expect(hoursApprox).toBeGreaterThan(40); // should be ~50h range
    expect(hoursApprox).toBeLessThan(1000); // sanity guard (not years)
  });

  it('isTokenExpired returns true for expired JWT', () => {
    const expired = new LoginResponse();
    // exp 10s in past
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const pastExp = Math.floor(Date.now() / 1000) - 10;
    const payload = btoa(JSON.stringify({ exp: pastExp }));
    expired.AccessToken = `${header}.${payload}.sig`;
    expect(isTokenExpired(expired)).toBeTrue();
  });

  it('isTokenExpired returns false when expiry cannot be determined', () => {
    const token = new LoginResponse();
    token.AccessToken = 'opaque';
    // No ExpiresIn set
    expect(isTokenExpired(token)).toBeFalse();
  });
});
