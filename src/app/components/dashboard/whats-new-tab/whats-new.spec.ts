import { afterEach, describe, expect, it } from 'vitest';
import {
  LAST_SEEN_KEY,
  ReleaseVersion,
  compareVersions,
  formatReleaseTime,
  kindOf,
  readLastSeen,
  toFriendlyReleases,
  unseenVersions,
  writeLastSeen,
} from './whats-new';

const release = (version: string, entries: [string, string][]): ReleaseVersion => ({
  version,
  date: 'October 20, 2026',
  tag: '',
  entries: entries.map(([title, summary]) => ({ title, summary })),
});

describe('kindOf', () => {
  it('maps generator labels to user-facing kinds and hides developer work', () => {
    expect(kindOf('New feature')).toBe('new');
    expect(kindOf('Bug fix')).toBe('fixed');
    expect(kindOf('Improvement')).toBe('improved');
    expect(kindOf('Maintenance')).toBeNull();
    expect(kindOf('Documentation')).toBeNull();
    expect(kindOf('Testing')).toBeNull();
  });
});

describe('toFriendlyReleases', () => {
  it('groups New → Fixed → Improved, removes duplicates and hidden entries', () => {
    const [r] = toFriendlyReleases([
      release('v0.2.75', [
        ['Faster chart', 'Improvement'],
        ['Volume profile', 'Bug fix'],
        ['Dashboard', 'New feature'],
        ['faster chart', 'Improvement'],
        ['Bump deps', 'Maintenance'],
      ]),
    ]);
    expect(r.groups.map((g) => g.kind)).toEqual(['new', 'fixed', 'improved']);
    expect(r.groups[2].items).toEqual(['Faster chart']);
    expect(r.count).toBe(3);
  });

  it('drops developer jargon and trims "Add" from new items', () => {
    const [r] = toFriendlyReleases([
      release('v0.2.75', [
        ['Add fixed-volume-profile range tool with band preview', 'New feature'],
        ['Add Fixed Volume Profile CRUD methods to ChartService', 'New feature'],
        ['Create', 'New feature'],
        ['Not a template call', 'Improvement'],
        ['Release v0.2.72', 'Improvement'],
        ['Stabilize the cache', 'Improvement'],
        ['Add cancelPenStroke to drop a pen stroke', 'New feature'],
        ['Align ExtendRight with the bot', 'Improvement'],
        ['Legend icon via the symbolIconSrc pipe', 'Improvement'],
        ['Axis scaling while drawing', 'Improvement'],
        ['Sharp chart header on iOS and iPhone', 'Improvement'],
      ]),
    ]);
    expect(r.groups).toEqual([
      { kind: 'new', items: ['Fixed-volume-profile range tool with band preview'] },
      { kind: 'improved', items: ['Axis scaling while drawing', 'Sharp chart header on iOS and iPhone'] },
    ]);
  });

  it('skips releases with only developer work', () => {
    expect(toFriendlyReleases([release('v1', [['Docs', 'Documentation']])])).toEqual([]);
  });

  it('tolerates missing data', () => {
    expect(toFriendlyReleases(null as unknown as ReleaseVersion[])).toEqual([]);
  });
});

describe('compareVersions / unseenVersions', () => {
  const list = toFriendlyReleases([
    release('v0.2.10', [['A', 'Improvement']]),
    release('v0.2.9', [['B', 'Improvement']]),
    release('v0.2.8', [['C', 'Improvement']]),
  ]);

  it('compares numerically, not as text', () => {
    expect(compareVersions('v0.2.10', 'v0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('0.2.9', 'v0.2.9')).toBe(0);
  });

  it('marks only the latest release on a first visit', () => {
    expect([...unseenVersions(list, null)]).toEqual(['v0.2.10']);
  });

  it('marks every release newer than the last seen one', () => {
    expect([...unseenVersions(list, 'v0.2.8')]).toEqual(['v0.2.10', 'v0.2.9']);
    expect(unseenVersions(list, 'v0.2.10').size).toBe(0);
  });
});

describe('last seen storage', () => {
  afterEach(() => localStorage.removeItem(LAST_SEEN_KEY));

  it('round-trips the last seen version', () => {
    expect(readLastSeen()).toBeNull();
    writeLastSeen('v0.2.75');
    expect(readLastSeen()).toBe('v0.2.75');
  });
});

describe('formatReleaseTime', () => {
  const ts = '2026-10-20T19:58:19.000Z';

  it('shows the deploy moment in the device time zone, not UTC', () => {
    const local = new Date(ts);
    const text = formatReleaseTime(ts, 'en');
    expect(text).toContain(String(local.getDate()));
    expect(text).toContain(String(local.getMinutes()).padStart(2, '0'));
    expect(text).not.toMatch(/UTC|GMT|Z$/);
  });

  it('is empty for missing or unreadable timestamps', () => {
    expect(formatReleaseTime(undefined, 'en')).toBe('');
    expect(formatReleaseTime('not a date', 'en')).toBe('');
  });
});

describe('toFriendlyReleases timestamp', () => {
  it('keeps the deploy timestamp', () => {
    const [r] = toFriendlyReleases([
      { ...release('v1.0.0', [['Dark mode', 'New feature']]), timestamp: '2026-10-20T19:58:19.000Z' },
    ]);
    expect(r.timestamp).toBe('2026-10-20T19:58:19.000Z');
  });
});
