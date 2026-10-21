import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { GITHUB_API, GITHUB_OWNER, GITHUB_REPO } from './github-report';

export interface CreatedIssue {
  number: number;
  html_url: string;
}

export interface IssueRequest {
  title: string;
  body: string;
  label: string;
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

  /** Creates the issue; Issues access is all the token needs. */
  report(token: string, request: IssueRequest): Observable<CreatedIssue> {
    return this.createIssue(token, request.title, request.body, request.label);
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
        return `The token has no access to ${GITHUB_OWNER}/${GITHUB_REPO} (needs Issues: read & write).`;
      default:
        return `GitHub error ${err.status}${apiMessage ? `: ${apiMessage}` : ''}`;
    }
  }
  return err instanceof Error ? err.message : 'Unknown error';
}
