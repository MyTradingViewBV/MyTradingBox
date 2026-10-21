/**
 * Helpers for the Dashboard "Report" tab, which creates GitHub issues straight
 * from the browser. Testing-stage tool: the GitHub token is entered by the
 * user, needs Issues access only and lives in sessionStorage (this tab, until
 * logout), never in localStorage or the app bundle. Screenshots are not
 * uploaded: that needed Contents write access and put them in the public repo.
 */

export const GITHUB_OWNER = 'MyTradingViewBV';
export const GITHUB_REPO = 'MyTradingBox';
export const GITHUB_API = 'https://api.github.com';
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

export function issueBody(description: string, meta: IssueMeta): string {
  const parts: string[] = [];
  parts.push(description.trim() || '_No description._');
  const version = meta.version ? `v${meta.version.replace(/^v/i, '')}` : 'unknown version';
  parts.push(`---\n_Sent from the MyTradingBox dashboard · ${version} · ${meta.uiMode} · ${meta.userAgent}_`);
  return parts.join('\n\n');
}

/** GitHub's prefilled "new issue" page, used when no token is configured. */
export function newIssueUrl(title: string, body: string, label: string): string {
  const params = new URLSearchParams({ title, body, labels: label });
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/issues/new?${params.toString()}`;
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
    // Older versions kept a Contents-write token in localStorage: drop it.
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Nothing stored.
  }
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    // Storage blocked: the token only lives while the tab is open.
  }
}

/** Also called on logout, so the next user of the device never inherits it. */
export function clearToken(): void {
  for (const storage of [() => sessionStorage, () => localStorage]) {
    try {
      storage().removeItem(TOKEN_KEY);
    } catch {
      // Nothing stored.
    }
  }
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the image'));
    reader.readAsDataURL(file);
  });
}
