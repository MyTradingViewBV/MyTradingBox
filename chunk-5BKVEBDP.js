import {
  SettingsService,
  environment
} from "./chunk-UO4HDZ2G.js";
import {
  HttpClient
} from "./chunk-IOKBW7VW.js";
import {
  DestroyRef,
  Injectable,
  NgZone,
  Subject,
  __decorate,
  inject,
  map,
  switchMap
} from "./chunk-X5OTQXGI.js";

// src/app/modules/shared/services/http/user-symbols.service.ts
var UserSymbolsService = class UserSymbolsService2 {
  BASE = environment.apiUrl;
  http = inject(HttpClient);
  _settingsService = inject(SettingsService);
  constructor() {
  }
  /**
   * Load user symbols for the currently selected exchange.
   */
  getUserSymbols() {
    return this._settingsService.getSelectedExchange().pipe(switchMap((exchange) => {
      const exchangeId = exchange?.Id ?? 1;
      return this.http.get(`${this.BASE}api/UserSymbols?exchangeId=${exchangeId}`).pipe(map((arr) => arr || []));
    }));
  }
  /**
   * Add a symbol to the user profile for the selected exchange.
   * API expects body: { SymbolId: number, ExchangeId: number }
   */
  addUserSymbol(symbolId) {
    return this._settingsService.getSelectedExchange().pipe(switchMap((exchange) => {
      const exchangeId = exchange?.Id ?? 1;
      const body = { SymbolId: symbolId, ExchangeId: exchangeId };
      return this.http.post(`${this.BASE}api/UserSymbols`, body);
    }));
  }
  /**
   * Delete a user symbol by its UserSymbol Id
   */
  deleteUserSymbol(userSymbolId) {
    return this._settingsService.getSelectedExchange().pipe(switchMap((exchange) => {
      const exchangeId = exchange?.Id ?? 1;
      return this.http.delete(`${this.BASE}api/UserSymbols/${userSymbolId}?exchangeId=${exchangeId}`);
    }));
  }
  static ctorParameters = () => [];
};
UserSymbolsService = __decorate([
  Injectable({ providedIn: "root" })
], UserSymbolsService);

// src/app/components/watchlist/services/binance-ticker.service.ts
var BinanceTickerService = class BinanceTickerService2 {
  destroy$ = inject(DestroyRef);
  zone = inject(NgZone);
  ws = null;
  tickers$ = new Subject();
  connected = false;
  /** Latest ticker snapshot (keyed by uppercase symbol) */
  latestMap = /* @__PURE__ */ new Map();
  connect() {
    if (!this.connected) {
      this.openSocket();
    }
    return this.tickers$.asObservable();
  }
  getLatest() {
    return this.latestMap;
  }
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }
  openSocket() {
    this.connected = true;
    this.zone.runOutsideAngular(() => {
      const url = "wss://stream.binance.com:9443/ws/!ticker@arr";
      this.ws = new WebSocket(url);
      this.ws.onmessage = (event) => {
        try {
          const arr = JSON.parse(event.data);
          if (!Array.isArray(arr))
            return;
          for (const t of arr) {
            const close = parseFloat(t.c);
            const open = parseFloat(t.o);
            const change = close - open;
            const changePct = open !== 0 ? change / open * 100 : 0;
            this.latestMap.set(t.s, {
              symbol: t.s,
              close,
              open,
              high: parseFloat(t.h),
              low: parseFloat(t.l),
              volume: parseFloat(t.v),
              change,
              changePct
            });
          }
          this.tickers$.next(this.latestMap);
        } catch (e) {
        }
      };
      this.ws.onerror = () => {
        console.warn("[BinanceTickerService] WebSocket error");
      };
      this.ws.onclose = () => {
        this.connected = false;
        setTimeout(() => {
          if (!this.connected)
            this.openSocket();
        }, 3e3);
      };
    });
  }
};
BinanceTickerService = __decorate([
  Injectable({ providedIn: "root" })
], BinanceTickerService);

export {
  UserSymbolsService,
  BinanceTickerService
};
//# sourceMappingURL=chunk-5BKVEBDP.js.map
