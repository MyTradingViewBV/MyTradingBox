import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { ExchangeTickerFactoryService } from './exchange-ticker-factory.service';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(): void {
    // not used by the ticker
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
  }

  /** Simulate the server dropping the connection. */
  drop(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('exchange ticker factory reconnect', () => {
  let originalWebSocket: typeof WebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    originalWebSocket = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ChartService,
          useValue: { getLiveCandleForExchange: () => of(null) },
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWebSocket;
    TestBed.resetTestingModule();
  });

  it('reconnects the Binance futures ticker after the socket drops', () => {
    const service = TestBed.inject(ExchangeTickerFactoryService);
    service.connect([{ exchangeId: 2, symbol: 'BTCUSDT' }]);

    expect(FakeWebSocket.instances.length).toBe(1);
    expect(FakeWebSocket.instances[0].url).toContain('wss://fstream.binance.com/stream');

    FakeWebSocket.instances[0].drop();
    vi.advanceTimersByTime(30_000);
    expect(FakeWebSocket.instances.length).toBe(2);

    service.disconnect();
  });

  it('does not reconnect after disconnect or when the symbol set changes', () => {
    const service = TestBed.inject(ExchangeTickerFactoryService);
    service.connect([{ exchangeId: 2, symbol: 'BTCUSDT' }]);
    const first = FakeWebSocket.instances[0];

    service.connect([{ exchangeId: 2, symbol: 'ETHUSDT' }]);
    expect(FakeWebSocket.instances.length).toBe(2);
    first.drop(); // handlers were detached: must not spawn another socket
    vi.advanceTimersByTime(30_000);
    expect(FakeWebSocket.instances.length).toBe(2);

    service.disconnect();
    FakeWebSocket.instances[1].drop();
    vi.advanceTimersByTime(30_000);
    expect(FakeWebSocket.instances.length).toBe(2);
  });

  it('coalesces bursts of mini-ticker messages into one emission', () => {
    const service = TestBed.inject(ExchangeTickerFactoryService);
    let emissions = 0;
    const sub = service.connect([{ exchangeId: 7, symbol: 'BTCUSDT' }]).subscribe(() => emissions++);
    const socket = FakeWebSocket.instances[0];

    for (let i = 0; i < 20; i++) {
      socket.onmessage?.({
        data: JSON.stringify({ data: { s: 'BTCUSDT', c: `${100 + i}`, o: '100', h: '120', l: '99', v: '1' } }),
      });
    }
    expect(emissions).toBe(0);
    vi.advanceTimersByTime(300);
    expect(emissions).toBe(1);
    expect(service.getLatest().get('7:BTCUSDT')?.close).toBe(119);

    sub.unsubscribe();
    service.disconnect();
  });
});
