/**
 * Helpers for the Dashboard "Report" tab, which creates GitHub issues straight
 * from the browser. Testing-stage tool: the GitHub token is entered by the
 * user and kept in this device's localStorage, never in the app bundle.
 */

export const GITHUB_OWNER = 'MyTradingViewBV';
export const GITHUB_REPO = 'MyTradingBox';
export const GITHUB_API = 'https://api.github.com';
/** Screenshots are committed here so the default branch stays clean. */
export const IMAGE_BRANCH = 'issue-images';
export const IMAGE_FOLDER = 'issue-images';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const TOKEN_KEY = 'mtb.dashboard.githubToken';
export const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export type IssueKind = 'bug' | 'feature';

export interface IssueMeta {
  version: string | null;
  uiMode: string;
  userAgent: string;
}

export function labelFor(kind: IssueKind): string {
  return kind === 'bug' ? 'bug' : 'enhancement';
}

/** "[Bug] Chart freezes" – same prefixes as the old Settings feedback dialog. */
export function issueTitle(kind: IssueKind, title: string): string {
  const prefix = kind === 'bug' ? '[Bug]' : '[Feature]';
  return `${prefix} ${title.trim() || 'App feedback'}`;
}

export function issueBody(description: string, imageUrl: string | null, meta: IssueMeta): string {
  const parts: string[] = [];
  parts.push(description.trim() || '_No description._');
  if (imageUrl) parts.push(`![screenshot](${imageUrl})`);
  const version = meta.version ? `v${meta.version.replace(/^v/i, '')}` : 'unknown version';
  parts.push(`---\n_Sent from the MyTradingBox dashboard · ${version} · ${meta.uiMode} · ${meta.userAgent}_`);
  return parts.join('\n\n');
}

/** GitHub's prefilled "new issue" page, used when no token is configured. */
export function newIssueUrl(title: string, body: string, label: string): string {
  const params = new URLSearchParams({ title, body, labels: label });
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/new?${params.toString()}`;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/** issue-images/2026-10-20-183015-k3x9q2.png */
export function imagePath(type: string, now: Date, random = Math.random()): string {
  const ext = EXTENSIONS[type] ?? 'png';
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}-` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const suffix = random.toString(36).slice(2, 8).padEnd(6, '0');
  return `${IMAGE_FOLDER}/${stamp}-${suffix}.${ext}`;
}

/** Link that renders the committed image in the issue (also for private repos). */
export function imageUrl(path: string): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/${IMAGE_BRANCH}/${path}?raw=true`;
}

export type ImageCheck = 'ok' | 'not-image' | 'too-large';

export function checkImage(file: { type: string; size: number }): ImageCheck {
  if (!file.type.startsWith('image/')) return 'not-image';
  if (file.size > MAX_IMAGE_BYTES) return 'too-large';
  return 'ok';
}

/** First image in a paste or drop, if any. */
export function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return Array.from(data.files ?? []).find((f) => f.type.startsWith('image/')) ?? null;
}

export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    // Storage blocked: the token only lives for this visit.
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
}

/** "data:image/png;base64,AAAA" → "AAAA" */
export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(file);
  });
}
