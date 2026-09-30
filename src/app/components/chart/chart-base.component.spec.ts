/**
 * Behavioural tests for ChartBaseComponent (through the concrete /chart
 * ChartComponent): selection-change cancellation, live-stream guards,
 * loading flag, destroy cleanup, live-candle merging and drawing hit-tests.
 *
 * The template is replaced by an empty one and the Chart.js instance by a
 * plain stub, so nothing here depends on a real canvas.
 */
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ChartComponent } from './chart-component';
import { ChartBoxesService } from './services/chart-boxes.service';
import { ChartIndicatorsService } from './services/chart-indicators.service';
import { ChartPriceTickerService } from './services/chart-price-ticker.service';
import { ExchangeStreamFactory } from './services/exchange-stream.factory';
import { DrawingToolsService, Drawing } from './services/drawing-tools.service';
import { LiveCandleUpdate } from './models/live-candle-update';
import { getTimeframeBucketStart } from './utils/timeframe-bucketing';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';

// ── Test doubles ────────────────────────────────────────────────────────────

interface PendingRequest<T = unknown> {
  args: unknown[];
  subject: Subject<T>;
}

/** Records every call and returns a Subject the test resolves (= a "slow" HTTP call). */
function pendingFn<T = unknown>(): ReturnType<typeof vi.fn> & { requests: PendingRequest<T>[] } {
  const requests: PendingRequest<T>[] = [];
  const fn = vi.fn((...args: unknown[]) => {
    const subject = new Subject<T>();
    requests.push({ args, subject });
    return subject.asObservable();
  }) as ReturnType<typeof vi.fn> & { requests: PendingRequest<T>[] };
  fn.requests = requests;
  return fn;
}

function respond<T>(request: PendingRequest<T> | undefined, value: T): void {
  if (!request) throw new Error('no such pending request');
  request.subject.next(value);
  request.subject.complete();
}

interface ApiCandle {
  Time: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
}

function apiCandles(base: number, count = 5, startMs = Date.UTC(2026, 0, 1), stepMs = 3_600_000): ApiCandle[] {
  return Array.from({ length: count }, (_, i) => ({
    Time: new Date(startMs + i * stepMs).toISOString(),
    Open: base + i,
    High: base + i + 2,
    Low: base + i - 2,
    Close: base + i + 1,
  }));
}

function symbol(name: string): SymbolModel {
  const s = new SymbolModel();
  s.SymbolName = name;
  return s;
}

function exchange(id: number, name: string): Exchange {
  const e = new Exchange();
  e.Id = id;
  e.Name = name;
  return e;
}

class FakeStream {
  readonly exchangeName = 'Fake';
  readonly updates = new Subject<LiveCandleUpdate>();
  connectKlineStream = vi.fn<(symbol: string, interval: string) => Observable<LiveCandleUpdate>>(
    () => this.updates.asObservable(),
  );
  disconnect = vi.fn();
}

function makeChartStub() {
  const scale = (toPx: (v: number) => number, toVal: (p: number) => number) => ({
    min: 0,
    max: 0,
    options: {} as Record<string, unknown>,
    getPixelForValue: vi.fn((v: number) => toPx(Number(v))),
    getValueForPixel: vi.fn((p: number) => toVal(p)),
  });
  return {
    // 1 px per minute from 2026-01-01; price 0 at y=1000, 1 px per price unit.
    scales: {
      x: scale(
        (v) => (v - Date.UTC(2026, 0, 1)) / 60_000,
        (p) => Date.UTC(2026, 0, 1) + p * 60_000,
      ),
      y: scale(
        (v) => 1000 - v,
        (p) => 1000 - p,
      ),
    },
    chartArea: { left: 0, right: 800, top: 0, bottom: 1000 },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    width: 800,
    height: 1000,
    data: { datasets: [] as unknown[] },
    config: { options: { scales: {} } },
    update: vi.fn(),
    draw: vi.fn(),
    resize: vi.fn(),
  };
}

function liveUpdate(partial: Partial<LiveCandleUpdate>): LiveCandleUpdate {
  return {
    symbol: 'BTCUSDT',
    interval: '1h',
    openTime: 0,
    closeTime: 0,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    isClosed: false,
    ...partial,
  };
}

// ── Suite ───────────────────────────────────────────────────────────────────

