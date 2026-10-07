/**
 * Behavioural tests for ChartBaseComponent (through the test-only
 * ChartBaseTestHostComponent): selection-change cancellation, live-stream guards,
 * loading flag, destroy cleanup, live-candle merging and drawing hit-tests.
 *
 * The template is replaced by an empty one and the Chart.js instance by a
 * plain stub, so nothing here depends on a real canvas.
 */
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ChartBaseTestHostComponent } from './chart-base.test-host';
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
import { ChartDeviceSettings } from 'src/app/modules/shared/models/chart/chart-state.dto';
import { SettingsActions } from 'src/app/store/settings/settings.actions';

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
  let component: ChartBaseTestHostComponent;
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
  let defaultShowKeyZones: boolean;
  let deviceSettings: ChartDeviceSettings;
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
    deviceSettings = {};
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
      getEffectiveUiMode: vi.fn(() => of('mobile')),
      getSelectedSymbol: vi.fn(() => of(null)),
      getSelectedTimeframe: vi.fn(() => of(null)),
      getExchangeId$: vi.fn(() => of(1)),
      getUiModeOverride: vi.fn(() => of('mobile')),
      getChartSettings: vi.fn(() => of(deviceSettings)),
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
      getTimeframeFlags: () => kzTimeframes,
      getAvailableTimeframes: () => Object.keys(kzTimeframes),
      isAllTimeframesEnabled: () => true,
      setEnabled: vi.fn(),
      setAvailableTimeframes: vi.fn(),
      setTimeframeEnabled: vi.fn(),
      setAllTimeframesEnabled: vi.fn(),
      __setFlags: (flags: Record<string, boolean>) => (kzTimeframes = flags),
    };

    await TestBed.configureTestingModule({
      imports: [ChartBaseTestHostComponent],
      providers: [
        { provide: ChartService, useValue: chartService },
        { provide: SettingsService, useValue: settings },
        { provide: ChartBoxesService, useValue: boxesService },
        { provide: ChartIndicatorsService, useValue: indicators },
        { provide: ExchangeStreamFactory, useValue: factory },
        { provide: KeyZoneSettingsService, useValue: keyZones },
      ],
    })
      .overrideComponent(ChartBaseTestHostComponent, {
        set: {
          template: '',
          imports: [],
          providers: [{ provide: ChartPriceTickerService, useValue: ticker }],
        },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(ChartBaseTestHostComponent);
    component = fixture.componentInstance;
    defaultShowKeyZones = component.showKeyZones;
    // Most tests exercise the candle/stream chain without key zones.
    component.showKeyZones = false;
    chartStub = makeChartStub();
    component.chart = { chart: chartStub, update: vi.fn() } as unknown as ChartBaseTestHostComponent['chart'];
    component.selectedExchange = exchange(1, 'Bybit');
    component.selectedTimeframe = '1h';
    TestBed.inject(DrawingToolsService).setDrawings([]);
  });

  it('shows key zones by default', () => {
    expect(defaultShowKeyZones).toBe(true);
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

      expect(component.boxes.map((b) => b.Id)).toEqual(['eth']);
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

      // ChartBaseTestHostComponent boxes are timeframe-scoped: requested again for 4h.
      expect(boxes.requests).toHaveLength(2);
      expect(boxes.requests[1].args).toEqual(['BTCUSDT', 'boxes', '4h']);
      respond(boxes.requests[1], [{ Id: 'b4h', ZoneMin: 100, ZoneMax: 103, PositionType: 'LONG' }]);
      expect(component.boxes.map((b) => b.Id)).toEqual(['b4h']);

      // Loaded for this context: another stream-only change does not refetch.
      component.onTimeframeChange('4h');
      respond(candleRequests()[2], apiCandles(100));
      expect(boxes.requests).toHaveLength(2);
    });
  });

  // ── Loading flag ──────────────────────────────────────────────────────────

  describe('settings-panel selections', () => {
    /** Payloads of every patchChartSettings dispatch, in order. */
    const storedPatches = (): ChartDeviceSettings[] =>
      settings['dispatchAppAction'].mock.calls
        .map(([action]) => action)
        .filter((action: { type: string }) => action.type === SettingsActions.patchChartSettings.type)
        .map((action: { settings: ChartDeviceSettings }) => action.settings);

    it('applies the selections stored on this device before the first load', () => {
      deviceSettings = {
        showOrders: false,
        showKeyZones: true,
        showMarketCipher: true,
        showDivergences: true,
        boxMode: 'all',
        keyZoneLayers: { levels: false },
        capitalFlowTiers: { gold: false },
      };

      (component as unknown as { restoreDeviceChartSettings(): void }).restoreDeviceChartSettings();
      loadSymbol('BTCUSDT');

      expect(component.boxMode).toBe('all');
      expect(component.keyZoneLayers['levels' as keyof typeof component.keyZoneLayers]).toBe(false);
      expect(component.capitalFlowFilter).toEqual({ bronze: true, silver: true, gold: false, platinum: true });
      expect(chartService.getKeyZones.requests).toHaveLength(1);
      expect(chartService.getTradeOrders.requests).toHaveLength(0);
      // The signal overlays load once the symbol's key zones are in.
      respond(chartService.getKeyZones.requests[0], { VolumeProfiles: [], FibLevels: [] });
      expect(indicators['fetchMarketCipherSignals']).toHaveBeenCalledTimes(1);
      expect(indicators['fetchDivergences']).toHaveBeenCalledTimes(1);
      // Restoring writes nothing back.
      expect(storedPatches()).toEqual([]);
      expect(chartService.saveChartState).not.toHaveBeenCalled();
    });

    it('restores only drawings from the backend chart state, never its settings', () => {
      component.showOrders = false;
      component.showDivergences = true;
      component.showKeyZones = true;
      const drawing = { id: 'd', type: 'horizontal-line', points: [{ x: 1, y: 101 }], color: '#fff', lineWidth: 1 } as Drawing;
      chartService.loadChartState.mockReturnValue(
        of({ drawings: [drawing], settings: { showDivergences: false, showKeyZones: false } }),
      );

      loadSymbol('BTCUSDT');
      component.onTimeframeChange('4h');
      respond(candleRequests()[candleRequests().length - 1], apiCandles(100));

      expect(component.showDivergences).toBe(true);
      expect(component.showKeyZones).toBe(true);
      expect(TestBed.inject(DrawingToolsService).drawingsValue.map((d) => d.id)).toEqual(['d']);
      expect(chartService.saveChartState).not.toHaveBeenCalled();
    });

    it('does not draw fetched boxes while boxes are switched off', () => {
      component.showOrders = false;
      component.showBoxes = false;
      boxesService.getBoxes.mockReturnValue(of([{ Id: 'b', ZoneMin: 100, ZoneMax: 103, PositionType: 'LONG' }]));

      loadSymbol('BTCUSDT');

      expect(component.chartData.datasets.some((d: any) => d.isBox)).toBe(false);
    });

    it('stores every toggle on this device, without a backend save', () => {
      component.showOrders = false;
      loadSymbol('BTCUSDT');
      settings['dispatchAppAction'].mockClear();

      component.showOrders = true;
      component.onOrdersToggle();
      component.showIndicators = false;
      component.onToggleIndicators();
      component.showBoxes = false;
      component.onBoxesToggle();
      component.onBoxModeChange('all');
      component.toggleTier('silver', false);
      component.toggleKeyZoneLayer(component.keyZoneLayerOptions[0].key, false);

      const patches = storedPatches();
      expect(patches).toHaveLength(6);
      expect(patches[0].showOrders).toBe(true);
      expect(patches[1].showIndicators).toBe(false);
      expect(patches[2].showBoxes).toBe(false);
      // A box mode change also switches the boxes back on.
      expect(patches[3]).toMatchObject({ boxMode: 'all', showBoxes: true });
      expect(patches[4].capitalFlowTiers).toMatchObject({ silver: false });
      expect(patches[5].keyZoneLayers?.[component.keyZoneLayerOptions[0].key]).toBe(false);
      expect(chartService.saveChartState).not.toHaveBeenCalled();
    });

    it('reuses fetched divergences when toggled off and on, refetches after a new bar', () => {
      component.showOrders = false;
      component.showDivergences = true;
      loadSymbol('BTCUSDT');
      expect(indicators['fetchDivergences']).toHaveBeenCalledTimes(1);
      const fetchArgs = (indicators['fetchDivergences'] as any).mock.calls[0][0];
      expect(fetchArgs.from).toBe(component.baseData[0]?.x);

      component.showDivergences = false;
      component.onToggleDivergences();
      component.showDivergences = true;
      component.onToggleDivergences();
      expect(indicators['fetchDivergences']).toHaveBeenCalledTimes(1);

      const last = component.baseData[component.baseData.length - 1];
      component.baseData = [...component.baseData, { ...last, x: last.x + 3_600_000 }];
      component.showDivergences = false;
      component.onToggleDivergences();
      component.showDivergences = true;
      component.onToggleDivergences();
      expect(indicators['fetchDivergences']).toHaveBeenCalledTimes(2);
    });

    it('redraws cached key zones after the candles of a new timeframe load', () => {
      component.showOrders = false;
      component.showKeyZones = true;
      loadSymbol('BTCUSDT');
      respond(chartService.getKeyZones.requests[0], { VolumeProfiles: [], FibLevels: [] });
      const redraw = vi.spyOn(component, 'addKeyZoneDatasets');

      component.onTimeframeChange('4h');
      respond(candleRequests()[candleRequests().length - 1], apiCandles(100));

      // Symbol-scoped key zones are not refetched, only redrawn from cache.
      expect(chartService.getKeyZones.requests).toHaveLength(1);
      expect(redraw).toHaveBeenCalled();
      expect(component.showKeyZones).toBe(true);
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

  // ── Interaction state machine (T11) ───────────────────────────────────────

  describe('interaction state machine (T11)', () => {
    /** A plain 800x600 chart over 40000..60000 for the real (root) interaction service. */
    const gestureChart = () => ({
      canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) as DOMRect },
      chartArea: { left: 0, right: 800, top: 0, bottom: 600 },
      scales: {
        x: { min: 40_000, max: 60_000, options: {} as { min?: number; max?: number } },
        y: { min: 100, max: 200, options: {} as { min?: number; max?: number } },
      },
      data: { datasets: [{ type: 'candlestick', data: Array.from({ length: 100 }, (_, i) => ({ x: i * 1000, h: 110 + i, l: 90 + i })) }] },
      config: { options: { scales: {} } },
      width: 800,
      height: 600,
      update: vi.fn(),
      draw: vi.fn(),
    });
    type Inter = import('./services/chart-interaction.service').ChartInteractionService;
    const inter = () => (component as unknown as { interaction: Inter }).interaction;
    const mouse = (x: number, y: number) => ({ button: 0, clientX: x, clientY: y }) as MouseEvent;
    const touches = (...pts: Array<[number, number]>) =>
      ({ touches: pts.map(([clientX, clientY]) => ({ clientX, clientY })), preventDefault: vi.fn() }) as unknown as TouchEvent;

    it('destroy (route navigation) mid-gesture ends every gesture kind; nothing survives into the next page', () => {
      const starts: Array<[string, (ref: any) => void]> = [
        ['pan', (r) => inter().onMouseDown(mouse(400, 300), r)],
        ['zoom-x', (r) => inter().onMouseDown(mouse(400, 650), r)],
        ['zoom-y', (r) => inter().onMouseDown(mouse(850, 300), r)],
        ['pinch', (r) => { inter().onTouchStart(touches([400, 300]), r); inter().onTouchStart(touches([350, 300], [450, 300]), r); }],
        ['mcb-value-scale', () => inter().claimGesture('mcb-value-scale')],
      ];
      for (const [name, start] of starts) {
        const ref = gestureChart();
        inter().setRanges({ min: 0, max: 99_000 }, { min: -10_000, max: 109_000 }, { min: 90, max: 209 });
        start(ref);
        expect(inter().activeGesture, name).toBe(name);
        component.ngOnDestroy();
        expect(inter().activeGesture, name).toBeNull();
        expect(inter().gestureType, name).toBeNull();
        expect(inter().isInteracting, name).toBe(false);
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700, clientY: 500 }));
        expect(ref.scales.x.options, name).toEqual({});
        expect(ref.scales.y.options, name).toEqual({});
      }
    });

    it('destroy drops a pinned touch crosshair (it would block pan/zoom on the next page)', () => {
      inter().pinCrosshair();
      component.ngOnDestroy();
      expect(inter().isCrosshairPinned).toBe(false);
    });

    it('a dblclick whose first click was a drag resets no axis', () => {
      chartStub.chartArea = { left: 0, right: 700, top: 0, bottom: 900 };
      const priceReset = vi.spyOn(inter(), 'resetPriceScale').mockImplementation(() => undefined);
      const fullscreen = vi.spyOn(component, 'toggleFullscreen').mockImplementation(() => undefined);
      const followsDrag = vi.spyOn(inter(), 'doubleClickFollowsDrag', 'get').mockReturnValue(true);
      component.onContainerDblClick({ clientX: 750, clientY: 400 } as MouseEvent);
      component.onContainerDblClick({ clientX: 300, clientY: 400 } as MouseEvent);
      expect(priceReset).not.toHaveBeenCalled();
      expect(fullscreen).not.toHaveBeenCalled();
      followsDrag.mockReturnValue(false);
      component.onContainerDblClick({ clientX: 750, clientY: 400 } as MouseEvent);
      expect(priceReset).toHaveBeenCalledTimes(1);
    });

    it('a drawing drag and a drawing-tool drag count as drags for the dblclick that follows (T12 carry-over)', () => {
      chartStub.chartArea = { left: 0, right: 700, top: 0, bottom: 900 };
      const priceReset = vi.spyOn(inter(), 'resetPriceScale').mockImplementation(() => undefined);
      const tools = TestBed.inject(DrawingToolsService);
      // y price 900 = 100 px down (stub: 1 px per price unit from y = 1000)
      tools.setDrawings([{ id: 'h', type: 'horizontal-line', color: '#fff', lineWidth: 1, points: [{ x: Date.UTC(2026, 0, 1), y: 900 }] } as Drawing]);
      const press = (x: number, y: number, path: Array<[number, number]> = []) => {
        component.onMouseDown(mouse(x, y));
        for (const [mx, my] of path) component.onMouseMove(mouse(mx, my));
        component.onMouseUp(mouse(x, y));
      };

      // drag the line away and back to the press point, then a click on it: no double click
      press(10, 100, [[10, 180], [10, 100]]);
      press(10, 100);
      expect(inter().doubleClickFollowsDrag).toBe(true);
      component.onContainerDblClick({ clientX: 750, clientY: 400 } as MouseEvent);
      expect(priceReset).not.toHaveBeenCalled();
      // two plain clicks on the line form a double click again
      press(10, 100);
      expect(inter().doubleClickFollowsDrag).toBe(false);

      // drawing tool active: a press dragged over the price axis (no point added there), then a click
      tools.setDrawings([]);
      tools.selectTool('trend-line');
      press(750, 400, [[750, 470], [750, 400]]);
      press(750, 400);
      expect(tools.pendingDrawingPoints).toHaveLength(0);
      expect(inter().doubleClickFollowsDrag).toBe(true);
      component.onContainerDblClick({ clientX: 750, clientY: 400 } as MouseEvent);
      expect(priceReset).not.toHaveBeenCalled();
      press(750, 400);
      expect(inter().doubleClickFollowsDrag).toBe(false);
      tools.cancelDrawing();
    });

    it('a gesture between two taps breaks the double-tap pair', () => {
      chartStub.chartArea = { left: 0, right: 700, top: 0, bottom: 900 };
      const priceReset = vi.spyOn(inter(), 'resetPriceScale').mockImplementation(() => undefined);
      const end = { touches: [], changedTouches: [{ clientX: 750, clientY: 400 }], preventDefault: vi.fn() } as unknown as TouchEvent;
      const touchEnd = vi.spyOn(inter(), 'onTouchEnd');
      touchEnd.mockReturnValueOnce({ x: 750, y: 400 }).mockReturnValueOnce(null).mockReturnValueOnce({ x: 752, y: 400 });
      component.onTouchEnd(end); // tap
      component.onTouchEnd(end); // a pan / pinch ended
      component.onTouchEnd(end); // tap
      expect(priceReset).not.toHaveBeenCalled();
    });

    it('touchcancel ends the touch gesture via the service and a drawing drag', () => {
      const cancel = vi.spyOn(inter(), 'onTouchCancel');
      const internals = component as unknown as { _draggingLineId: string | null };
      internals._draggingLineId = 'line-1';
      component.onTouchCancel();
      expect(internals._draggingLineId).toBeNull();
      expect(cancel).toHaveBeenCalledTimes(1);
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
    it('has no candlestick edge offset on the x-axis (shared TimeScale pane alignment)', () => {
      expect(component.chartOptions.scales.x.offset).toBe(false);
    });

    const format = (val: number) =>
      (component as unknown as { formatTimeTick: (v: number) => string }).formatTimeTick(val);

    it('uses the month format for 1M and the time format for 1m', () => {
      const t = new Date(2026, 8, 1, 14, 30).getTime();
      component.selectedTimeframe = '1M';
      expect(format(t)).toBe('Sep');
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

  describe('double-click / double-tap resets (T7)', () => {
    type Inter = {
      resetPriceScale: (...a: unknown[]) => void;
      resetTimeScale: (...a: unknown[]) => boolean;
      zoomToLatest: (...a: unknown[]) => void;
      onTouchEnd: (...a: unknown[]) => { x: number; y: number } | null;
      yAutoScale: boolean;
    };
    let inter: Inter;
    let priceReset: ReturnType<typeof vi.spyOn>;
    let timeReset: ReturnType<typeof vi.spyOn>;
    let latest: ReturnType<typeof vi.spyOn>;
    let fullscreen: ReturnType<typeof vi.spyOn>;
    const dbl = (x: number, y: number) => ({ clientX: x, clientY: y }) as MouseEvent;

    beforeEach(() => {
      chartStub.chartArea = { left: 0, right: 700, top: 0, bottom: 900 };
      chartStub.data.datasets = [{ data: [] }];
      inter = (component as unknown as { interaction: Inter }).interaction;
      priceReset = vi.spyOn(inter, 'resetPriceScale').mockImplementation(() => undefined);
      timeReset = vi.spyOn(inter, 'resetTimeScale').mockReturnValue(true);
      latest = vi.spyOn(inter, 'zoomToLatest');
      fullscreen = vi.spyOn(component, 'toggleFullscreen').mockImplementation(() => undefined);
    });

    it('price-axis double click fits the price, time-axis double click resets the time scale, never jumps to the latest candle', () => {
      component.onContainerDblClick(dbl(750, 400));
      expect(priceReset).toHaveBeenCalledTimes(1);
      expect(timeReset).not.toHaveBeenCalled();
      component.onContainerDblClick(dbl(300, 950));
      expect(timeReset).toHaveBeenCalledTimes(1);
      expect(priceReset).toHaveBeenCalledTimes(1);
      expect(latest).not.toHaveBeenCalled();
    });

    it('plot double click changes nothing chart-wise (no price or time reset, no Y mode change)', () => {
      inter.yAutoScale = false;
      component.onContainerDblClick(dbl(300, 400));
      expect(priceReset).not.toHaveBeenCalled();
      expect(timeReset).not.toHaveBeenCalled();
      expect(latest).not.toHaveBeenCalled();
      expect(inter.yAutoScale).toBe(false);
      expect(chartStub.update).not.toHaveBeenCalled();
      expect(fullscreen).toHaveBeenCalledTimes(1); // pre-existing, not a chart view change
    });

    it('hit regions: the last plot pixel is the plot, one pixel further is the axis', () => {
      component.onContainerDblClick(dbl(700, 400));
      component.onContainerDblClick(dbl(300, 900));
      expect(priceReset).not.toHaveBeenCalled();
      expect(timeReset).not.toHaveBeenCalled();
      component.onContainerDblClick(dbl(701, 400));
      component.onContainerDblClick(dbl(300, 901));
      expect(priceReset).toHaveBeenCalledTimes(1);
      expect(timeReset).toHaveBeenCalledTimes(1);
    });

    describe('double tap', () => {
      const endEvent = (x: number, y: number) =>
        ({ touches: [], changedTouches: [{ clientX: x, clientY: y }], preventDefault: vi.fn() }) as unknown as TouchEvent;
      const doubleTap = (x: number, y: number) => {
        vi.spyOn(inter, 'onTouchEnd').mockReturnValue({ x, y });
        component.onTouchEnd(endEvent(x, y));
        component.onTouchEnd(endEvent(x + 2, y));
      };

      it('on the price axis = price-axis double click, on the time axis = time-axis double click', () => {
        doubleTap(750, 400);
        expect(priceReset).toHaveBeenCalledTimes(1);
        expect(timeReset).not.toHaveBeenCalled();
        doubleTap(300, 950);
        expect(timeReset).toHaveBeenCalledTimes(1);
        expect(latest).not.toHaveBeenCalled();
      });

      it('on the plot does nothing', () => {
        doubleTap(300, 400);
        expect(priceReset).not.toHaveBeenCalled();
        expect(timeReset).not.toHaveBeenCalled();
      });
    });
  });

  describe('price auto scale on live candles (T7)', () => {
    const setup = () => {
      loadSymbol('BTCUSDT');
      const inter = (component as unknown as { interaction: { yAutoScale: boolean } }).interaction;
      chartStub.data.datasets = [{ data: component.baseData }];
      chartStub.scales.x.min = component.baseData[0].x;
      chartStub.scales.x.max = component.baseData[component.baseData.length - 1].x;
      chartStub.scales.y.min = 0;
      chartStub.scales.y.max = 1;
      return inter;
    };

    it('refits y to a new visible high while auto scale is on, and keeps auto on', () => {
      const inter = setup();
      inter.yAutoScale = true;
      const openTime = component.baseData[component.baseData.length - 1].x;
      lastStream().updates.next(liveUpdate({ openTime, high: 500, low: 1, close: 250 }));
      flushRaf();
      expect((chartStub.scales.y.options as { max: number }).max).toBeGreaterThan(500);
      expect((chartStub.scales.y.options as { min: number }).min).toBeLessThan(1);
      expect(inter.yAutoScale).toBe(true);
    });

    it('keeps a vertical plot drag offset through live flushes during the drag', () => {
      const inter = setup() as { yAutoScale: boolean; isInteracting: boolean };
      inter.yAutoScale = true;
      const yOpts = chartStub.scales.y.options as { min?: number; max?: number };
      const openTime = component.baseData[component.baseData.length - 1].x;
      inter.isInteracting = true;
      yOpts.min = 1000; yOpts.max = 1100; // the user dragged the plot vertically
      lastStream().updates.next(liveUpdate({ openTime, high: 500, low: 1, close: 250 }));
      flushRaf();
      expect(yOpts).toEqual({ min: 1000, max: 1100 });
      expect(inter.yAutoScale).toBe(true);
    });

    it('keeps the y offset after the drag while live candles stay inside the y range', () => {
      const inter = setup() as { yAutoScale: boolean; isInteracting: boolean };
      inter.yAutoScale = true;
      const yOpts = chartStub.scales.y.options as { min?: number; max?: number };
      const openTime = component.baseData[component.baseData.length - 1].x;
      yOpts.min = 50; yOpts.max = 150; // shifted range that still holds the last candle
      lastStream().updates.next(liveUpdate({ openTime, high: 120, low: 100, close: 110 }));
      flushRaf();
      expect(yOpts).toEqual({ min: 50, max: 150 });
      // a candle leaving the range does refit (the original off-screen bug)
      lastStream().updates.next(liveUpdate({ openTime, high: 500, low: 100, close: 110 }));
      flushRaf();
      expect(yOpts.max!).toBeGreaterThan(500);
      expect(inter.yAutoScale).toBe(true);
    });

    it('does not touch a manual y range and keeps manual', () => {
      const inter = setup();
      inter.yAutoScale = false;
      const before = { ...(chartStub.scales.y.options as object) };
      const openTime = component.baseData[component.baseData.length - 1].x;
      lastStream().updates.next(liveUpdate({ openTime, high: 500, low: 1, close: 250 }));
      flushRaf();
      expect(chartStub.scales.y.options).toEqual(before);
      expect(inter.yAutoScale).toBe(false);
    });
  });

  describe('realtime follow (T10)', () => {
    const HOUR = 3_600_000;
    type Inter = {
      liveFollowState: 'following' | 'detached';
      detachLiveFollow: () => void;
      followLiveBars: (...a: unknown[]) => boolean;
      liveFollowRequests$: unknown;
    };
    let inter: Inter;
    const xOpts = () => chartStub.scales.x.options as { min?: number; max?: number };
    const lastX = () => component.baseData[component.baseData.length - 1].x as number;

    /** 50 hourly candles, the view at the live edge: 30 bars + 3 empty bars right of the last candle. */
    const setup = () => {
      loadSymbol('BTCUSDT', 100, apiCandles(100, 50));
      flushRaf();
      inter = (component as unknown as { interaction: Inter }).interaction;
      chartStub.data.datasets = [{ type: 'candlestick', data: component.baseData }];
      chartStub.scales.x.min = lastX() - 30 * HOUR;
      chartStub.scales.x.max = lastX() + 3 * HOUR;
      chartStub.scales.x.options = {};
      chartStub.update.mockClear();
    };
    const tick = (openTime: number, close = 150) =>
      lastStream().updates.next(liveUpdate({ openTime, high: close + 1, low: close - 1, close }));

    it('(a) a tick on the open candle never writes the x range, spacing or follow state', () => {
      setup();
      const follow = vi.spyOn(inter, 'followLiveBars');
      const before = { min: chartStub.scales.x.min, max: chartStub.scales.x.max };
      tick(lastX(), 151);
      tick(lastX(), 152);
      flushRaf();
      expect(follow).not.toHaveBeenCalled();
      expect({ min: chartStub.scales.x.min, max: chartStub.scales.x.max }).toEqual(before);
      expect(xOpts()).toEqual({});
      expect(inter.liveFollowState).toBe('following');
      expect(chartStub.update).toHaveBeenCalledTimes(1);
    });

    it('(b) a new bar while following shifts the range by one bar before the single update of the frame', () => {
      setup();
      const before = { min: chartStub.scales.x.min, max: chartStub.scales.x.max };
      let rangeAtUpdate: { min?: number; max?: number } | null = null;
      chartStub.update.mockImplementation(() => {
        rangeAtUpdate = { ...xOpts() };
      });
      tick(lastX() + HOUR);
      flushRaf();
      expect(chartStub.update).toHaveBeenCalledTimes(1);
      expect(rangeAtUpdate!.min).toBeCloseTo(before.min + HOUR, 3);
      expect(rangeAtUpdate!.max).toBeCloseTo(before.max + HOUR, 3);
      expect(inter.liveFollowState).toBe('following');
    });

    it('(c) a new bar while detached leaves the range as is; the candle joins the dataset', () => {
      setup();
      inter.detachLiveFollow();
      const before = { min: chartStub.scales.x.min, max: chartStub.scales.x.max };
      const openTime = lastX() + HOUR;
      tick(openTime);
      flushRaf();
      expect({ min: chartStub.scales.x.min, max: chartStub.scales.x.max }).toEqual(before);
      expect(xOpts()).toEqual({});
      const data = (chartStub.data.datasets[0] as { data: Array<{ x: number }> }).data;
      expect(data[data.length - 1].x).toBe(openTime);
      expect(inter.liveFollowState).toBe('detached');
    });

    it('(d) two bars appended before one flush shift the range by two bars', () => {
      setup();
      const before = { min: chartStub.scales.x.min, max: chartStub.scales.x.max };
      const first = lastX() + HOUR;
      tick(first);
      tick(first + HOUR);
      flushRaf();
      expect(xOpts().min!).toBeCloseTo(before.min + 2 * HOUR, 3);
      expect(xOpts().max!).toBeCloseTo(before.max + 2 * HOUR, 3);
    });

    it('appended bars widen the overscroll limit and the box overlays\' extended max with it', () => {
      setup();
      const ext = (inter as unknown as { extendedDataRange: { min: number; max: number } }).extendedDataRange;
      const before = ext.max;
      inter.detachLiveFollow();
      tick(lastX() + HOUR);
      tick(lastX() + HOUR);
      flushRaf();
      expect(ext.max).toBe(before + 2 * HOUR);
      expect((window as unknown as { __chartExtendedMax: number }).__chartExtendedMax).toBe(ext.max);
    });

    it('(f) symbol, timeframe and exchange changes reset to following', () => {
      setup();
      inter.detachLiveFollow();
      component.onSymbolChange(symbol('ETHUSDT'));
      expect(inter.liveFollowState).toBe('following');
      inter.detachLiveFollow();
      component.onTimeframeChange('4h');
      expect(inter.liveFollowState).toBe('following');
      inter.detachLiveFollow();
      component.onExchangeChange(exchange(2, 'Kraken'));
      expect(inter.liveFollowState).toBe('following');
    });

    it('(f) the default view of a candle load (presetRecentRange) resets to following', () => {
      setup();
      inter.detachLiveFollow();
      loadSymbol('ETHUSDT', 2000, apiCandles(2000, 50));
      expect(inter.liveFollowState).toBe('following');
    });

    it('(h) global follow command: true = go to realtime (following), false = stop following', () => {
      setup();
      const requests = new Subject<boolean>();
      inter.liveFollowRequests$ = requests;
      (component as unknown as { subscribeLiveFollowRequests: () => void }).subscribeLiveFollowRequests();
      const toRealtime = vi.spyOn(component, 'goToRealtime');
      chartStub.scales.x.min = lastX() - 45 * HOUR; // viewing history
      chartStub.scales.x.max = lastX() - 15 * HOUR;
      inter.detachLiveFollow();
      requests.next(true);
      expect(toRealtime).toHaveBeenCalledTimes(1);
      expect(inter.liveFollowState).toBe('following');
      expect(xOpts().max!).toBeCloseTo(lastX() + 3 * HOUR, 3);
      requests.next(false);
      expect(inter.liveFollowState).toBe('detached');
      expect(xOpts().max!).toBeCloseTo(lastX() + 3 * HOUR, 3);
    });

    it('(i) the "Return to live" control is visible only while detached', () => {
      setup();
      expect(component.showReturnToLive).toBe(false);
      inter.detachLiveFollow();
      expect(component.showReturnToLive).toBe(true);
      component.goToRealtime();
      expect(inter.liveFollowState).toBe('following');
      expect(component.showReturnToLive).toBe(false);
      // next to the time / price axes: bottom-right corner of the plot
      chartStub.chartArea = { left: 0, right: 700, top: 0, bottom: 900 };
      expect(component.returnToLivePosition).toEqual({ right: 108, bottom: 108 });
    });
  });
});
