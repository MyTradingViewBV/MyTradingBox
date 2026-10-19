import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TranslateModule } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemStatusComponent, mapBotStatuses } from './system-status.component';
import { BotHeartbeat } from '../../admin/models/bot-heartbeat.model';
import { AppService } from '../../../modules/shared/services/services/appService';
import { environment } from 'src/environments/environment';

function heartbeat(overrides: Partial<BotHeartbeat>): BotHeartbeat {
  return {
    Id: 1,
    BotName: 'bot',
    ExchangeId: 1,
    HeartbeatReceived: true,
    HeartbeatReceivedAt: '2026-01-01T00:00:00Z',
    MessageSent: true,
    MessageSentAt: null,
    MessageReceived: true,
    MessageReceivedAt: null,
    LastUpdated: null,
    HeartbeatReceivedColor: 0,
    MessageSentColor: 0,
    MessageReceivedColor: 0,
    ...overrides,
  };
}

describe('mapBotStatuses', () => {
  it('merges rows per bot, marks a bot offline if any row is not green, offline first', () => {
    const result = mapBotStatuses([
      heartbeat({ BotName: 'CandlesBot' }),
      heartbeat({ BotName: 'LevelsBot', ExchangeId: 1 }),
      heartbeat({
        BotName: 'LevelsBot',
        ExchangeId: 2,
        HeartbeatReceivedColor: 2,
        HeartbeatReceivedAt: '2026-01-02T00:00:00Z',
      }),
    ]);
    expect(result.map((b) => [b.name, b.online])).toEqual([
      ['LevelsBot', false],
      ['CandlesBot', true],
    ]);
    expect(result[0].lastSeen?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('SystemStatusComponent', () => {
  let http: HttpTestingController;
  let router: { navigate: ReturnType<typeof vi.fn> };

  let fixture: ReturnType<typeof TestBed.createComponent<SystemStatusComponent>>;

  function create(isAdmin: boolean) {
    TestBed.configureTestingModule({
      imports: [SystemStatusComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AppService, useValue: { isAdmin: () => of(isAdmin) } },
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SystemStatusComponent);
    fixture.componentRef.setInput('exchangeId', 3);
    fixture.detectChanges();
    TestBed.tick();
    return fixture.componentInstance;
  }

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
  });

  beforeEach(() => {
    TestBed.resetTestingModule();
    router = { navigate: vi.fn().mockResolvedValue(true) };
  });

  it('loads bot heartbeats for admins once the API answers', () => {
    const cmp = create(true);
    http.expectOne(`${environment.apiUrl}Exchanges`).flush('[]');
    http
      .expectOne(`${environment.apiUrl}BotHeartbeat?exchangeId=3`)
      .flush([heartbeat({ BotName: 'FibsBot', HeartbeatReceivedColor: 2 })]);
    expect(cmp.apiStatus()).toBe('ONLINE');
    expect(cmp.botsStatus()).toBe('OFFLINE');
    expect(cmp.offlineBots().map((b) => b.name)).toEqual(['FibsBot']);
  });

  it('marks the API offline on a network error and skips bots', () => {
    const cmp = create(true);
    http.expectOne(`${environment.apiUrl}Exchanges`).error(new ProgressEvent('error'));
    expect(cmp.apiStatus()).toBe('OFFLINE');
    expect(cmp.botList()).toBeNull();
  });

  it('does not call the admin-only heartbeat endpoint for normal users', () => {
    const cmp = create(false);
    http.expectOne(`${environment.apiUrl}Exchanges`).flush('', { status: 401, statusText: 'Unauthorized' });
    expect(cmp.apiStatus()).toBe('ONLINE');
    expect(cmp.isAdmin()).toBe(false);
  });

  it('checks the API but skips heartbeats while the exchange is not known yet', () => {
    const cmp = create(true);
    http.expectOne(`${environment.apiUrl}Exchanges`).flush('[]');
    http.expectOne(`${environment.apiUrl}BotHeartbeat?exchangeId=3`).flush([heartbeat({})]);

    fixture.componentRef.setInput('exchangeId', null);
    fixture.detectChanges();
    TestBed.tick();
    http.expectOne(`${environment.apiUrl}Exchanges`).flush('[]');
    http.expectNone((req) => req.url.includes('BotHeartbeat'));
    expect(cmp.apiStatus()).toBe('ONLINE');
    expect(cmp.botList()).toBeNull();
  });

  it('opens the heartbeat overview on click for admins', () => {
    create(true);
    http.expectOne(`${environment.apiUrl}Exchanges`).flush('[]');
    http.expectOne(`${environment.apiUrl}BotHeartbeat?exchangeId=3`).flush([heartbeat({})]);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button.status-pill')!.click();

    expect(router.navigate).toHaveBeenCalledWith(['/admin'], { queryParams: { section: 'heartbeat' } });
  });

  it('is not clickable for normal users', () => {
    create(false);
    http.expectOne(`${environment.apiUrl}Exchanges`).flush('[]');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('button')).toBeNull();
    expect(el.querySelector('.status-pill')).not.toBeNull();
  });
});