describe('ChartBaseComponent', () => {
  let component: ChartComponent;
  let chartService: {
    getExchanges: ReturnType<typeof vi.fn>;
    getSymbols: ReturnType<typeof pendingFn>;
    getCandles: ReturnType<typeof pendingFn>;
    getTradeOrders: ReturnType<typeof pendingFn>;
    getKeyZones: ReturnType<typeof pendingFn>;
    loadChartState: ReturnType<typeof vi.fn>;
    saveChartState: ReturnType<typeof vi.fn>;
  };
  let boxesService: { getBoxes: ReturnType<typeof vi.fn> };
  let indicators: Record<string, ReturnType<typeof vi.fn>>;
  let settings: Record<string, ReturnType<typeof vi.fn>>;
  let streams: FakeStream[];
  let factory: { create: ReturnType<typeof vi.fn> };
  let ticker: { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
  let keyZones: Record<string, unknown>;
  let chartStub: ReturnType<typeof makeChartStub>;
  let rafQueue: Map<number, FrameRequestCallback>;
  let rafId: number;

  const lastStream = () => streams[streams.length - 1];
  const candleRequests = () => chartService.getCandles.requests;
  const flushRaf = () => {
    const callbacks = [...rafQueue.values()];
    rafQueue.clear();
    callbacks.forEach((cb) => cb(0));
  };

  /** Complete a symbol switch whose candles resolve immediately. */
  function loadSymbol(name: string, base = 100, candles?: ApiCandle[]): void {
    component.onSymbolChange(symbol(name));
    respond(candleRequests()[candleRequests().length - 1], candles ?? apiCandles(base));
  }

  beforeEach(async () => {
    rafQueue = new Map();
    rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafId += 1;
      rafQueue.set(rafId, cb);
      return rafId;
    });
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        rafQueue.delete(id);
      }),
    );

    chartService = {
      getExchanges: vi.fn(() => of([])),
      getSymbols: pendingFn(),
      getCandles: pendingFn(),
      getTradeOrders: pendingFn(),
      getKeyZones: pendingFn(),
      loadChartState: vi.fn(() => of(null)),
      saveChartState: vi.fn(() => of(null)),
    };
    boxesService = { getBoxes: vi.fn(() => of([])) };
    indicators = {
      fetchCapitalFlowSignals: vi.fn(() => of([])),
      fetchMarketCipherSignals: vi.fn(() => of([])),
      fetchDivergences: vi.fn(() => of([])),
      buildCapitalFlowDatasets: vi.fn(() => []),
      buildMarketCipherDatasets: vi.fn(() => []),
      buildDivergenceDatasets: vi.fn(() => []),
    };
    settings = {
      dispatchAppAction: vi.fn(),
      setSelectedExchange: vi.fn(),
      getSelectedExchange: vi.fn(() => of(null)),
      getSelectedSymbol: vi.fn(() => of(null)),
      getSelectedTimeframe: vi.fn(() => of(null)),
      getExchangeId$: vi.fn(() => of(1)),
      getUiModeOverride: vi.fn(() => of('mobile')),
    };
    streams = [];
    factory = {
      create: vi.fn(() => {
        const s = new FakeStream();
        streams.push(s);
        return s;
      }),
    };
    ticker = { connect: vi.fn(() => new Subject()), disconnect: vi.fn() };
    let kzTimeframes: Record<string, boolean> = {};
    keyZones = {
      settings$: of({ enabled: true, timeframes: {} }),
      getSettings: () => ({ enabled: true, timeframes: { ...kzTimeframes } }),
      getAvailableTimeframes: () => Object.keys(kzTimeframes),
      isAllTimeframesEnabled: () => true,
      setEnabled: vi.fn(),
      setAvailableTimeframes: vi.fn(),
      setTimeframeEnabled: vi.fn(),
      setAllTimeframesEnabled: vi.fn(),
      __setFlags: (flags: Record<string, boolean>) => (kzTimeframes = flags),
    };

    await TestBed.configureTestingModule({
      imports: [ChartComponent],
      providers: [
        { provide: ChartService, useValue: chartService },
        { provide: SettingsService, useValue: settings },
        { provide: ChartBoxesService, useValue: boxesService },
        { provide: ChartIndicatorsService, useValue: indicators },
        { provide: ExchangeStreamFactory, useValue: factory },
        { provide: KeyZoneSettingsService, useValue: keyZones },
      ],
    })
      .overrideComponent(ChartComponent, {
        set: {
          template: '',
          imports: [],
          providers: [{ provide: ChartPriceTickerService, useValue: ticker }],
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ChartComponent);
    component = fixture.componentInstance;
    chartStub = makeChartStub();
    component.chart = { chart: chartStub, update: vi.fn() } as unknown as ChartComponent['chart'];
    component.selectedExchange = exchange(1, 'Bybit');
    component.selectedTimeframe = '1h';
    TestBed.inject(DrawingToolsService).setDrawings([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ── Selection-driven loads ────────────────────────────────────────────────

  describe('selection changes', () => {
    it('stops the old live stream before the new symbol candles are requested', () => {
      loadSymbol('BTCUSDT');
      const btcStream = lastStream();
      expect(btcStream.connectKlineStream).toHaveBeenCalledWith('BTCUSDT', '1h');
      expect(btcStream.updates.observed).toBe(true);

      let disconnectedBeforeRequest = false;
      chartService.getCandles.mockImplementationOnce(() => {
        disconnectedBeforeRequest =
          btcStream.disconnect.mock.calls.length > 0 && !btcStream.updates.observed;
        return new Subject<ApiCandle[]>();
      });
      component.onSymbolChange(symbol('ETHUSDT'));

      expect(disconnectedBeforeRequest).toBe(true);
      // No new stream until the ETH candles have loaded.
      expect(streams).toHaveLength(1);
    });

    it('ignores a slow candle response for an older symbol', () => {
      component.onSymbolChange(symbol('BTCUSDT'));
      component.onSymbolChange(symbol('ETHUSDT'));
      const [btc, eth] = candleRequests();
      expect(btc.args[0]).toBe('BTCUSDT');
      expect(eth.args[0]).toBe('ETHUSDT');

      respond(eth, apiCandles(2000));
      const ethData = component.baseData;
      expect(ethData[0].o).toBe(2000);
      expect(component.chartData.datasets[0].label).toContain('ETHUSDT');

      // The BTC request was unsubscribed; a late response has no effect.
      expect(btc.subject.observed).toBe(false);
      respond(btc, apiCandles(100));
      expect(component.baseData).toBe(ethData);
      expect(component.chartData.datasets[0].label).toContain('ETHUSDT');
      // Only the ETH chain started a stream.
      expect(streams).toHaveLength(1);
      expect(lastStream().connectKlineStream).toHaveBeenCalledWith('ETHUSDT', '1h');
    });

    it('ignores slow boxes, orders and key zones of an older symbol', () => {
      const boxes = pendingFn<unknown[]>();
      boxesService.getBoxes = boxes;
      component.showOrders = true;
      component.showKeyZones = true;

      component.onSymbolChange(symbol('BTCUSDT'));
      respond(candleRequests()[0], apiCandles(100));
      // BTC overlays are now in flight.
      expect(boxes.requests).toHaveLength(1);
      expect(chartService.getTradeOrders.requests).toHaveLength(1);
      expect(chartService.getKeyZones.requests).toHaveLength(1);

      component.onSymbolChange(symbol('ETHUSDT'));
      respond(candleRequests()[1], apiCandles(2000));
      respond(boxes.requests[1], [{ Id: 'eth', ZoneMin: 2000, ZoneMax: 2003, PositionType: 'LONG' }]);
      respond(chartService.getTradeOrders.requests[1], [{ Id: 2, Symbol: 'ETHUSDT', EntryPrice: 2001 }]);
      respond(chartService.getKeyZones.requests[1], { VolumeProfiles: [], FibLevels: [], id: 'eth' });

      // Late BTC responses.
      respond(boxes.requests[0], [{ Id: 'btc', ZoneMin: 100, ZoneMax: 103, PositionType: 'LONG' }]);
      respond(chartService.getTradeOrders.requests[0], [{ Id: 1, Symbol: 'BTCUSDT', EntryPrice: 101 }]);
      respond(chartService.getKeyZones.requests[0], { VolumeProfiles: [], FibLevels: [], id: 'btc' });

      expect(component.boxes.map((b: { Id: string }) => b.Id)).toEqual(['eth']);
      expect(component.orders.map((o) => o.Id)).toEqual([2]);
      expect((component.keyZones as unknown as { id: string }).id).toBe('eth');
      expect(component.baseData[0].o).toBe(2000);
    });

    it('does not restore the chart state (drawings) of an older selection', () => {
      const states = pendingFn<unknown>();
      chartService.loadChartState = states;
      const drawings = TestBed.inject(DrawingToolsService);

      loadSymbol('BTCUSDT');
      expect(states.requests).toHaveLength(1);
      loadSymbol('ETHUSDT', 2000);
      expect(states.requests).toHaveLength(2);

      const ethDrawing = { id: 'eth', type: 'horizontal-line', points: [{ x: 1, y: 2001 }], color: '#fff', lineWidth: 1 } as Drawing;
      respond(states.requests[1], { drawings: [ethDrawing] });
      respond(states.requests[0], { drawings: [{ ...ethDrawing, id: 'btc' }] });

      expect(drawings.drawingsValue.map((d) => d.id)).toEqual(['eth']);
    });

    it('ignores indicator, divergence and market cipher responses of an older symbol', () => {
      const capitalFlow = pendingFn<unknown[]>();
      const divergences = pendingFn<unknown[]>();
      const marketCipher = pendingFn<unknown[]>();
      indicators['fetchCapitalFlowSignals'] = capitalFlow;
      indicators['fetchDivergences'] = divergences;
      indicators['fetchMarketCipherSignals'] = marketCipher;
      component.showDivergences = true;
      component.showMarketCipher = true;

      loadSymbol('BTCUSDT');
      loadSymbol('ETHUSDT', 2000);
      expect(capitalFlow.requests).toHaveLength(2);
      expect(divergences.requests).toHaveLength(2);
      expect(marketCipher.requests).toHaveLength(2);

      respond(capitalFlow.requests[1], [{ id: 'eth' }]);
      respond(divergences.requests[1], [{ id: 'eth' }]);
      respond(marketCipher.requests[1], [{ id: 'eth' }]);
      respond(capitalFlow.requests[0], [{ id: 'btc' }]);
      respond(divergences.requests[0], [{ id: 'btc' }]);
      respond(marketCipher.requests[0], [{ id: 'btc' }]);

      expect(component.indicatorSignals).toEqual([{ id: 'eth' }]);
      expect(component.divergences).toEqual([{ id: 'eth' }]);
      expect(component.marketCipherSignals).toEqual([{ id: 'eth' }]);
    });

    it('ignores a slow response for a superseded timeframe', () => {
      component.selectedSymbol = symbol('BTCUSDT');
      component.onTimeframeChange('4h');
      component.onTimeframeChange('1d');
      const [h4, d1] = candleRequests();
      expect(h4.args[1]).toBe('4h');
      expect(d1.args[1]).toBe('1d');

      respond(d1, apiCandles(500, 5, Date.UTC(2026, 0, 1), 86_400_000));
      const dailyData = component.baseData;
      respond(h4, apiCandles(100));

      expect(component.baseData).toBe(dailyData);
      expect(component.loading).toBe(false);
      expect(streams).toHaveLength(1);
      expect(lastStream().connectKlineStream).toHaveBeenCalledWith('BTCUSDT', '1d');
    });

    it('cancels a pending symbol chain when the exchange changes', () => {
      component.onSymbolChange(symbol('BTCUSDT'));
      const btc = candleRequests()[0];
      component.onExchangeChange(exchange(2, 'Binance'));

      expect(btc.subject.observed).toBe(false);
      expect(chartService.getSymbols).toHaveBeenCalledTimes(1);
      expect(component.loading).toBe(true);

      respond(btc, apiCandles(100));
      expect(component.baseData).toEqual([]);
      expect(streams).toHaveLength(0);
    });

    it('reloads key zones, Market Cipher and divergences for the new exchange', () => {
      component.showOrders = false;
      component.showKeyZones = true;
      component.showMarketCipher = true;
      component.showDivergences = true;
      settings['getSelectedSymbol'].mockReturnValue(of(symbol('BTCUSDT')));

      component.onExchangeChange(exchange(2, 'Binance'));
      respond(chartService.getSymbols.requests[0], [symbol('BTCUSDT')]);
      respond(candleRequests()[0], apiCandles(100));

      expect(chartService.getKeyZones.requests).toHaveLength(1);
      expect(indicators['fetchMarketCipherSignals']).toHaveBeenCalledTimes(1);
      expect(indicators['fetchDivergences']).toHaveBeenCalledTimes(1);
    });

    it('does not load disabled overlays on an exchange change', () => {
      component.showOrders = false;
      component.showKeyZones = false;
      component.showMarketCipher = false;
      component.showDivergences = false;
      settings['getSelectedSymbol'].mockReturnValue(of(symbol('BTCUSDT')));

      component.onExchangeChange(exchange(2, 'Binance'));
      respond(chartService.getSymbols.requests[0], [symbol('BTCUSDT')]);
      respond(candleRequests()[0], apiCandles(100));

      expect(chartService.getKeyZones.requests).toHaveLength(0);
      expect(indicators['fetchMarketCipherSignals']).not.toHaveBeenCalled();
      expect(indicators['fetchDivergences']).not.toHaveBeenCalled();
    });

    it('restarts symbol resolution when the timeframe changes before a symbol is known', () => {
      settings['getSelectedSymbol'].mockReturnValue(of(symbol('BTCUSDT')));
      component.loadSymbolsAndBoxes();
      component.onTimeframeChange('4h');

      // Initial chain cancelled; a fresh one was started.
      expect(chartService.getSymbols.requests).toHaveLength(2);
      expect(chartService.getSymbols.requests[0].subject.observed).toBe(false);
      respond(chartService.getSymbols.requests[1], [symbol('BTCUSDT')]);

      expect(candleRequests()).toHaveLength(1);
      expect(candleRequests()[0].args.slice(0, 2)).toEqual(['BTCUSDT', '4h']);
      respond(candleRequests()[0], apiCandles(100));
      expect(component.loading).toBe(false);
      expect(streams).toHaveLength(1);
    });

    it('reloads boxes whose load was cancelled by a timeframe change', () => {
      const boxes = pendingFn<unknown[]>();
      boxesService.getBoxes = boxes;
      component.onSymbolChange(symbol('BTCUSDT'));
      respond(candleRequests()[0], apiCandles(100));
      expect(boxes.requests).toHaveLength(1);

      component.onTimeframeChange('4h');
      expect(boxes.requests[0].subject.observed).toBe(false);
      respond(candleRequests()[1], apiCandles(100));

      // ChartComponent boxes are timeframe-scoped: requested again for 4h.
      expect(boxes.requests).toHaveLength(2);
      expect(boxes.requests[1].args).toEqual(['BTCUSDT', 'boxes', '4h']);
      respond(boxes.requests[1], [{ Id: 'b4h', ZoneMin: 100, ZoneMax: 103, PositionType: 'LONG' }]);
      expect(component.boxes.map((b: { Id: string }) => b.Id)).toEqual(['b4h']);

      // Loaded for this context: another stream-only change does not refetch.
      component.onTimeframeChange('4h');
      respond(candleRequests()[2], apiCandles(100));
      expect(boxes.requests).toHaveLength(2);
    });
  });

  // ── Loading flag ──────────────────────────────────────────────────────────

  describe('chart state restore', () => {
    it('loads the overlays that the restored settings switch on, without saving back', () => {
      component.showOrders = false;
      component.showKeyZones = false;
      component.showMarketCipher = false;
      component.showDivergences = false;
      chartService.loadChartState.mockReturnValue(
        of({
          drawings: [],
          settings: { showKeyZones: true, showMarketCipher: true, showDivergences: true },
        }),
      );

      loadSymbol('BTCUSDT');

      expect(component.showKeyZones).toBe(true);
      expect(chartService.getKeyZones.requests).toHaveLength(1);
      expect(indicators['fetchMarketCipherSignals']).toHaveBeenCalledTimes(1);
      expect(indicators['fetchDivergences']).toHaveBeenCalledTimes(1);
      expect(chartService.saveChartState).not.toHaveBeenCalled();
    });

    it('removes the overlays that the restored settings switch off', () => {
      component.showOrders = false;
      component.showDivergences = true;
      chartService.loadChartState.mockReturnValue(
        of({ drawings: [], settings: { showDivergences: false } }),
      );

      loadSymbol('BTCUSDT');
      // Divergences were on, so the symbol load fetched them once...
      expect(indicators['fetchDivergences']).toHaveBeenCalledTimes(1);
      component.chartData.datasets.push({ isDivergence: true, data: [] });

      // ...and a second restore that switches them off clears the datasets.
      component.showDivergences = true;
      component.loadChartStateForCurrentContext();

      expect(component.showDivergences).toBe(false);
      expect(component.chartData.datasets.some((d: any) => d.isDivergence)).toBe(false);
      expect(chartService.saveChartState).not.toHaveBeenCalled();
    });
  });

  describe('loading flag', () => {
    it('stays true while the newest request is pending and ends false when it completes', () => {
      component.onSymbolChange(symbol('BTCUSDT'));
      expect(component.loading).toBe(true);
      component.onSymbolChange(symbol('ETHUSDT'));
      // Cancelling BTC must not hide the spinner of the ETH request.
      expect(component.loading).toBe(true);

      respond(candleRequests()[1], apiCandles(2000));
      expect(component.loading).toBe(false);
    });

    it('ends false when a timeframe request is superseded and the newer one completes', () => {
      component.selectedSymbol = symbol('BTCUSDT');
      component.onTimeframeChange('4h');
      component.onTimeframeChange('1d');
      expect(component.loading).toBe(true);
      respond(candleRequests()[1], apiCandles(100));
      expect(component.loading).toBe(false);
    });

    it('ends false when the latest request errors', () => {
      chartService.getCandles.mockReturnValueOnce(throwError(() => new Error('boom')));
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      component.selectedSymbol = symbol('BTCUSDT');
      component.onTimeframeChange('4h');
      expect(component.loading).toBe(false);

      chartService.getCandles.mockReturnValueOnce(throwError(() => new Error('boom')));
      component.onSymbolChange(symbol('ETHUSDT'));
      expect(component.loading).toBe(false);
    });

    it('ends false when the latest request completes without emitting', () => {
      chartService.getCandles.mockReturnValueOnce(new Observable<never>((s) => s.complete()));
      component.selectedSymbol = symbol('BTCUSDT');
      component.onTimeframeChange('4h');
      expect(component.loading).toBe(false);
    });

    it('resets the duplicate-symbol guard so the same symbol can be reloaded', () => {
      component.onSymbolChange(symbol('BTCUSDT'));
      // Same symbol while in flight: ignored.
      component.onSymbolChange(symbol('BTCUSDT'));
      expect(candleRequests()).toHaveLength(1);
      respond(candleRequests()[0], apiCandles(100));
      component.onSymbolChange(symbol('BTCUSDT'));
      expect(candleRequests()).toHaveLength(2);
    });
  });

  // ── Live stream guards ────────────────────────────────────────────────────

  describe('live ticks', () => {
    const lastBar = () => component.baseData[component.baseData.length - 1];

    it('drops ticks from an outdated generation, symbol, interval or exchange', () => {
      loadSymbol('BTCUSDT');
      const stream = lastStream();
      const before = component.baseData;
      const openTime = before[before.length - 1].x;

      stream.updates.next(liveUpdate({ symbol: 'ETHUSDT', openTime, close: 999 }));
      stream.updates.next(liveUpdate({ interval: '4h', openTime, close: 999 }));
      expect(component.baseData).toBe(before);

      // Selection mutated without a proper selection change: guard still drops.
      component.selectedExchange = exchange(3, 'Kraken');
      stream.updates.next(liveUpdate({ openTime, close: 999 }));
      expect(component.baseData).toBe(before);
      component.selectedExchange = exchange(1, 'Bybit');

      component.selectedTimeframe = '4h';
      stream.updates.next(liveUpdate({ openTime, close: 999 }));
      expect(component.baseData).toBe(before);
      component.selectedTimeframe = '1h';

      // Outdated generation (live streams torn down elsewhere).
      (component as unknown as { _liveGeneration: number })._liveGeneration++;
      stream.updates.next(liveUpdate({ openTime, close: 999 }));
      expect(component.baseData).toBe(before);
    });

    it('never receives ticks of the previous symbol after a switch', () => {
      loadSymbol('BTCUSDT');
      const btcStream = lastStream();
      loadSymbol('ETHUSDT', 2000);
      const ethData = component.baseData;
      btcStream.updates.next(liveUpdate({ openTime: ethData[ethData.length - 1].x, close: 5 }));
      expect(component.baseData).toBe(ethData);
    });

    it('merges a live tick into the current bar for the same timeframe bucket', () => {
      loadSymbol('BTCUSDT');
      const openTime = lastBar().x;
      const length = component.baseData.length;
      lastStream().updates.next(liveUpdate({ openTime, high: 500, low: 1, close: 250 }));
      expect(component.baseData).toHaveLength(length);
      expect(lastBar().c).toBe(250);
      expect(lastBar().h).toBe(500);
      expect(component.currentPrice).toBe(250);

      lastStream().updates.next(liveUpdate({ openTime: openTime + 3_600_000, close: 260 }));
      expect(component.baseData).toHaveLength(length + 1);
    });

    it('buckets monthly ticks by calendar month (1M, not 1m)', () => {
      component.selectedTimeframe = '1M';
      const months = [0, 1, 2].map((m) => ({
        Time: new Date(Date.UTC(2026, m, 1)).toISOString(),
        Open: 100, High: 110, Low: 90, Close: 105,
      }));
      loadSymbol('BTCUSDT', 100, months);
      expect(lastStream().connectKlineStream).toHaveBeenCalledWith('BTCUSDT', '1M');
      const length = component.baseData.length;

      // Mid-March tick: same calendar month as the last (March) bar -> update.
      lastStream().updates.next(liveUpdate({ interval: '1M', openTime: Date.UTC(2026, 2, 17, 13, 5), high: 120, close: 118 }));
      expect(component.baseData).toHaveLength(length);
      expect(lastBar().x).toBe(Date.UTC(2026, 2, 1));
      expect(lastBar().c).toBe(118);

      // April -> new bar.
      lastStream().updates.next(liveUpdate({ interval: '1M', openTime: Date.UTC(2026, 3, 1), close: 119 }));
      expect(component.baseData).toHaveLength(length + 1);
    });

    it('buckets weekly ticks by Monday-start week (1w)', () => {
      component.selectedTimeframe = '1w';
      const weekStart = getTimeframeBucketStart(Date.UTC(2026, 2, 12), '1w');
      const weeks = [2, 1, 0].map((n) => ({
        Time: new Date(weekStart - n * 7 * 86_400_000).toISOString(),
        Open: 100, High: 110, Low: 90, Close: 105,
      }));
      loadSymbol('BTCUSDT', 100, weeks);
      const length = component.baseData.length;

      lastStream().updates.next(liveUpdate({ interval: '1w', openTime: weekStart + 3 * 86_400_000, close: 111 }));
      expect(component.baseData).toHaveLength(length);
      expect(lastBar().c).toBe(111);

      lastStream().updates.next(liveUpdate({ interval: '1w', openTime: weekStart + 7 * 86_400_000, close: 112 }));
      expect(component.baseData).toHaveLength(length + 1);
    });

    it('coalesces redraws and runs detectChanges only when displayed values change', () => {
      loadSymbol('BTCUSDT');
      flushRaf();
      const cdr = (component as unknown as { cdr: { detectChanges: () => void } }).cdr;
      const detectChanges = vi.spyOn(cdr, 'detectChanges').mockImplementation(() => undefined);
      const openTime = lastBar().x;

      lastStream().updates.next(liveUpdate({ openTime, close: 300 }));
      lastStream().updates.next(liveUpdate({ openTime, close: 301 }));
      // Two ticks, one scheduled frame.
      expect(rafQueue.size).toBe(1);
      chartStub.update.mockClear();
      flushRaf();
      expect(chartStub.update).toHaveBeenCalledTimes(1);
      expect(detectChanges).toHaveBeenCalledTimes(1);

      // Same displayed price again: frame redraws the chart but skips CD.
      lastStream().updates.next(liveUpdate({ openTime, close: 301, volume: 5 }));
      flushRaf();
      expect(detectChanges).toHaveBeenCalledTimes(1);

      lastStream().updates.next(liveUpdate({ openTime, close: 302 }));
      flushRaf();
      expect(detectChanges).toHaveBeenCalledTimes(2);
    });
  });

  // ── Destroy ───────────────────────────────────────────────────────────────

  describe('ngOnDestroy', () => {
    it('disconnects the stream and cancels the pending live-render frame', () => {
      loadSymbol('BTCUSDT');
      flushRaf();
      const stream = lastStream();
      stream.updates.next(liveUpdate({ openTime: component.baseData[component.baseData.length - 1].x, close: 400 }));
      const [pendingRafId] = [...rafQueue.keys()];
      expect(pendingRafId).toBeDefined();

      component.ngOnDestroy();

      expect(stream.disconnect).toHaveBeenCalled();
      expect(stream.updates.observed).toBe(false);
      expect(cancelAnimationFrame).toHaveBeenCalledWith(pendingRafId);
      expect(rafQueue.has(pendingRafId)).toBe(false);
    });

    it('never starts a stream after destroy, even when a load chain was in flight', () => {
      component.onSymbolChange(symbol('BTCUSDT'));
      const btc = candleRequests()[0];

      component.ngOnDestroy();

      expect(btc.subject.observed).toBe(false);
      respond(btc, apiCandles(100));
      (component as unknown as { setupExchangeStream: () => void }).setupExchangeStream();
      component.scheduleInitializeChart([]);
      expect(factory.create).not.toHaveBeenCalled();
    });
  });

  // ── Key zones ─────────────────────────────────────────────────────────────

  describe('key-zone timeframes', () => {
    it('keeps the month 1M distinct from the minute 1m', () => {
      (keyZones['__setFlags'] as (f: Record<string, boolean>) => void)({ '1M': true, '1m': false, '4h': true });
      expect(component.timeframeEnabled('1M')).toBe(true);
      expect(component.timeframeEnabled('1m')).toBe(false);
      expect(component.timeframeEnabled('4H')).toBe(true);
      expect(component.timeframeEnabled('1d')).toBe(false);
    });

    it('labels the month 1M and the minute 1m differently', () => {
      expect(component.keyZoneTimeframeLabel('1M')).toBe('1M');
      expect(component.keyZoneTimeframeLabel('1m')).toBe('1m');
      expect(component.keyZoneTimeframeLabel('15m')).toBe('15m');
      expect(component.keyZoneTimeframeLabel('4h')).toBe('4H');
      expect(component.keyZoneTimeframeLabel('1w')).toBe('1W');
    });
  });

  // ── Axis formatting ───────────────────────────────────────────────────────

  describe('time axis ticks', () => {
    const format = (val: number) =>
      (component as unknown as { formatTimeTick: (v: number, i?: number, t?: unknown[]) => string }).formatTimeTick(val, 0, []);

    it('uses the month format for 1M and the time format for 1m', () => {
      const t = new Date(2026, 8, 1, 14, 30).getTime();
      component.selectedTimeframe = '1M';
      expect(format(t)).toBe("Sep '26");
      component.selectedTimeframe = '1m';
      expect(format(t)).toBe('14:30');
    });
  });

  // ── Drawing hit-tests (pixel <-> data via the chart scales) ──────────────

  describe('drawing hit-tests', () => {
    type HitTests = {
      hitTestHorizontalLine(cx: number, cy: number, c: unknown): string | null;
      hitTestVerticalLine(cx: number, cy: number, c: unknown): string | null;
      hitTestTrendLine(cx: number, cy: number, c: unknown): string | null;
      hitTestTrendHandle(cx: number, cy: number, c: unknown, id?: string): { id: string; pointIndex: number } | null;
      hitTestBox(cx: number, cy: number, c: unknown): string | null;
      hitTestPositionHandle(cx: number, cy: number, c: unknown, id?: string): { id: string; row: string; side: string } | null;
      hitTestFibHandle(cx: number, cy: number, c: unknown, id?: string): { id: string; pointIndex: number } | null;
      hitTestFibBody(cx: number, cy: number, c: unknown, id?: string): string | null;
      snapToOhlc(cx: number, cy: number, c: unknown): { x: number; y: number; label: string | null };
    };
    const t0 = Date.UTC(2026, 0, 1);
    const minute = (m: number) => t0 + m * 60_000; // x pixel == m
    const hit = () => component as unknown as HitTests;
    const draw = (d: Partial<Drawing>): Drawing =>
      ({ color: '#fff', lineWidth: 1, ...d }) as Drawing;

    beforeEach(() => {
      TestBed.inject(DrawingToolsService).setDrawings([
        draw({ id: 'h', type: 'horizontal-line', points: [{ x: minute(0), y: 900 }] }), // y px 100
        draw({ id: 'v', type: 'vertical-line', points: [{ x: minute(400), y: 0 }] }),
        draw({ id: 't', type: 'trend-line', points: [{ x: minute(100), y: 700 }, { x: minute(200), y: 600 }] }), // (100,300)->(200,400)
        draw({ id: 'b', type: 'box-green', points: [{ x: minute(500), y: 500 }, { x: minute(600), y: 400 }] }), // x 500-600, y 500-600
        draw({ id: 'p', type: 'long-position', points: [{ x: minute(650), y: 300 }, { x: minute(750), y: 350 }, { x: minute(750), y: 280 }] }),
        draw({ id: 'f', type: 'fib-retracement', points: [{ x: minute(20), y: 100 }, { x: minute(80), y: 200 }] }), // (20,900)->(80,800)
      ]);
    });

    it('hits horizontal and vertical lines within 8px', () => {
      expect(hit().hitTestHorizontalLine(10, 106, chartStub)).toBe('h');
      expect(hit().hitTestHorizontalLine(10, 110, chartStub)).toBeNull();
      expect(hit().hitTestVerticalLine(395, 5, chartStub)).toBe('v');
      expect(hit().hitTestVerticalLine(390, 5, chartStub)).toBeNull();
    });

    it('hits a trend line near its segment but not beyond its endpoints', () => {
      expect(hit().hitTestTrendLine(150, 355, chartStub)).toBe('t');
      expect(hit().hitTestTrendLine(150, 370, chartStub)).toBeNull();
      expect(hit().hitTestTrendLine(250, 450, chartStub)).toBeNull();
      expect(hit().hitTestTrendHandle(203, 402, chartStub)).toEqual({ id: 't', pointIndex: 1 });
      expect(hit().hitTestTrendHandle(150, 350, chartStub)).toBeNull();
    });

    it('hits boxes and positions inside their bounds (+padding)', () => {
      expect(hit().hitTestBox(550, 550, chartStub)).toBe('b');
      expect(hit().hitTestBox(495, 495, chartStub)).toBe('b');
      expect(hit().hitTestBox(480, 550, chartStub)).toBeNull();
      expect(hit().hitTestBox(700, 680, chartStub)).toBe('p');
    });

    it('resolves position resize handles by row and side', () => {
      // entry y=700px, tp y=650px, sl y=720px; left x=650, right x=750
      expect(hit().hitTestPositionHandle(652, 651, chartStub)).toEqual({ id: 'p', row: 'tp', side: 'left' });
      expect(hit().hitTestPositionHandle(748, 720, chartStub)).toEqual({ id: 'p', row: 'sl', side: 'right' });
      expect(hit().hitTestPositionHandle(700, 700, chartStub)).toBeNull();
    });

    it('hits fib handles and body', () => {
      expect(hit().hitTestFibHandle(22, 898, chartStub)).toEqual({ id: 'f', pointIndex: 0 });
      expect(hit().hitTestFibHandle(50, 850, chartStub)).toBeNull();
      expect(hit().hitTestFibBody(50, 850, chartStub)).toBe('f');
      expect(hit().hitTestFibBody(50, 850, chartStub, 'other')).toBeNull();
    });

    it('snaps to the nearest visible OHLC value only when magnet mode is on', () => {
      const tools = TestBed.inject(DrawingToolsService);
      chartStub.scales.x.min = minute(0);
      chartStub.scales.x.max = minute(1000);
      chartStub.data.datasets = [
        { type: 'candlestick', data: [{ x: minute(100), o: 500, h: 520, l: 480, c: 510 }, { x: minute(300), o: 1, h: 2, l: 0, c: 1 }] },
      ];
      tools.magnetMode = 'off';
      expect(hit().snapToOhlc(105, 482, chartStub)).toEqual({ x: 105, y: 482, label: null });

      tools.magnetMode = 'weak';
      // Near the high (520 -> y 480).
      expect(hit().snapToOhlc(105, 482, chartStub)).toEqual({ x: 100, y: 480, label: 'H' });
      // Too far away in x for weak mode (35px).
      expect(hit().snapToOhlc(160, 482, chartStub).label).toBeNull();
      tools.magnetMode = 'strong';
      expect(hit().snapToOhlc(160, 482, chartStub).label).toBe('H');
      tools.magnetMode = 'off';
    });
  });
});
