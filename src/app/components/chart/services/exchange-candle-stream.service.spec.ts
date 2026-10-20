import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
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
  it('rebuilds a late-day 1d bucket from closed hours + minutes (backend serves closed candles only)', async () => {
    const dayStart = Date.UTC(2026, 9, 20);
    const now = dayStart + (19 * 60 + 18) * 60_000; // 19:18 UTC: 1158 minutes, too many for 1m seeding
    vi.spyOn(Date, 'now').mockReturnValue(now);

    let socket: any = null;
    (globalThis as any).WebSocket = class {
      public onopen: (() => void) | null = null;
      public onclose: (() => void) | null = null;
      public onmessage: ((event: MessageEvent) => void) | null = null;
      constructor() {
        socket = this;
      }
      send(): void {}
      close(): void {}
    };
    const row = (time: number, o: number, h: number, l: number, c: number) => ({
      Time: new Date(time).toISOString().replace('.000Z', ''),
      Open: o, High: h, Low: l, Close: c, Volume: 1,
    });
    const getCandles = vi.fn((_symbol: string, timeframe: string) => {
      if (timeframe === '1h') {
        // 00:00 .. 18:00 closed (the forming 19:00 hour is never served).
        return of(Array.from({ length: 19 }, (_, h) =>
          row(dayStart + h * 3_600_000, 82000 + h, 82100 + h + (h === 5 ? 1000 : 0), 81900 - h, 82001 + h)));
      }
      if (timeframe === '1m') {
        return of(Array.from({ length: 18 }, (_, m) =>
          row(dayStart + 19 * 3_600_000 + m * 60_000, 82500, 82510, 82490, 82505)));
      }
      return of([]); // 1d: today's in-progress candle is not served
    });
    TestBed.overrideProvider(ChartService, { useValue: { getCandles } });

    const Base = BrowserExchangeCandleStreamService;
    class JsonStreamService extends Base {
      override readonly exchangeName = 'TEST';
      protected override getSocketUrl(): string {
        return 'ws://example.test';
      }
      protected override parseMessage(data: string): ParsedStreamCandle[] {
        return [JSON.parse(data) as ParsedStreamCandle];
      }
    }
    const service = TestBed.runInInjectionContext(() => new JsonStreamService());
    const updates: any[] = [];
    service.connectKlineStream('BTCUSDT', '1d').subscribe((u) => updates.push(u));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(socket).not.toBeNull();
    const minute = dayStart + (19 * 60 + 18) * 60_000;
    socket.onmessage({
      data: JSON.stringify({
        symbol: 'BTCUSDT',
        candle: { time: minute, open: 82499.9, high: 82523, low: 82499.9, close: 82508.7, volume: 1 },
        isClosed: false,
      }),
    } as MessageEvent);

    const last = updates[updates.length - 1];
    expect(last.openTime).toBe(dayStart);
    expect(last.open).toBe(82000); // the day's real open, not the first tick
    expect(last.high).toBe(83105);
    expect(last.low).toBe(81882);
    expect(last.close).toBe(82508.7);
  });
});
