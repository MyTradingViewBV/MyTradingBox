/** Release data as generated into assets/release-notes.mock.json at deploy time. */
export interface ReleaseEntry {
  title: string;
  summary: string;
}

export interface ReleaseVersion {
  version: string;
  date: string;
  /** Deploy moment as an ISO instant; missing in data generated before it existed. */
  timestamp?: string;
  tag: string;
  entries: ReleaseEntry[];
}

export type ChangeKind = 'new' | 'fixed' | 'improved';

export interface ChangeGroup {
  kind: ChangeKind;
  items: string[];
}

export interface FriendlyRelease {
  version: string;
  date: string;
  timestamp?: string;
  groups: ChangeGroup[];
  count: number;
}

const KIND_ORDER: ChangeKind[] = ['new', 'fixed', 'improved'];

/** Labels the generator gives developer-only work; users never notice these. */
const HIDDEN_SUMMARIES = /^(maintenance|documentation|testing)$/i;

/**
 * Titles that only make sense to a developer (code names, tooling, release
 * bookkeeping). The generator already drops typed chores; these slip through
 * as plain commit subjects.
 */
const DEVELOPER_JARGON = [
  /^release\s+v?\d/i,
  /^(create|update|wip|cleanup|tweak|misc)\.?$/i,
  /\b(service|component|spec|specs|tests?|lint|eslint|tsc|refactor|crud|methods?|util|utility|renderer|template call|layer state|puts?|gets?|endpoint|dto|store|reducer|pipe|parity (log|doc)|docs?|readme|cache|deps|dependencies)\b/i,
  // Code identifiers such as cancelPenStroke or ExtendRight.
  /\b[a-z]+[A-Z][A-Za-z]*\b|\b[A-Z][a-z]+[A-Z][a-z]+[A-Za-z]*\b/,
];

/** Whether a change title reads as something a user would notice. */
export function isUserFacing(title: string): boolean {
  return !DEVELOPER_JARGON.some((re) => re.test(title));
}

/** "Add fixed range tool" → "Fixed range tool": the New heading already says it was added. */
export function tidyTitle(title: string, kind: ChangeKind): string {
  const trimmed = title.trim().replace(/\.$/, '');
  if (kind !== 'new') return trimmed;
  const rest = trimmed.replace(/^(add|added|adds|introduce|introduced)\s+/i, '');
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export function kindOf(summary: string): ChangeKind | null {
  const s = summary.trim();
  if (HIDDEN_SUMMARIES.test(s)) return null;
  if (/^new/i.test(s)) return 'new';
  if (/fix/i.test(s)) return 'fixed';
  return 'improved';
}

/**
 * Turns raw release data into user-facing releases: developer-only entries
 * and jargon are dropped, "Add …" is trimmed from new items, duplicates are
 * removed, and changes are grouped New → Fixed → Improved.
 * Releases with nothing left are skipped.
 */
export function toFriendlyReleases(releases: ReleaseVersion[]): FriendlyRelease[] {
  const result: FriendlyRelease[] = [];
  for (const release of releases ?? []) {
    const buckets = new Map<ChangeKind, string[]>();
    const seen = new Set<string>();
    for (const entry of release.entries ?? []) {
      const kind = kindOf(entry.summary ?? '');
      const raw = (entry.title ?? '').trim();
      if (!kind || !raw || !isUserFacing(raw)) continue;
      const title = tidyTitle(raw, kind);
      const key = title.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const list = buckets.get(kind) ?? [];
      list.push(title);
      buckets.set(kind, list);
    }
    const groups = KIND_ORDER.filter((k) => buckets.has(k)).map((kind) => ({
      kind,
      items: buckets.get(kind)!,
    }));
    const count = groups.reduce((n, g) => n + g.items.length, 0);
    if (count) {
      result.push({
        version: release.version,
        date: release.date,
        timestamp: release.timestamp,
        groups,
        count,
      });
    }
  }
  return result;
}

/**
 * Deploy moment in the device's own time zone (never UTC), with date and time
 * in the app language. Empty when the timestamp is missing or unreadable.
 */
export function formatReleaseTime(timestamp: string | undefined, lang: string): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/** Compares "v0.2.75"-style versions numerically. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * Releases newer than the last one the user saw. On a first visit (nothing
 * stored) only the latest release counts as new.
 */
export function unseenVersions(releases: FriendlyRelease[], lastSeen: string | null): Set<string> {
  if (!releases.length) return new Set();
  if (!lastSeen) return new Set([releases[0].version]);
  return new Set(
    releases.filter((r) => compareVersions(r.version, lastSeen) > 0).map((r) => r.version),
  );
}

export const LAST_SEEN_KEY = 'mtb.dashboard.lastSeenRelease';

export function readLastSeen(): string | null {
  try {
    return localStorage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function writeLastSeen(version: string): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, version);
  } catch {
    // Storage blocked (private mode): the "new" badges simply show again next time.
  }
}
