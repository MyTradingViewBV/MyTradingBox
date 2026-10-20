import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of, switchMap, throwError } from 'rxjs';
import {
  GITHUB_API,
  GITHUB_OWNER,
  GITHUB_REPO,
  IMAGE_BRANCH,
  imageUrl,
} from './github-report';

export interface CreatedIssue {
  number: number;
  html_url: string;
}

export interface IssueRequest {
  title: string;
  body: (imageUrl: string | null) => string;
  label: string;
  image: { path: string; base64: string } | null;
}

const REPO = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

/**
 * Talks to the GitHub REST API directly with the user's own token. The API
 * interceptor only adds our session token to apiUrl requests, so nothing of
 * ours reaches GitHub.
 */
@Injectable({ providedIn: 'root' })
export class GithubReportService {
  private readonly _http = inject(HttpClient);

  /** Login of the token's owner; fails when the token is invalid. */
  whoAmI(token: string): Observable<string> {
    return this._http
      .get<{ login: string }>(`${GITHUB_API}/user`, { headers: headers(token) })
      .pipe(map((u) => u.login));
  }

  /** Upload the image (if any), then create the issue. */
  report(token: string, request: IssueRequest): Observable<CreatedIssue> {
    const image = request.image;
    const image$: Observable<string | null> = image
      ? this.ensureImageBranch(token).pipe(
          switchMap(() => this.uploadImage(token, image.path, image.base64)),
        )
      : of(null);
    return image$.pipe(
      switchMap((url) =>
        this.createIssue(token, request.title, request.body(url), request.label),
      ),
    );
  }

  /** Creates the screenshot branch from the default branch the first time. */
  ensureImageBranch(token: string): Observable<void> {
    const h = headers(token);
    return this._http.get(`${REPO}/git/ref/heads/${IMAGE_BRANCH}`, { headers: h }).pipe(
      map(() => undefined),
      catchError((err: HttpErrorResponse) => {
        if (err.status !== 404) return throwError(() => err);
        return this._http.get<{ default_branch: string }>(REPO, { headers: h }).pipe(
          switchMap((repo) =>
            this._http.get<{ object: { sha: string } }>(
              `${REPO}/git/ref/heads/${repo.default_branch}`,
              { headers: h },
            ),
          ),
          switchMap((ref) =>
            this._http.post(
              `${REPO}/git/refs`,
              { ref: `refs/heads/${IMAGE_BRANCH}`, sha: ref.object.sha },
              { headers: h },
            ),
          ),
          map(() => undefined),
        );
      }),
    );
  }

  /** Commits the image to the screenshot branch and returns a URL that renders it. */
  uploadImage(token: string, path: string, base64: string): Observable<string> {
    return this._http
      .put(
        `${REPO}/contents/${path}`,
        { message: `Add issue screenshot ${path}`, content: base64, branch: IMAGE_BRANCH },
        { headers: headers(token) },
      )
      .pipe(map(() => imageUrl(path)));
  }

  /** Creates the issue; retries without the label when the repo rejects it (422). */
  createIssue(token: string, title: string, body: string, label: string): Observable<CreatedIssue> {
    const url = `${REPO}/issues`;
    const h = headers(token);
    return this._http.post<CreatedIssue>(url, { title, body, labels: [label] }, { headers: h }).pipe(
      catchError((err: HttpErrorResponse) =>
        err.status === 422
          ? this._http.post<CreatedIssue>(url, { title, body }, { headers: h })
          : throwError(() => err),
      ),
    );
  }
}

function headers(token: string): HttpHeaders {
  return new HttpHeaders({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });
}

/** Short, user-facing explanation of a GitHub API failure. */
export function describeGithubError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    const apiMessage =
      err.error && typeof err.error === 'object' && 'message' in err.error
        ? String((err.error as { message: unknown }).message)
        : '';
    switch (err.status) {
      case 0:
        return 'GitHub could not be reached (offline or blocked).';
      case 401:
        return 'The GitHub token is invalid or expired.';
      case 403:
      case 404:
        return `The token has no access to ${GITHUB_OWNER}/${GITHUB_REPO} (needs Issues and Contents: read & write).`;
      default:
        return `GitHub error ${err.status}${apiMessage ? `: ${apiMessage}` : ''}`;
    }
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
