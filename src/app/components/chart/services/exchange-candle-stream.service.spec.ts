import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import {
  BrowserExchangeCandleStreamService,
  ParsedStreamCandle,
} from './exchange-candle-stream.service';

describe('BrowserExchangeCandleStreamService', () => {
  let seedResponses: Subject<any[]>;
  let webSocketCreated: number;
  let originalWebSocket: typeof WebSocket | undefined;

  class TestStreamService extends BrowserExchangeCandleStreamService {
    override readonly exchangeName = 'TEST';

    protected override getSocketUrl(): string {
      return 'ws://example.test';
    }

    protected override getSubscribeMessage(): unknown | null {
      return null;
    }

    protected override parseMessage(): ParsedStreamCandle[] {
      return [];
    }
  }

  beforeEach(() => {
    seedResponses = new Subject<any[]>();
    webSocketCreated = 0;
    originalWebSocket = globalThis.WebSocket;

    (globalThis as any).WebSocket = class {
      public onopen: (() => void) | null = null;
      public onclose: (() => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;

      constructor() {
        webSocketCreated += 1;
      }

      send(): void {}
      close(): void {}
    };

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ChartService,
          useValue: {
            getCandles: vi.fn().mockReturnValue(seedResponses.asObservable()),
          },
        },
      ],
    });
  });

  afterEach(() => {
    (globalThis as any).WebSocket = originalWebSocket;
  });

  it('waits for the current 1h seed before opening the live socket', fakeAsync(() => {
    const service = TestBed.runInInjectionContext(() => new TestStreamService());

    service.connectKlineStream('BTCUSDT', '1h');

    expect(webSocketCreated).toBe(0);

    const bucketStart = Date.UTC(2026, 8, 7, 16, 0, 0);
    seedResponses.next(
      Array.from({ length: 10 }, (_, minute) => ({
        Time: new Date(bucketStart + minute * 60_000).toISOString(),
        Open: 100 + minute,
        High: 101 + minute,
        Low: 99 + minute,
        Close: 100 + minute + 1,
        Volume: 10 + minute,
      })),
    );
    tick();

    expect(webSocketCreated).toBe(1);
  }));
});
