import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GithubReportService, describeGithubError } from './github-report.service';

const REPO = 'https://api.github.com/repos/MyTradingViewBV/MyTradingBox';

describe('GithubReportService', () => {
  let service: GithubReportService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GithubReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sends the token only to GitHub, with the GitHub API headers', () => {
    let login = '';
    service.whoAmI('tok').subscribe((l) => (login = l));
    const req = http.expectOne('https://api.github.com/user');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok');
    expect(req.request.headers.get('Accept')).toBe('application/vnd.github+json');
    req.flush({ login: 'erwin' });
    expect(login).toBe('erwin');
  });

  it('creates the issue in one call, without touching repo contents', () => {
    let issue: { number: number } | undefined;
    service
      .report('tok', { title: '[Bug] T', label: 'bug', body: 'body' })
      .subscribe((i) => (issue = i));
    const req = http.expectOne(`${REPO}/issues`);
    expect(req.request.body).toEqual({ title: '[Bug] T', body: 'body', labels: ['bug'] });
    req.flush({ number: 7, html_url: 'https://github.com/x/7' });
    expect(issue?.number).toBe(7);
    // http.verify() in afterEach: no git/refs or contents requests were made.
  });
  it('retries without the label when GitHub rejects it', () => {
    let number = 0;
    service.createIssue('tok', 't', 'b', 'bug').subscribe((i) => (number = i.number));
    http
      .expectOne(`${REPO}/issues`)
      .flush({ message: 'Validation Failed' }, { status: 422, statusText: 'Unprocessable' });
    const retry = http.expectOne(`${REPO}/issues`);
    expect(retry.request.body).toEqual({ title: 't', body: 'b' });
    retry.flush({ number: 3, html_url: 'u' });
    expect(number).toBe(3);
  });

  it('stops on other errors', () => {
    let error: unknown;
    service.createIssue('tok', 't', 'b', 'bug').subscribe({ error: (e) => (error = e) });
    http.expectOne(`${REPO}/issues`).flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(describeGithubError(error)).toContain('invalid or expired');
  });
});

describe('describeGithubError', () => {
  const err = (status: number, error: unknown = null) =>
    new HttpErrorResponse({ status, error });

  it('explains the common failures', () => {
    expect(describeGithubError(err(0))).toContain('could not be reached');
    expect(describeGithubError(err(403))).toContain('needs Issues: read & write');
    expect(describeGithubError(err(404))).toContain('no access');
    expect(describeGithubError(err(500, { message: 'boom' }))).toBe('GitHub error 500: boom');
    expect(describeGithubError(new Error('x'))).toBe('x');
  });
});
