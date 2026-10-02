import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { Store, provideStore } from '@ngrx/store';
import { Observable } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from 'src/environments/environment';
import { AppActions } from 'src/app/store/app/app.actions';
import { rootMetaReducers, rootReducers } from 'src/app/store/root.store';
import { NAME_IDENTIFIER_CLAIM, buildJwt, loginResponse } from 'src/testing/jwt';
import { Exchange } from '../../models/orders/exchange.dto';
import { ChartStateDto } from '../../models/chart/chart-state.dto';
import { SettingsService } from '../services/settingsService';
import { ChartService, UpdateSymbolPayload } from './chart.service';

const BASE = environment.apiUrl;

const DEFAULT_SETTINGS = {
  showBoxes: true,
  showKeyZones: true,
  showOrders: false,
  showIndicators: true,
  showMarketCipher: false,
  showDivergences: false,
  boxMode: 'boxes',
};

/** Subscribes and records the latest value / error. */
function capture<T>(source: Observable<T>): { value?: T; error?: unknown; values: T[] } {
  const result: { value?: T; error?: unknown; values: T[] } = { values: [] };
  source.subscribe({
    next: (v) => {
      result.value = v;
      result.values.push(v);
    },
    error: (e) => (result.error = e),
  });
  return result;
}

function params(req: TestRequest): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  req.request.params.keys().forEach((k) => (out[k] = req.request.params.get(k)));
  return out;
}

