import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportTabComponent } from './report-tab.component';
import { GithubReportService } from './github-report.service';
import { TOKEN_KEY } from './github-report';
import { VersionService } from 'src/app/helpers/version.service';
import {
  installMatchMediaStub,
  provideComponentTestEnvironment,
} from 'src/testing/test-providers';

describe('ReportTabComponent', () => {
  let fixture: ComponentFixture<ReportTabComponent>;
  let component: ReportTabComponent;
  let github: { whoAmI: ReturnType<typeof vi.fn>; report: ReturnType<typeof vi.fn> };

  async function setup(token: string | null) {
    installMatchMediaStub();
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
    github = {
      whoAmI: vi.fn(() => of('erwin')),
      report: vi.fn(() => of({ number: 42, html_url: 'https://github.com/i/42' })),
    };
    await TestBed.configureTestingModule({
      imports: [ReportTabComponent],
      providers: [
        provideComponentTestEnvironment(),
        { provide: GithubReportService, useValue: github },
        { provide: VersionService, useValue: { loadLocalVersion: () => Promise.resolve('0.1.233') } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReportTabComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'shot.png', { type: 'image/png' });
  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

  afterEach(() => {
    localStorage.removeItem(TOKEN_KEY);
    vi.restoreAllMocks();
  });

  describe('without a token', () => {
    beforeEach(() => setup(null));

    it('asks for a token and offers the GitHub fallback', () => {
      expect(text()).toContain('DASHBOARD.REPORT_NOT_CONNECTED');
      expect(text()).toContain('DASHBOARD.REPORT_OPEN_GITHUB');
      expect(github.whoAmI).not.toHaveBeenCalled();
    });

    it('requires a title before opening GitHub', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      component.openInGithub();
      fixture.detectChanges();
      expect(open).not.toHaveBeenCalled();
      expect(text()).toContain('DASHBOARD.REPORT_TITLE_REQUIRED');
    });

    it('opens the prefilled new-issue page with title, body and label', () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      component.kind.set('feature');
      component.title.set('Dark candles');
      component.description.set('Please');
      component.openInGithub();
      const url = new URL(open.mock.calls[0][0] as string);
      expect(url.searchParams.get('title')).toBe('[Feature] Dark candles');
      expect(url.searchParams.get('labels')).toBe('enhancement');
      expect(url.searchParams.get('body')).toContain('Please');
    });

    it('verifies and stores a pasted token', () => {
      component.tokenInput.set(' github_pat_abc ');
      component.saveTokenInput();
      fixture.detectChanges();
      expect(github.whoAmI).toHaveBeenCalledWith('github_pat_abc');
      expect(localStorage.getItem(TOKEN_KEY)).toBe('github_pat_abc');
      expect(text()).toContain('@erwin');
    });

    it('does not store a token GitHub rejects', () => {
      github.whoAmI.mockReturnValue(throwError(() => new Error('Bad credentials')));
      component.tokenInput.set('bad');
      component.saveTokenInput();
      fixture.detectChanges();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(text()).toContain('Bad credentials');
    });
  });

  describe('images', () => {
    beforeEach(() => setup(null));

    it('takes an image pasted anywhere on the tab', async () => {
      const file = png();
      const event = new Event('paste') as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', {
        value: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }], files: [], types: ['Files'] },
      });
      document.dispatchEvent(event);
      await vi.waitFor(() => expect(component.image()?.file).toBe(file));
      fixture.detectChanges();
      expect(fixture.debugElement.query(By.css('.preview img'))).toBeTruthy();
    });

    it('rejects a dropped non-image', () => {
      const drop = new Event('drop') as DragEvent;
      Object.defineProperty(drop, 'dataTransfer', { value: { items: [], files: [] } });
      component.onDrop(drop);
      fixture.detectChanges();
      expect(text()).toContain('DASHBOARD.REPORT_IMAGE_NOT_IMAGE');
    });

    it('removes the chosen image', async () => {
      await component.setImage(png());
      component.removeImage();
      expect(component.image()).toBeNull();
    });
  });

  describe('with a token', () => {
    beforeEach(() => setup('github_pat_saved'));

    it('checks the stored token on open', () => {
      expect(github.whoAmI).toHaveBeenCalledWith('github_pat_saved');
      expect(text()).toContain('@erwin');
    });

    it('creates the issue with the screenshot and shows the link', async () => {
      await component.setImage(png());
      component.title.set('Chart freezes');
      component.description.set('After zooming');
      component.submit();
      fixture.detectChanges();

      const [token, request] = github.report.mock.calls[0];
      expect(token).toBe('github_pat_saved');
      expect(request.title).toBe('[Bug] Chart freezes');
      expect(request.label).toBe('bug');
      expect(request.image.path).toMatch(/^issue-images\/.+\.png$/);
      expect(request.body('https://img')).toContain('![screenshot](https://img)');
      expect(request.body('https://img')).toContain('v0.1.233');
      expect(text()).toContain('#42');
    });

    it('shows the error and the GitHub fallback when creating fails', () => {
      github.report.mockReturnValue(throwError(() => new Error('nope')));
      component.title.set('x');
      component.submit();
      fixture.detectChanges();
      expect(text()).toContain('nope');
      expect(text()).toContain('DASHBOARD.REPORT_OPEN_GITHUB_INSTEAD');
    });

    it('forgets the token', () => {
      component.forgetToken();
      fixture.detectChanges();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(text()).toContain('DASHBOARD.REPORT_NOT_CONNECTED');
    });
  });
});
