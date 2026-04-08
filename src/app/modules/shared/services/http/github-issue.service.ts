import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

interface GitHubIssueResponse {
  id: number;
  number: number;
  title: string;
  html_url: string;
}

@Injectable({ providedIn: 'root' })
export class GithubIssueService {
  private http = inject(HttpClient);

  createIssue(title: string, message: string): Observable<GitHubIssueResponse> {
    const github = environment.github;
    if (!github) {
      throw new Error('GitHub config not found in environment');
    }

    const url = `https://api.github.com/repos/${github.owner}/${github.repo}/issues`;

    const headers = new HttpHeaders({
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${github.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Skip-Auth': 'true',
    });

    const body = {
      title: title || 'App Feedback',
      body: message,
      labels: ['app-feedback'],
    };

    return this.http.post<GitHubIssueResponse>(url, body, { headers });
  }
}
