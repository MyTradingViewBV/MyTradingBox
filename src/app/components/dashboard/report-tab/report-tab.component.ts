import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { TranslateModule } from '@ngx-translate/core';
import { VersionService } from 'src/app/helpers/version.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import {
  CreatedIssue,
  GithubReportService,
  describeGithubError,
} from './github-report.service';
import {
  IssueKind,
  IssueMeta,
  NEW_TOKEN_URL,
  checkImage,
  clearToken,
  imageFromTransfer,
  imagePath,
  issueBody,
  issueTitle,
  labelFor,
  newIssueUrl,
  readAsDataUrl,
  readToken,
  saveToken,
  stripDataUrl,
} from './github-report';

interface PickedImage {
  file: File;
  dataUrl: string;
  name: string;
  sizeKb: number;
}

type SendState = 'idle' | 'sending' | 'done' | 'error';

/**
 * Report tab: create a GitHub bug/feature issue with an optional screenshot
 * (paste, drop or choose). With a token it posts straight to GitHub; without
 * one it opens GitHub's prefilled new-issue page and copies the image.
 */
@Component({
  selector: 'app-dashboard-report',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './report-tab.component.html',
  styleUrl: './report-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportTabComponent {
  private readonly _github = inject(GithubReportService);
  private readonly _versions = inject(VersionService);
  private readonly _destroyRef = inject(DestroyRef);
  private readonly _uiMode = toSignal(inject(SettingsService).getEffectiveUiMode(), {
    initialValue: 'web' as const,
  });

  readonly kind = signal<IssueKind>('bug');
  readonly title = signal('');
  readonly description = signal('');
  readonly image = signal<PickedImage | null>(null);
  readonly imageError = signal<'not-image' | 'too-large' | 'unreadable' | null>(null);
  readonly dragging = signal(false);
  readonly titleMissing = signal(false);

  readonly token = signal<string | null>(readToken());
  readonly login = signal<string | null>(null);
  readonly tokenInput = signal('');
  readonly tokenChecking = signal(false);
  readonly tokenError = signal<string | null>(null);
  readonly showTokenForm = signal(false);

  readonly state = signal<SendState>('idle');
  readonly created = signal<CreatedIssue | null>(null);
  readonly error = signal<string | null>(null);
  readonly copied = signal<'ok' | 'failed' | null>(null);
  private _version: string | null = null;

  /** Everything the template reads, precomputed (templates must not call methods). */
  readonly reportVm = computed(() => {
    const token = this.token();
    const state = this.state();
    const imageError = this.imageError();
    return {
      imageErrorKey: imageError
        ? `DASHBOARD.REPORT_IMAGE_${imageError.toUpperCase().replace('-', '_')}`
        : null,
      kind: this.kind(),
      title: this.title(),
      description: this.description(),
      image: this.image(),
      dragging: this.dragging(),
      titleMissing: this.titleMissing(),
      hasToken: !!token,
      login: this.login(),
      showTokenForm: this.showTokenForm() || !token,
      tokenInput: this.tokenInput(),
      tokenChecking: this.tokenChecking(),
      tokenError: this.tokenError(),
      sending: state === 'sending',
      done: state === 'done',
      created: this.created(),
      error: this.error(),
      copied: this.copied(),
      newTokenUrl: NEW_TOKEN_URL,
    };
  });

  constructor() {
    this._versions
      .loadLocalVersion()
      .then((v) => (this._version = v))
      .catch(() => undefined);
    const token = this.token();
    if (token) this.verifyToken(token, false);
  }

  // ---- image input --------------------------------------------------------

  /** Paste anywhere on the tab: an image in the clipboard becomes the screenshot. */
  @HostListener('document:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const file = imageFromTransfer(event.clipboardData);
    if (!file) return;
    // Keep normal text pasting into the fields working when text is present too.
    if (!event.clipboardData?.types.includes('text/plain')) event.preventDefault();
    void this.setImage(file);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = imageFromTransfer(event.dataTransfer);
    if (file) void this.setImage(file);
    else this.imageError.set('not-image');
  }

  onFileChosen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) void this.setImage(file);
    input.value = '';
  }

  removeImage(): void {
    this.image.set(null);
    this.imageError.set(null);
    this.copied.set(null);
  }

  async setImage(file: File): Promise<void> {
    const check = checkImage(file);
    if (check !== 'ok') {
      this.imageError.set(check);
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      this.image.set({
        file,
        dataUrl,
        name: file.name || 'screenshot.png',
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
      });
      this.imageError.set(null);
      this.copied.set(null);
    } catch {
      this.imageError.set('unreadable');
    }
  }

  // ---- token --------------------------------------------------------------

  saveTokenInput(): void {
    const token = this.tokenInput().trim();
    if (token) this.verifyToken(token, true);
  }

  forgetToken(): void {
    clearToken();
    this.token.set(null);
    this.login.set(null);
    this.tokenInput.set('');
    this.showTokenForm.set(false);
  }

  private verifyToken(token: string, store: boolean): void {
    this.tokenChecking.set(true);
    this.tokenError.set(null);
    this._github
      .whoAmI(token)
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (login) => {
          this.tokenChecking.set(false);
          this.login.set(login);
          if (store) {
            saveToken(token);
            this.token.set(token);
            this.tokenInput.set('');
            this.showTokenForm.set(false);
          }
        },
        error: (err) => {
          this.tokenChecking.set(false);
          this.tokenError.set(describeGithubError(err));
        },
      });
  }

  // ---- sending ------------------------------------------------------------

  /** Creates the issue directly on GitHub with the stored token. */
  submit(): void {
    const token = this.token();
    if (!token || !this.validate()) return;
    const image = this.image();
    const meta = this.meta();
    const description = this.description();
    this.state.set('sending');
    this.error.set(null);
    this._github
      .report(token, {
        title: issueTitle(this.kind(), this.title()),
        label: labelFor(this.kind()),
        body: (url) => issueBody(description, url, meta),
        image: image
          ? { path: imagePath(image.file.type, new Date()), base64: stripDataUrl(image.dataUrl) }
          : null,
      })
      .pipe(takeUntilDestroyed(this._destroyRef))
      .subscribe({
        next: (issue) => {
          this.created.set(issue);
          this.state.set('done');
        },
        error: (err) => {
          this.error.set(describeGithubError(err));
          this.state.set('error');
        },
      });
  }

  /** Fallback without a token: GitHub's prefilled page; the user pastes the image there. */
  openInGithub(): void {
    if (!this.validate()) return;
    const url = newIssueUrl(
      issueTitle(this.kind(), this.title()),
      issueBody(this.description(), null, this.meta()),
      labelFor(this.kind()),
    );
    window.open(url, '_blank', 'noopener');
  }

  /** Copies the screenshot (as PNG) so it can be pasted into GitHub's editor. */
  async copyImage(): Promise<void> {
    const image = this.image();
    if (!image) return;
    try {
      const png = image.file.type === 'image/png' ? image.file : await toPng(image.dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
      this.copied.set('ok');
    } catch {
      this.copied.set('failed');
    }
  }

  reset(): void {
    this.title.set('');
    this.description.set('');
    this.kind.set('bug');
    this.removeImage();
    this.titleMissing.set(false);
    this.created.set(null);
    this.error.set(null);
    this.state.set('idle');
  }

  private validate(): boolean {
    const ok = !!this.title().trim();
    this.titleMissing.set(!ok);
    return ok;
  }

  private meta(): IssueMeta {
    return {
      version: this._version,
      uiMode: this._uiMode(),
      userAgent: navigator.userAgent,
    };
  }
}

/** Browsers only accept PNG on the clipboard: redraw other formats. */
async function toPng(dataUrl: string): Promise<Blob> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.getContext('2d')?.drawImage(img, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG conversion failed'))), 'image/png'),
  );
}