describe('ChartService', () => {
  let service: ChartService;
  let httpMock: HttpTestingController;
  let settings: SettingsService;

  function selectExchange(Id: number, Name = 'Bybit'): void {
    settings.setSelectedExchange(Object.assign(new Exchange(), { Id, Name }));
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideStore(rootReducers, { metaReducers: rootMetaReducers }),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(ChartService);
    httpMock = TestBed.inject(HttpTestingController);
    settings = TestBed.inject(SettingsService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('symbols', () => {
    it('getSymbols uses the fallback exchange 1 and keeps only symbols with collected boxes', () => {
      const result = capture(service.getSymbols());

      httpMock.expectOne(`${BASE}Symbols?exchangeId=1`).flush([
        { SymbolName: 'BTCUSDT', RunStatus: 'BoxesCollected' },
        { SymbolName: 'ETHUSDT', RunStatus: 'Pending' },
      ]);

      expect(result.value?.map((s) => s.SymbolName)).toEqual(['BTCUSDT']);
    });

    it('getSymbols re-queries when the selected exchange changes', () => {
      const result = capture(service.getSymbols());
      httpMock.expectOne(`${BASE}Symbols?exchangeId=1`).flush([]);

      selectExchange(4);
      httpMock.expectOne(`${BASE}Symbols?exchangeId=4`).flush(null);

      expect(result.values).toEqual([[], []]);
    });

    it('getSymbolsForExchange tags symbols with the exchange and filters them', () => {
      const result = capture(service.getSymbolsForExchange(5));

      httpMock.expectOne(`${BASE}Symbols?exchangeId=5`).flush([
        { SymbolName: 'SOLUSDT', RunStatus: 'BoxesCollected' },
        { SymbolName: 'XRPUSDT', RunStatus: 'Failed' },
      ]);

      expect(result.value).toEqual([{ SymbolName: 'SOLUSDT', RunStatus: 'BoxesCollected', ExchangeId: 5 }]);
    });

    it('getSymbolsForExchange returns an empty list on error', () => {
      const result = capture(service.getSymbolsForExchange(5));

      httpMock.expectOne(`${BASE}Symbols?exchangeId=5`).flush(null, { status: 500, statusText: 'Error' });

      expect(result.value).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    it('getAllSymbols returns every symbol regardless of status', () => {
      selectExchange(2);
      const result = capture(service.getAllSymbols());

      httpMock.expectOne(`${BASE}Symbols?exchangeId=2`).flush([
        { SymbolName: 'A', RunStatus: 'Pending' },
        { SymbolName: 'B', RunStatus: 'BoxesCollected' },
      ]);

      expect(result.value?.length).toBe(2);
    });

    it('getAllSymbols maps a null body to an empty list', () => {
      const result = capture(service.getAllSymbols());
      httpMock.expectOne(`${BASE}Symbols?exchangeId=1`).flush(null);

      expect(result.value).toEqual([]);
    });

    it('updateSymbolById PUTs the payload with the exchange as query param', () => {
      const payload: UpdateSymbolPayload = { Id: 3, SymbolName: 'BTCUSDT', Active: true, RunStatus: 'BoxesCollected' };
      const result = capture(service.updateSymbolById(3, 2, payload));

      const req = httpMock.expectOne((r) => r.url === `${BASE}Symbols/3`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual(payload);
      expect(params(req)).toEqual({ exchangeId: '2' });
      req.flush({ ...payload, Icon: 'btc.png' });

      expect(result.value).toEqual({ ...payload, Icon: 'btc.png' });
    });

    it('updateSymbolById propagates errors', () => {
      const payload: UpdateSymbolPayload = { Id: 3, SymbolName: 'X', Active: false, RunStatus: '' };
      const result = capture(service.updateSymbolById(3, 2, payload));

      httpMock.expectOne((r) => r.url === `${BASE}Symbols/3`).flush(null, { status: 409, statusText: 'Conflict' });

      expect(result.error).toEqual(expect.objectContaining({ status: 409 }));
    });

    it('getExchanges GETs the exchange list', () => {
      const result = capture(service.getExchanges());
      httpMock.expectOne(`${BASE}Exchanges`).flush([{ Id: 1, Name: 'Bybit' }]);

      expect(result.value).toEqual([{ Id: 1, Name: 'Bybit' }]);
    });
  });

  describe('enqueueAiTask', () => {
    it('POSTs the task and reports success', () => {
      const result = capture(service.enqueueAiTask('Analyze', 'BTCUSDT', 3));

      const req = httpMock.expectOne((r) => r.url === `${BASE}AiQueue`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ TaskType: 'Analyze', Symbol: 'BTCUSDT' });
      expect(params(req)).toEqual({ exchangeId: '3' });
      req.flush(null, { status: 202, statusText: 'Accepted' });

      expect(result.value).toBe(true);
    });

    it('sends an empty symbol instead of undefined', () => {
      capture(service.enqueueAiTask('Scan', undefined as unknown as string, 1));

      const req = httpMock.expectOne((r) => r.url === `${BASE}AiQueue`);
      expect(req.request.body).toEqual({ TaskType: 'Scan', Symbol: '' });
      req.flush(null);
    });

    it('reports false when the queue rejects the task', () => {
      const result = capture(service.enqueueAiTask('Analyze', 'BTCUSDT', 3));
      httpMock.expectOne((r) => r.url === `${BASE}AiQueue`).flush(null, { status: 500, statusText: 'Error' });

      expect(result.value).toBe(false);
    });
  });

  describe('getCandles', () => {
    it('waits for a resolved exchange before requesting candles', () => {
      const result = capture(service.getCandles('BTCUSDT', '1h'));
      httpMock.expectNone((r) => r.url.includes('Candles/bybit'));

      const before = Date.now();
      selectExchange(6);
      const req = httpMock.expectOne((r) => r.url === `${BASE}Candles/bybit?exchangeId=6`);
      const { _t, ...rest } = params(req);
      expect(rest).toEqual({ symbol: 'BTCUSDT', timeframe: '1h', limit: '100' });
      // Cache buster: the request time in ms.
      expect(Number(_t)).toBeGreaterThanOrEqual(before);
      expect(Number(_t)).toBeLessThanOrEqual(Date.now());
      req.flush([{ Close: 1 }]);

      expect(result.value).toEqual([{ Close: 1 }]);
    });

    it('passes a custom limit and does not refetch when the exchange changes later', () => {
      selectExchange(2);
      capture(service.getCandles('ETHUSDT', '15m', 500));

      const req = httpMock.expectOne((r) => r.url === `${BASE}Candles/bybit?exchangeId=2`);
      expect(req.request.params.get('limit')).toBe('500');
      req.flush([]);

      selectExchange(3);
      httpMock.expectNone((r) => r.url.includes('Candles/bybit'));
    });
  });

  describe('symbol/timeframe endpoints', () => {
    it.each<[string, (s: ChartService) => Observable<unknown>]>([
      ['FibLevels', (s) => s.getFibLevels('BTCUSDT', '4h')],
      ['EmaMmaLevels', (s) => s.getEmaMmaLevels('BTCUSDT', '4h')],
      ['VolumeProfiles', (s) => s.getVolumeProfiles('BTCUSDT', '4h')],
      ['Boxes', (s) => s.getBoxes('BTCUSDT', '4h')],
      ['CapitalFlowSignals', (s) => s.getCapitalFlowSignals('BTCUSDT', '4h')],
      ['MarketCipherSignals', (s) => s.getMarketCipherSignals('BTCUSDT', '4h')],
      ['Divergences', (s) => s.getDivergences('BTCUSDT', '4h')],
    ])('%s is requested for the selected exchange, symbol and timeframe', (path, call) => {
      selectExchange(9);
      const result = capture(call(service));

      const req = httpMock.expectOne((r) => r.url === `${BASE}${path}?exchangeId=9`);
      expect(req.request.method).toBe('GET');
      expect(params(req)).toEqual({ symbol: 'BTCUSDT', timeframe: '4h' });
      req.flush([{ id: 1 }]);

      expect(result.value).toEqual([{ id: 1 }]);
    });

    it('getBoxesV2 colours boxes by position type', () => {
      const result = capture(service.getBoxesV2('BTCUSDT', '1d'));

      const req = httpMock.expectOne((r) => r.url === `${BASE}Boxes/GetReadyBoxes?exchangeId=1`);
      expect(params(req)).toEqual({ symbol: 'BTCUSDT', timeframe: '1d' });
      req.flush([{ PositionType: 'LONG' }, { PositionType: 'SHORT' }, { PositionType: 'NONE' }, {}]);

      expect(result.value?.map((b) => (b as unknown as { color: string }).color)).toEqual([
        'yellow',
        'red',
        'grey',
        'grey',
      ]);
    });

    it('getKeyZones sends only the symbol', () => {
      selectExchange(2);
      capture(service.getKeyZones('BTCUSDT'));

      const req = httpMock.expectOne((r) => r.url === `${BASE}KeyZones?exchangeId=2`);
      expect(params(req)).toEqual({ symbol: 'BTCUSDT' });
      req.flush({});
    });

    it('propagates HTTP errors of the data endpoints', () => {
      const result = capture(service.getFibLevels('BTCUSDT', '1h'));
      httpMock.expectOne((r) => r.url === `${BASE}FibLevels?exchangeId=1`).flush(null, {
        status: 500,
        statusText: 'Error',
      });

      expect(result.error).toEqual(expect.objectContaining({ status: 500 }));
    });
  });

  describe('orders and watchlist', () => {
    beforeEach(() => selectExchange(2));

    it('getOrders lists the trade orders of the exchange', () => {
      capture(service.getOrders());
      httpMock.expectOne(`${BASE}TradeOrders?exchangeId=2`).flush([]);
    });

    it('getTradeOrders filters by symbol', () => {
      capture(service.getTradeOrders('BTCUSDT'));
      const req = httpMock.expectOne((r) => r.url === `${BASE}TradeOrders?exchangeId=2`);
      expect(params(req)).toEqual({ symbol: 'BTCUSDT' });
      req.flush([]);
    });

    it('deleteOrder DELETEs the order within the exchange', () => {
      const result = capture(service.deleteOrder(42));
      const req = httpMock.expectOne(`${BASE}TradeOrders/42?exchangeId=2`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(result.error).toBeUndefined();
    });

    it('getWatchlist requests the enriched watchlist', () => {
      const result = capture(service.getWatchlist());
      httpMock.expectOne(`${BASE}BoxWatchlist/enriched?exchangeId=2`).flush([{ Symbol: 'BTCUSDT' }]);

      expect(result.value).toEqual([{ Symbol: 'BTCUSDT' }]);
    });

    it('getTradeOrdersV2 requests the balance/PnL overview of account 1', () => {
      capture(service.getTradeOrdersV2());
      httpMock.expectOne(`${BASE}TradeOrders/account-balance-pnl?exchangeId=2&accountId=1`).flush({});
    });
  });

  describe('getLiveCandleForExchange', () => {
    function live(body: object | null): unknown {
      const result = capture(service.getLiveCandleForExchange(3, 'BTCUSDT', '1m'));
      const req = httpMock.expectOne((r) => r.url === `${BASE}Candles/live?exchangeId=3`);
      expect(params(req)).toEqual({ symbol: 'BTCUSDT', timeframe: '1m' });
      req.flush(body);
      return result.value;
    }

    it('drops placeholder candles (price -1) from an array response', () => {
      expect(live([{ price: 1 }, { price: -1 }, { Price: -1 }, null, { Price: 2 }])).toEqual([
        { price: 1 },
        { Price: 2 },
      ]);
    });

    it('maps a single placeholder candle to null', () => {
      expect(live({ price: -1 })).toBeNull();
      expect(live({ Price: -1 })).toBeNull();
    });

    it('passes a real candle through', () => {
      expect(live({ Price: 100, Open: 99 })).toEqual({ Price: 100, Open: 99 });
    });
  });

  describe('chart state', () => {
    const userJwt = () => buildJwt(3600, { [NAME_IDENTIFIER_CLAIM]: 'user-7' });

    function login(accessToken: string): void {
      TestBed.inject(Store).dispatch(AppActions.setToken({ token: loginResponse(accessToken) }));
    }

    function expectLoad(): TestRequest {
      return httpMock.expectOne((r) => r.url === `${BASE}api/ChartState` && r.method === 'GET');
    }

    it('loads the state for the user, exchange and symbol and normalises PascalCase JSON fields', () => {
      login(userJwt());
      selectExchange(2);
      const result = capture(service.loadChartState('BTCUSDT', '4h'));

      const req = expectLoad();
      expect(params(req)).toEqual({ symbol: 'BTCUSDT', exchangeId: '2', userId: 'user-7' });
      req.flush({
        Id: 'state-1',
        UserId: 'user-7',
        ExchangeId: 2,
        Symbol: 'BTCUSDT',
        Drawings: JSON.stringify([{ id: 'd1' }]),
        Settings: JSON.stringify({ showOrders: true }),
      });

      expect(result.value).toEqual({
        id: 'state-1',
        userId: 'user-7',
        exchangeId: 2,
        symbol: 'BTCUSDT',
        timeframe: '4h',
        drawings: [{ id: 'd1' }],
        settings: { ...DEFAULT_SETTINGS, showOrders: true },
      });
    });

    it('accepts camelCase objects and falls back to defaults for unreadable fields', () => {
      login(userJwt());
      selectExchange(2);
      const result = capture(service.loadChartState('ETHUSDT'));

      expectLoad().flush({ drawings: '{not json', settings: null, timeframe: '1d' });

      expect(result.value).toEqual({
        id: undefined,
        userId: undefined,
        exchangeId: 2,
        symbol: 'ETHUSDT',
        timeframe: '1d',
        drawings: [],
        settings: DEFAULT_SETTINGS,
      });
    });

    it('ignores drawings that are not an array', () => {
      login(userJwt());
      selectExchange(2);
      const result = capture(service.loadChartState('ETHUSDT'));

      expectLoad().flush({ drawings: { id: 'x' } });

      expect(result.value?.drawings).toEqual([]);
      expect(result.value?.timeframe).toBe('1h');
    });

    it('uses a fallback user id and warns when the token has no user claim', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      selectExchange(2);
      capture(service.loadChartState('BTCUSDT'));

      const req = expectLoad();
      expect(req.request.params.get('userId')).toBe('unknown-user');
      expect(warn).toHaveBeenCalled();
      req.flush(null);
    });

    it('does not request before the exchange is resolved', () => {
      login(userJwt());
      capture(service.loadChartState('BTCUSDT'));

      httpMock.expectNone((r) => r.url === `${BASE}api/ChartState`);
    });

    it.each([
      ['no saved state (null body)', null, undefined],
      ['404', null, { status: 404, statusText: 'Not Found' }],
      ['500', null, { status: 500, statusText: 'Error' }],
    ])('resolves to null for %s', (_, body, opts) => {
      login(userJwt());
      selectExchange(2);
      const result = capture(service.loadChartState('BTCUSDT'));

      expectLoad().flush(body, opts);

      expect(result.value).toBeNull();
      expect(result.error).toBeUndefined();
    });

    it('saves drawings and settings as JSON strings and returns the normalised server copy', () => {
      login(userJwt());
      selectExchange(2);
      const state: ChartStateDto = {
        exchangeId: 99,
        symbol: 'BTCUSDT',
        timeframe: '15m',
        drawings: [{ id: 'd1' } as unknown as ChartStateDto['drawings'][number]],
        settings: { ...DEFAULT_SETTINGS, showKeyZones: true } as ChartStateDto['settings'],
      };
      const result = capture(service.saveChartState(state));

      const req = httpMock.expectOne((r) => r.url === `${BASE}api/ChartState` && r.method === 'PUT');
      expect(req.request.body).toEqual({
        ExchangeId: 2,
        Symbol: 'BTCUSDT',
        Drawings: JSON.stringify(state.drawings),
        Settings: JSON.stringify(state.settings),
        UserId: 'user-7',
      });
      req.flush({ Id: 'saved', ...req.request.body });

      expect(result.value).toEqual({
        id: 'saved',
        userId: 'user-7',
        exchangeId: 2,
        symbol: 'BTCUSDT',
        timeframe: '15m',
        drawings: [{ id: 'd1' }],
        settings: { ...DEFAULT_SETTINGS, showKeyZones: true },
      });
    });

    it('falls back to the sent payload when the server returns no body, and to defaults for missing parts', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      selectExchange(4);
      const result = capture(
        service.saveChartState({ symbol: 'ETHUSDT' } as unknown as ChartStateDto),
      );

      const req = httpMock.expectOne((r) => r.url === `${BASE}api/ChartState` && r.method === 'PUT');
      expect(req.request.body).toEqual(
        expect.objectContaining({ Drawings: '[]', Settings: JSON.stringify(DEFAULT_SETTINGS), UserId: 'unknown-user' }),
      );
      expect(warn).toHaveBeenCalled();
      req.flush(null);

      expect(result.value).toEqual(
        expect.objectContaining({ exchangeId: 4, symbol: 'ETHUSDT', timeframe: '1h', drawings: [], settings: DEFAULT_SETTINGS }),
      );
    });

    it('resolves a failed save to null so the chart keeps working', () => {
      login(userJwt());
      selectExchange(2);
      const result = capture(
        service.saveChartState({ exchangeId: 2, symbol: 'BTCUSDT', timeframe: '1h', drawings: [], settings: DEFAULT_SETTINGS } as unknown as ChartStateDto),
      );

      httpMock
        .expectOne((r) => r.url === `${BASE}api/ChartState` && r.method === 'PUT')
        .flush(null, { status: 503, statusText: 'Unavailable' });

      expect(result.value).toBeNull();
      expect(result.error).toBeUndefined();
    });
  });
});
