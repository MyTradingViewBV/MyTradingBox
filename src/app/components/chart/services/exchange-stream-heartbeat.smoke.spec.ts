import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { BybitStreamService } from './bybit-stream.service';
import { KrakenStreamService } from './kraken-stream.service';
import { BitvavoStreamService } from './bitvavo-stream.service';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('exchange candle stream keepalive and reconnect', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    TestBed.configureTestingModule({
      providers: [{ provide: ChartService, useValue: { getCandles: () => of([]) } }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWebSocket;
    TestBed.resetTestingModule();
  });

  it('subscribes Bybit to kline only and pings every 20s until closed', () => {
    const service = TestBed.inject(BybitStreamService);
    service.connectKlineStream('BTCUSDT', '1m');
    const socket = FakeWebSocket.instances[0];
    socket.open();

    expect(JSON.parse(socket.sent[0])).toEqual({ op: 'subscribe', args: ['kline.1.BTCUSDT'] });
    vi.advanceTimersByTime(40_000);
    expect(socket.sent.slice(1).map((s) => JSON.parse(s))).toEqual([{ op: 'ping' }, { op: 'ping' }]);

    service.disconnect();
    vi.advanceTimersByTime(60_000);
    expect(socket.sent.length).toBe(3);
  });

  it('sends a Kraken Futures keepalive at least every 60s', () => {
    const service = TestBed.inject(KrakenStreamService);
    service.connectKlineStream('PF_XBTUSD', '1m');
    const socket = FakeWebSocket.instances[0];
    socket.open();
    vi.advanceTimersByTime(60_000);
    const heartbeats = socket.sent
      .map((s) => JSON.parse(s))
      .filter((m) => m.feed === 'heartbeat');
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
    service.disconnect();
  });

  it('keeps backing off when a socket drops right after opening', () => {
    const service = TestBed.inject(BybitStreamService);
    service.connectKlineStream('BTCUSDT', '1m');

    // 1st drop -> 2s, then open+drop quickly -> 4s (retry count not reset).
    FakeWebSocket.instances[0].drop();
    vi.advanceTimersByTime(2_000);
    expect(FakeWebSocket.instances.length).toBe(2);
    FakeWebSocket.instances[1].open();
    vi.advanceTimersByTime(1_000);
    FakeWebSocket.instances[1].drop();
    vi.advanceTimersByTime(3_000);
    expect(FakeWebSocket.instances.length).toBe(2);
    vi.advanceTimersByTime(1_000);
    expect(FakeWebSocket.instances.length).toBe(3);

    service.disconnect();
  });

  it('subscribes Bitvavo with a dashed market and accepts its messages', () => {
    const service = TestBed.inject(BitvavoStreamService);
    const received: number[] = [];
    const sub = service.connectKlineStream('BTCEUR', '1m').subscribe((u) => {
      expect(u.symbol).toBe('BTCEUR');
      received.push(u.close);
    });
    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(JSON.parse(socket.sent[0]).channels[0].markets).toEqual(['BTC-EUR']);

    const t = Date.UTC(2026, 8, 7, 9, 0);
    socket.onmessage?.({
      data: JSON.stringify({
        event: 'candle',
        market: 'BTC-EUR',
        interval: '1m',
        candle: [[t, '100', '101', '99', '100.5', '2']],
      }),
    });
    expect(received).toEqual([100.5]);

    sub.unsubscribe();
    service.disconnect();
  });
});
