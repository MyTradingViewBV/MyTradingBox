import { TestBed } from '@angular/core/testing';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { NotificationService } from './notification.service';
import { SwUpdateService } from './sw-update.service';
import { ToastMessage, ToastService } from './toast.service';

describe('SwUpdateService errors', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<UnrecoverableStateEvent>;
  let notify: ReturnType<typeof vi.fn>;
  let toasts: ToastMessage[];

  beforeEach(() => {
    versionUpdates = new Subject();
    unrecoverable = new Subject();
    notify = vi.fn().mockResolvedValue(undefined);
    toasts = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SwUpdate,
          useValue: {
            isEnabled: true,
            versionUpdates,
            unrecoverable,
            checkForUpdate: vi.fn().mockResolvedValue(false),
            activateUpdate: vi.fn().mockResolvedValue(true),
          },
        },
        { provide: NotificationService, useValue: { requestAndShow: notify } },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    });
    TestBed.inject(ToastService).toast$.subscribe((t) => toasts.push(t));
    TestBed.inject(SwUpdateService);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('a failed installation is only logged: no system notification, no toast', () => {
    versionUpdates.next({
      type: 'VERSION_INSTALLATION_FAILED',
      version: { hash: 'abc' },
      error: 'Hash mismatch',
    } as VersionEvent);
    expect(notify).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
    expect(console.warn).toHaveBeenCalled();
  });

  it('an unrecoverable state asks in the app to reload (sticky toast with a reload action)', () => {
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'gone' });
    expect(notify).not.toHaveBeenCalled();
    expect(toasts.length).toBe(1);
    expect(toasts[0]).toMatchObject({ text: 'APP_UPDATE.BROKEN', type: 'warning', duration: 0 });
    expect(toasts[0].action?.label).toBe('APP_UPDATE.RELOAD');
  });
});
