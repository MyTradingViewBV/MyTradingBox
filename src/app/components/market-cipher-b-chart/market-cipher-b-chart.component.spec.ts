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
            getSelectedSymbol: () => of(null),
            getSelectedTimeframe: () => of(null),
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
