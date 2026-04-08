import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GithubIssueService } from 'src/app/modules/shared/services/http/github-issue.service';
import { TranslateModule } from '@ngx-translate/core';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  selector: 'app-github-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './github-feedback.component.html',
  styleUrl: './github-feedback.component.scss',
})
export class GithubFeedbackComponent {
  private githubIssueService = inject(GithubIssueService);

  isOpen = false;
  title = '';
  message = '';
  loading = false;
  submitted = false;
  error = '';
  debugLogs: string[] = [];
  manualIssueUrl = '';

  openDialog(): void {
    this.isOpen = true;
    this.title = '';
    this.message = '';
    this.loading = false;
    this.submitted = false;
    this.error = '';
    this.debugLogs = [];
    this.manualIssueUrl = '';
  }

  closeDialog(): void {
    this.isOpen = false;
  }

  submit(): void {
    if (!this.message.trim()) {
      this.error = 'Message is required';
      this.debugLogs = ['Validation failed: message is empty'];
      return;
    }

    this.loading = true;
    this.error = '';
    this.debugLogs = [];
    this.manualIssueUrl = '';

    const finalTitle = this.title.trim() || 'App Feedback';
    this.manualIssueUrl = this.buildManualIssueUrl(finalTitle, this.message);

    this.githubIssueService.createIssue(finalTitle, this.message).subscribe({
      next: (response) => {
        this.loading = false;
        this.submitted = true;
        console.log('[GithubFeedback] Issue created:', response.html_url);
        setTimeout(() => {
          this.closeDialog();
        }, 2000);
      },
      error: (err) => {
        this.loading = false;
        this.error = 'Failed to create issue. You can use the manual GitHub issue link below.';
        this.debugLogs = this.buildDebugLogs(err);
        console.error('[GithubFeedback] Error creating issue:', err);
      },
    });
  }

  private buildManualIssueUrl(title: string, message: string): string {
    const encodedTitle = encodeURIComponent(title || 'App Feedback');
    const encodedBody = encodeURIComponent(message || '');
    return `https://github.com/MyTradingViewBV/MyTradingBox/issues/new?title=${encodedTitle}&body=${encodedBody}`;
  }

  private buildDebugLogs(err: unknown): string[] {
    const logs: string[] = [];

    if (err instanceof HttpErrorResponse) {
      logs.push(`HTTP ${err.status} ${err.statusText || ''}`.trim());
      logs.push(`Request URL: ${err.url || 'unknown'}`);

      if (typeof err.error === 'string' && err.error.trim()) {
        logs.push(`Body: ${err.error}`);
      } else if (err.error && typeof err.error === 'object') {
        try {
          logs.push(`Body: ${JSON.stringify(err.error)}`);
        } catch {
          logs.push('Body: [unserializable object]');
        }
      } else if (err.message) {
        logs.push(`Message: ${err.message}`);
      }

      if (err.status === 504) {
        logs.push('Hint: 504 usually means an upstream proxy/gateway timeout between browser and api.github.com.');
      }

      return logs;
    }

    if (err instanceof Error) {
      logs.push(`Error: ${err.message}`);
      const maybeHttp = err as Error & { status?: number; statusText?: string; url?: string; error?: unknown };
      if (typeof maybeHttp.status === 'number') {
        logs.push(`Status: ${maybeHttp.status} ${maybeHttp.statusText || ''}`.trim());
      }
      if (maybeHttp.url) {
        logs.push(`Request URL: ${maybeHttp.url}`);
      }
      if (maybeHttp.error) {
        try {
          logs.push(`Payload: ${JSON.stringify(maybeHttp.error)}`);
        } catch {
          logs.push('Payload: [unserializable object]');
        }
      }
      return logs;
    }

    try {
      logs.push(`Unknown error: ${JSON.stringify(err)}`);
    } catch {
      logs.push(`Unknown error: ${String(err)}`);
    }
    return logs;
  }
}
