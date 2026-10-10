/**
 * MarketCipherBChartComponent lifecycle tests: the viewport fit after a
 * timeframe load runs in (tracked) animation frames, and neither a destroy nor
 * a newer selection change may let those frames start a live stream.
 * Template and Chart.js are stubbed; no canvas is needed.
 */
import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { MarketCipherBChartComponent } from './market-cipher-b-chart.component';
import { ChartBoxesService } from '../chart/services/chart-boxes.service';
import { ChartIndicatorsService } from '../chart/services/chart-indicators.service';
import { ChartPriceTickerService } from '../chart/services/chart-price-ticker.service';
import { ExchangeStreamFactory } from '../chart/services/exchange-stream.factory';
import { KeyZoneSettingsService } from 'src/app/helpers/key-zone-settings.service';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';

function apiCandles(count = 60) {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: count }, (_, i) => ({
    Time: new Date(start + i * 3_600_000).toISOString(),
    Open: 100 + i,
    High: 103 + i,
    Low: 98 + i,
    Close: 101 + i,
  }));
}

function makeChartStub() {
  const scale = () => ({
    min: 0,
    max: 0,
    options: {} as Record<string, unknown>,
    getPixelForValue: (v: number) => Number(v) / 1e6,
    getValueForPixel: (p: number) => p * 1e6,
  });
  return {
    scales: { x: scale(), y: scale() },
    chartArea: { left: 0, right: 800, top: 0, bottom: 600 },
    canvas: { getBoundingClientRect: () => ({ left: 0, top: 0 }) },
    width: 800,
    height: 600,
    data: { datasets: [] as unknown[] },
    config: { options: { scales: {} } },
    update: vi.fn(),
    draw: vi.fn(),
  };
}

