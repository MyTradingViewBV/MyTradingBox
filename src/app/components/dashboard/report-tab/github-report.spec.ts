import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_IMAGE_BYTES,
  TOKEN_KEY,
  checkImage,
  clearToken,
  imageFromTransfer,
  imagePath,
  imageUrl,
  issueBody,
  issueTitle,
  labelFor,
  newIssueUrl,
  readToken,
  saveToken,
  stripDataUrl,
} from './github-report';

const meta = { version: '0.1.233', uiMode: 'web', userAgent: 'TestAgent/1.0' };

describe('issue text', () => {
  it('prefixes the title and maps the label like the old Settings dialog', () => {
    expect(issueTitle('bug', '  Chart freezes ')).toBe('[Bug] Chart freezes');
    expect(issueTitle('feature', '')).toBe('[Feature] App feedback');
    expect(labelFor('bug')).toBe('bug');
    expect(labelFor('feature')).toBe('enhancement');
  });

  it('puts description, inline screenshot and a context footer in the body', () => {
    const body = issueBody('Steps to reproduce', 'https://img/x.png', meta);
    expect(body).toContain('Steps to reproduce');
    expect(body).toContain('![screenshot](https://img/x.png)');
    expect(body).toContain('v0.1.233 · web · TestAgent/1.0');
  });

  it('marks an empty description and leaves out the image when there is none', () => {
    const body = issueBody('  ', null, { ...meta, version: null });
    expect(body).toContain('_No description._');
    expect(body).not.toContain('![screenshot]');
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
  it('names screenshots by UTC time with the right extension', () => {
    const now = new Date(Date.UTC(2026, 9, 20, 18, 30, 15));
    expect(imagePath('image/jpeg', now, 0.5)).toMatch(/^issue-images\/2026-10-20-183015-[a-z0-9]{6}\.jpg$/);
    expect(imagePath('image/x-unknown', now, 0.5)).toMatch(/\.png$/);
  });

  it('links the committed file on the screenshot branch', () => {
    expect(imageUrl('issue-images/a.png')).toBe(
      'https://github.com/MyTradingViewBV/MyTradingBox/blob/issue-images/issue-images/a.png?raw=true',
    );
  });

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

  it('strips the data-URL prefix', () => {
    expect(stripDataUrl('data:image/png;base64,QUJD')).toBe('QUJD');
  });
});

describe('token storage', () => {
  afterEach(() => localStorage.removeItem(TOKEN_KEY));

  it('saves (trimmed), reads and clears the token', () => {
    expect(readToken()).toBeNull();
    saveToken('  github_pat_x ');
    expect(readToken()).toBe('github_pat_x');
    clearToken();
    expect(readToken()).toBeNull();
  });
});
