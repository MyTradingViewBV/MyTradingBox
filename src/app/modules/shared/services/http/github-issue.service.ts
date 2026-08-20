import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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
    return this.http.post<GitHubIssueResponse>(
      `${environment.apiUrl}api/feedback/issues`,
      { title: title || 'App Feedback', message },
    );
  }
}