describe('MarketCipherBChartComponent (lifecycle)', () => {
  let component: MarketCipherBChartComponent;
  let factory: { create: ReturnType<typeof vi.fn> };
  let candleRequests: Array<Subject<unknown>>;
  let rafQueue: Map<number, FrameRequestCallback>;

  const runFrames = (callbacks: FrameRequestCallback[]) => callbacks.forEach((cb) => cb(0));
  const flushRaf = () => {
    const callbacks = [...rafQueue.values()];
    rafQueue.clear();
    runFrames(callbacks);
  };

  beforeEach(async () => {
    rafQueue = new Map();
    let rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafQueue.set(++rafId, cb);
      return rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn((id: number) => rafQueue.delete(id)));

    candleRequests = [];
    factory = {
      create: vi.fn(() => ({
        exchangeName: 'Fake',
        connectKlineStream: vi.fn(() => new Subject()),
        disconnect: vi.fn(),
      })),
    };

    await TestBed.configureTestingModule({
      imports: [MarketCipherBChartComponent],
      providers: [
        {
          provide: ChartService,
          useValue: {
            getExchanges: () => of([]),
            getSymbols: () => of([]),
            getCandles: vi.fn(() => {
              const s = new Subject<unknown>();
              candleRequests.push(s);
              return s.asObservable();
            }),
            loadChartState: () => of(null),
            saveChartState: () => of(null),
            getSymbolPredictions: () => of(null),
            getKeyZones: () => of({ VolumeProfiles: [], FibLevels: [] }),
            getTradeOrders: () => of([]),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            dispatchAppAction: vi.fn(),
            setSelectedExchange: vi.fn(),
            getSelectedExchange: () => of(null),
            getEffectiveUiMode: () => of('mobile'),
            getSelectedSymbol: () => of(null),
            getSelectedTimeframe: () => of(null),
            getChartSettings: () => of({}),
          },
        },
        { provide: ChartBoxesService, useValue: { getBoxes: () => of([]) } },
        {
          provide: ChartIndicatorsService,
          useValue: {
            fetchCapitalFlowSignals: () => of([]),
            buildCapitalFlowDatasets: () => [],
          },
        },
        { provide: ExchangeStreamFactory, useValue: factory },
        {
          provide: KeyZoneSettingsService,
          useValue: {
            settings$: of({ enabled: true, timeframes: {} }),
            getSettings: () => ({ enabled: true, timeframes: {} }),
            getTimeframeFlags: () => ({}),
            getAvailableTimeframes: () => [],
            isAllTimeframesEnabled: () => true,
          },
        },
      ],
    })
      .overrideComponent(MarketCipherBChartComponent, {
        set: {
          template: '',
          imports: [],
          providers: [
            { provide: ChartPriceTickerService, useValue: { connect: () => new Subject(), disconnect: vi.fn() } },
          ],
        },
      })
      .compileComponents();

    component = TestBed.createComponent(MarketCipherBChartComponent).componentInstance;
    component.chart = { chart: makeChartStub(), update: vi.fn() } as unknown as MarketCipherBChartComponent['chart'];
    const ex = new Exchange();
    ex.Id = 1;
    ex.Name = 'Bybit';
    component.selectedExchange = ex;
    const sym = new SymbolModel();
    sym.SymbolName = 'BTCUSDT';
    component.selectedSymbol = sym;
  });

  afterEach(() => vi.unstubAllGlobals());

  it('has no x-axis edge offset on the main chart nor the MCB panel (pane alignment)', () => {
    expect(component.chartOptions.scales.x.offset).toBe(false);
    expect(component.mcbChartOptions.scales.x.offset).toBe(false);
  });

  it('exactly one visible time axis: the MCB pane carries it, the main chart hides its own', () => {
    expect(component.chartOptions.scales.x.display).toBe(false);
    expect(component.chartOptions.scales.x.ticks.display).toBe(false);
    expect(component.mcbChartOptions.scales.x.display).toBe(true);
  });

  it('the MCB panel cannot be switched off: with every MCB part hidden it stays (and keeps the time axis)', () => {
    const internals = component as unknown as { applyAuxPanelSetting(key: string, on: boolean): void };
    component.baseData = Array.from({ length: 60 }, (_, i) => ({ x: i * 3_600_000, o: 100, h: 103, l: 98, c: 101 })) as never;
    for (const key of Object.keys(component.mcbVisibility)) internals.applyAuxPanelSetting(key, false);
    expect(Object.values(component.mcbVisibility).every((v) => v === false)).toBe(true);
    expect(component.auxPanel).not.toBeNull();
    expect(component.chartOptions.scales.x.display).toBe(false);
  });

  describe('MCB plot host wheel', () => {
    type Internals = {
      mcbPlotHost: { wheel(event: WheelEvent): void };
      interaction: { timeScale: { setPlot(l: number, r: number): void } };
      linkedScale: { mcbPlotDelta: { left: number; right: number } };
      getMcbChartJsRef(): unknown;
    };
    const event = { clientX: 250 } as WheelEvent;

    it('anchors at the pane x in the main plot frame (exact plot offset)', () => {
      const internals = component as unknown as Internals;
      const wheel = vi.spyOn(component, 'onWheel').mockImplementation(() => undefined);
      vi.spyOn(internals, 'getMcbChartJsRef').mockReturnValue({
        canvas: { getBoundingClientRect: () => ({ left: 50, top: 0 }) },
        chartArea: { left: 100, right: 900, top: 0, bottom: 150 },
      });
      internals.linkedScale.mcbPlotDelta = { left: 3, right: -3 };
      try {
        internals.mcbPlotHost.wheel(event);
        // 250 - canvas 50 - plot 100 = 100 across the MCB plot, +3 offset into the main plot frame
        expect(wheel).toHaveBeenCalledWith(event, 103);
      } finally {
        internals.linkedScale.mcbPlotDelta = { left: 0, right: 0 };
      }
    });

    it('anchors at the right edge when the pane chart is not built yet (NaN)', () => {
      const internals = component as unknown as Internals;
      const wheel = vi.spyOn(component, 'onWheel').mockImplementation(() => undefined);
      vi.spyOn(internals, 'getMcbChartJsRef').mockReturnValue(null);
      internals.interaction.timeScale.setPlot(40, 840);
      internals.mcbPlotHost.wheel(event);
      expect(wheel).toHaveBeenCalledWith(event, 800);
    });
  });

  function resolveCandles(index: number): void {
    candleRequests[index].next(apiCandles());
    candleRequests[index].complete();
  }

  it('starts the live stream after the viewport frames of a timeframe load', () => {
    component.onTimeframeChange('4h');
    resolveCandles(0);
    expect(component.loading).toBe(false);
    // The stream waits for the (double) animation-frame viewport fit.
    expect(factory.create).not.toHaveBeenCalled();
    flushRaf();
    flushRaf();
    expect(factory.create).toHaveBeenCalledTimes(1);
  });

  it('does not start a stream from animation frames that were pending at destroy', () => {
    component.onTimeframeChange('4h');
    resolveCandles(0);
    const internals = component as unknown as { _pendingRafs: Set<number>; _mcbRebuildRaf: number | null };
    // Viewport-fit frame and MCB rebuild frame owned by the component.
    const ownedIds = [...internals._pendingRafs, internals._mcbRebuildRaf].filter((id): id is number => id != null);
    expect(ownedIds.length).toBeGreaterThanOrEqual(2);
    const pendingCallbacks = [...rafQueue.values()];

    component.ngOnDestroy();

    ownedIds.forEach((id) => {
      expect(cancelAnimationFrame).toHaveBeenCalledWith(id);
      expect(rafQueue.has(id)).toBe(false);
    });
    // Even if the browser still ran them (cancel raced the frame):
    runFrames(pendingCallbacks);
    flushRaf();
    expect(factory.create).not.toHaveBeenCalled();
  });

  it('does not start a stream from frames of a superseded timeframe load', () => {
    component.onTimeframeChange('4h');
    resolveCandles(0);
    component.onTimeframeChange('1d');
    flushRaf();
    flushRaf();
    expect(factory.create).not.toHaveBeenCalled();

    resolveCandles(1);
    flushRaf();
    flushRaf();
    expect(factory.create).toHaveBeenCalledTimes(1);
  });

  describe('momentum trendlines', () => {
    const T0 = Date.UTC(2026, 0, 1);
    const H = 3_600_000;
    const trendlines = (price: number) => ({
      Version: 1,
      EndTimeMs: T0 + 59 * H,
      ClosedCount: 60,
      Regime: 'Positive',
      StructureStatus: 'Established',
      Dominant: null,
      PendingDominant: null,
      Internal: [],
      Lines: [
        {
          Id: 'a:Dominant',
          Role: 'Dominant',
          IsConfirmed: true,
          IsVisible: true,
          Regime: 'Positive',
          Osc: { T1: T0 + 10 * H, V1: -60, T2: T0 + 20 * H, V2: -40, EndT: T0 + 59 * H, EndV: 0 },
          Price: { T1: T0 + 10 * H, P1: price, T2: T0 + 20 * H, P2: price + 10, EndT: T0 + 59 * H, EndP: 0 },
        },
      ],
    });
    const respond = (tf: string, tl: unknown) =>
      ({ TimeframeResults: [{ Timeframe: tf, Trendlines: tl }, { Timeframe: '1h', Trendlines: null }] });

    type TlInternals = {
      loadPredictions(): void;
      rebuildMcbPanelDatasets(candles: unknown[]): void;
    };
    const loadWith = (response: unknown) => {
      (TestBed.inject(ChartService) as unknown as { getSymbolPredictions: () => unknown }).getSymbolPredictions =
        () => of(response);
      (component as unknown as TlInternals).loadPredictions();
    };
    const priceTl = () => (component.chartData.datasets as Array<{ isMcbTrendline?: boolean }>).filter((d) => d.isMcbTrendline);
    const oscTl = () => (component.mcbChartData.datasets as unknown as Array<{ isMcbTrendline?: boolean }>).filter((d) => d.isMcbTrendline);

    beforeEach(() => {
      component.onTimeframeChange('4h');
      resolveCandles(0);
      flushRaf();
      flushRaf();
    });

    it('injects price trendlines for the exact timeframe and replaces (not duplicates) them on rebuild', () => {
      loadWith(respond('4h', trendlines(100)));
      expect(priceTl().length).toBe(1);
      expect(oscTl().length).toBe(1);
      // Extended to the last candle's x with the line's own slope.
      const data = (priceTl()[0] as unknown as { data: Array<{ x: number; y: number }> }).data;
      expect(data[data.length - 1].x).toBe(component.baseData[component.baseData.length - 1].x);

      const internals = component as unknown as TlInternals;
      internals.rebuildMcbPanelDatasets(component.baseData);
      internals.rebuildMcbPanelDatasets(component.baseData);
      expect(priceTl().length).toBe(1);
      expect(oscTl().length).toBe(1);

      loadWith(respond('4h', trendlines(200)));
      expect(priceTl().length).toBe(1);
      expect((priceTl()[0] as unknown as { data: Array<{ y: number }> }).data[0].y).toBe(200);
    });

    it('does not use another timeframe results and removes lines when none exist', () => {
      loadWith(respond('4h', trendlines(100)));
      expect(priceTl().length).toBe(1);
      loadWith(respond('1d', trendlines(100)));
      expect(priceTl().length).toBe(0);
      expect(oscTl().length).toBe(0);
    });

    it('sub-toggles control each pane and the master hides both', () => {
      loadWith(respond('4h', trendlines(100)));
      const internals = component as unknown as { applyAuxPanelSetting(key: string, on: boolean): void };
      internals.applyAuxPanelSetting('momentumPriceLines', false);
      flushRaf();
      expect(priceTl().length).toBe(0);
      expect(oscTl().length).toBe(1);
      internals.applyAuxPanelSetting('momentumPriceLines', true);
      internals.applyAuxPanelSetting('momentumOscLines', false);
      flushRaf();
      expect(priceTl().length).toBe(1);
      expect(oscTl().length).toBe(0);
      internals.applyAuxPanelSetting('predictionLines', false);
      flushRaf();
      expect(priceTl().length).toBe(0);
      expect(oscTl().length).toBe(0);
    });

    it('drops the lines on a timeframe switch until the new response arrives', () => {
      loadWith(respond('4h', trendlines(100)));
      expect(priceTl().length).toBe(1);
      component.onTimeframeChange('1d');
      (component as unknown as TlInternals).rebuildMcbPanelDatasets(component.baseData);
      expect(priceTl().length).toBe(0);
      expect(oscTl().length).toBe(0);
    });

    it('a line without Price gives one osc dataset and no price dataset', () => {
      const tl = trendlines(100);
      (tl.Lines[0] as { Price: unknown }).Price = null;
      loadWith(respond('4h', tl));
      expect(oscTl().length).toBe(1);
      expect(priceTl().length).toBe(0);
    });

    it('developingLines toggles the dashed lines on both panes', () => {
      const tl = trendlines(100);
      (tl.Lines[0] as { Role: string }).Role = 'Developing';
      loadWith(respond('4h', tl));
      const dashed = (list: unknown[]) => (list as Array<{ borderDash: number[] }>).every((d) => d.borderDash.length === 2);
      expect(priceTl().length).toBe(1);
      expect(oscTl().length).toBe(1);
      expect(dashed(priceTl()) && dashed(oscTl())).toBe(true);
      const internals = component as unknown as { applyAuxPanelSetting(key: string, on: boolean): void };
      internals.applyAuxPanelSetting('developingLines', false);
      flushRaf();
      expect(priceTl().length).toBe(0);
      expect(oscTl().length).toBe(0);
      internals.applyAuxPanelSetting('developingLines', true);
      flushRaf();
      expect(priceTl().length).toBe(1);
      expect(oscTl().length).toBe(1);
    });

    it('sub-toggles are disabled and indented in the settings while the master is off', () => {
      const internals = component as unknown as { applyAuxPanelSetting(key: string, on: boolean): void };
      const subs = () =>
        component.auxPanelSettings!.items.filter((i) => ['momentumOscLines', 'momentumPriceLines', 'developingLines'].includes(i.key));
      expect(subs().every((i) => i.indent && !i.disabled)).toBe(true);
      internals.applyAuxPanelSetting('predictionLines', false);
      expect(subs().length).toBe(3);
      expect(subs().every((i) => i.indent && i.disabled)).toBe(true);
    });

    it('no longer draws the old green/red divergence prediction datasets', () => {
      loadWith({
        TimeframeResults: [
          { Timeframe: '4h', DivergenceLines: [{ Source: 'Wave', IsBear: true, CurrentPriceBarIndex: 5, AnchorPriceBarIndex: 1 }] },
        ],
      });
      const all = [...component.chartData.datasets, ...(component.mcbChartData.datasets as unknown[])] as Array<Record<string, unknown>>;
      expect(all.some((d) => d['isMcbPrediction'] || String(d['label'] ?? '').startsWith('MCB_PRED_'))).toBe(false);
    });
  });

  it('formats the MCB time axis by month for 1M and by clock time for 1m', () => {
    const format = (v: number) =>
      (component as unknown as { formatMcbTimeTick: (v: number) => string }).formatMcbTimeTick(v);
    const firstOfMonth = new Date(2026, 8, 1, 14, 30).getTime();
    const midMonth = new Date(2026, 8, 17, 14, 30).getTime();

    component.selectedTimeframe = '1M';
    expect(format(firstOfMonth)).toBe('Sep');
    expect(format(midMonth)).toBe('17 Sep');

    component.selectedTimeframe = '1m';
    expect(format(firstOfMonth)).toBe('14:30');
  });
});
