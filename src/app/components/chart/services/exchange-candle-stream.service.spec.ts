import { TestBed } from '@angular/core/testing';
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

  // The imported base class is aliased to a local before `extends`: when this spec shares a
  // bundled chunk with other stream specs, the Vitest SSR transform otherwise resolves the
  // heritage clause to `undefined` ("Class extends value undefined").
  function createTestStreamService(): BrowserExchangeCandleStreamService {
    const Base = BrowserExchangeCandleStreamService;
    class TestStreamService extends Base {
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
    return TestBed.runInInjectionContext(() => new TestStreamService());
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

      send(): void {
        // Outgoing frames are irrelevant for this test.
      }
      close(): void {
        // Nothing to release on the fake socket.
      }
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
    vi.useRealTimers();
    (globalThis as any).WebSocket = originalWebSocket;
  });

  it('waits for the current 1h seed before opening the live socket', async () => {
    const bucketStart = Date.UTC(2026, 8, 7, 16, 0, 0);
    // Pin "now" ten minutes into the 1h bucket the seed candles belong to. Spy on
    // Date.now only (the service reads the clock through it) so neither the
    // global Date nor the timers are replaced; the test setup restores mocks.
    vi.spyOn(Date, 'now').mockReturnValue(bucketStart + 10 * 60_000);
    const service = createTestStreamService();

    service.connectKlineStream('BTCUSDT', '1h');

    expect(webSocketCreated).toBe(0);

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
    // Let any microtasks / zero-delay timers scheduled by the seed handler run.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(webSocketCreated).toBe(1);
  });
});
