import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeartbeatService } from './heartbeat.service';
import { BotHeartbeat } from '../models/bot-heartbeat.model';
import { environment } from 'src/environments/environment';

function heartbeat(overrides: Partial<BotHeartbeat>): BotHeartbeat {
  return {
    Id: 1,
    BotName: 'bot',
    ExchangeId: 1,
    HeartbeatReceived: true,
    HeartbeatReceivedAt: null,
    MessageSent: true,
    MessageSentAt: null,
    MessageReceived: true,
    MessageReceivedAt: null,
    LastUpdated: '2026-01-01T00:00:00Z',
    HeartbeatReceivedColor: 0,
    MessageSentColor: 0,
    MessageReceivedColor: 0,
    ...overrides,
  };
}

describe('HeartbeatService', () => {
  let service: HeartbeatService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HeartbeatService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('starts with an empty list', async () => {
    expect(await firstValueFrom(service.items$)).toEqual([]);
  });

  it('loads heartbeats for an exchange and sorts failed bots first, then most recent', async () => {
    service.load(7);

    http
      .expectOne(`${environment.apiUrl}BotHeartbeat?exchangeId=7`)
      .flush([
        heartbeat({
          Id: 1,
          BotName: 'old-ok',
          LastUpdated: '2026-01-01T00:00:00Z',
        }),
        heartbeat({
          Id: 2,
          BotName: 'new-ok',
          LastUpdated: '2026-01-02T00:00:00Z',
        }),
        heartbeat({ Id: 3, BotName: 'failing', MessageSent: false }),
      ]);

    const items = await firstValueFrom(service.items$);
    expect(items.map((i) => i.name)).toEqual(['failing', 'new-ok', 'old-ok']);
    expect(items[0]).toMatchObject({
      id: '3',
      kind: 'bot',
      ok: false,
      messageSent: false,
    });
  });

  it('resets to an empty list when the request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    service.load(1);

    http
      .expectOne(`${environment.apiUrl}BotHeartbeat?exchangeId=1`)
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(await firstValueFrom(service.items$)).toEqual([]);
  });
});
