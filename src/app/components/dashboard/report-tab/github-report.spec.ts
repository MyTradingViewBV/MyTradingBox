import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  TOKEN_KEY,
  checkImage,
  clearToken,
  imageFromTransfer,
  issueBody,
  issueTitle,
  labelFor,
  newIssueUrl,
  readToken,
  saveToken,
} from './github-report';

const meta = { version: '0.1.233', uiMode: 'web', userAgent: 'TestAgent/1.0' };

describe('issue text', () => {
  it('prefixes the title and maps the label like the old Settings dialog', () => {
    expect(issueTitle('bug', '  Chart freezes ')).toBe('[Bug] Chart freezes');
    expect(issueTitle('feature', '')).toBe('[Feature] App feedback');
    expect(labelFor('bug')).toBe('bug');
    expect(labelFor('feature')).toBe('enhancement');
  });

  it('puts the description and a context footer in the body', () => {
    const body = issueBody('Steps to reproduce', meta);
    expect(body).toContain('Steps to reproduce');
    expect(body).toContain('v0.1.233 · web · TestAgent/1.0');
  });

  it('marks an empty description', () => {
    const body = issueBody('  ', { ...meta, version: null });
    expect(body).toContain('_No description._');
    expect(body).toContain('unknown version');
  });

  it('builds the prefilled GitHub new-issue link', () => {
    const url = new URL(newIssueUrl('[Bug] A & B', 'line 1\nline 2', 'bug'));
    expect(url.origin + url.pathname).toBe('https://github.com/MyTradingViewBV/MyTradingBox/issues/new');
    expect(url.searchParams.get('title')).toBe('[Bug] A & B');
    expect(url.searchParams.get('body')).toBe('line 1\nline 2');
    expect(url.searchParams.get('labels')).toBe('bug');
  });
});

describe('images', () => {
  it('accepts images up to 10 MB only', () => {
    expect(checkImage({ type: 'image/png', size: 1000 })).toBe('ok');
    expect(checkImage({ type: 'text/plain', size: 10 })).toBe('not-image');
    expect(checkImage({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe('too-large');
  });

  it('takes the first image from a paste or drop', () => {
    const png = new File(['x'], 'shot.png', { type: 'image/png' });
    const transfer = {
      items: [
        { kind: 'string', type: 'text/plain', getAsFile: () => null },
        { kind: 'file', type: 'image/png', getAsFile: () => png },
      ],
      files: [],
    } as unknown as DataTransfer;
    expect(imageFromTransfer(transfer)).toBe(png);
    expect(imageFromTransfer(null)).toBeNull();
    expect(
      imageFromTransfer({ items: [], files: [png] } as unknown as DataTransfer),
    ).toBe(png);
  });
});

describe('token storage', () => {
  afterEach(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  });

  it('saves (trimmed), reads and clears the token in sessionStorage only', () => {
    expect(readToken()).toBeNull();
    saveToken('  github_pat_x ');
    expect(readToken()).toBe('github_pat_x');
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('github_pat_x');
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    clearToken();
    expect(readToken()).toBeNull();
  });

  it('drops a token an older version left in localStorage', () => {
    localStorage.setItem(TOKEN_KEY, 'github_pat_old');
    expect(readToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });
});