import {
  FooterComponent
} from "./chunk-W7JRI3U7.js";
import {
  CoinInfoComponent
} from "./chunk-BNBS6TIT.js";
import {
  BinanceTickerService,
  UserSymbolsService
} from "./chunk-5BKVEBDP.js";
import {
  ChartService,
  SettingsActions,
  SettingsService
} from "./chunk-UO4HDZ2G.js";
import {
  CommonModule,
  DecimalPipe,
  Location,
  Router
} from "./chunk-IOKBW7VW.js";
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  Input,
  NgZone,
  __decorate,
  __spreadProps,
  __spreadValues,
  computed,
  inject,
  signal,
  take
} from "./chunk-X5OTQXGI.js";

// angular:jit:template:src\app\components\watchlist\watchlist.html
var watchlist_default = `<div class="watchlist-root">\r
  <!-- TradingView-style top bar -->\r
  <div class="tv-header">\r
    <button type="button" class="tv-header-btn" (click)="back()" aria-label="Back">\r
      <span class="tv-icon">\u2190</span>\r
    </button>\r
    <h2 class="tv-title">Watchlist</h2>\r
    <div class="tv-header-actions">\r
      <button type="button" class="tv-header-btn" (click)="refresh()" aria-label="Refresh">\r
        <span class="tv-icon">\u27F3</span>\r
      </button>\r
      <button type="button" class="tv-header-btn add" (click)="goToAddSymbol()" aria-label="Add symbol">\r
        <span class="tv-icon">+</span>\r
      </button>\r
    </div>\r
  </div>\r
\r
  <div class="tv-content" style="position: relative;">\r
    @if (loading) {\r
      <div class="mtb-overlay"><span class="mtb-spinner large"></span></div>\r
    }\r
    @if (!loading && errorMsg) {\r
      <div class="wl-error">{{ errorMsg }}</div>\r
    }\r
\r
    <!-- Matrix Section -->\r
    @if (!loading) {\r
      <div class="tv-section">\r
        <div class="tv-section-header">\r
          <span class="tv-section-label">MARKET OVERVIEW</span>\r
        </div>\r
        <app-watchlist-matrix></app-watchlist-matrix>\r
      </div>\r
    }\r
\r
    <!-- User Symbols (TradingView style list) -->\r
    @if (!loading) {\r
      <div class="tv-section">\r
        <div class="tv-section-header">\r
          <span class="tv-section-label">MY COINS</span>\r
          <span class="tv-section-count">{{ userSymbols.length }}</span>\r
        </div>\r
        <div class="tv-symbol-list">\r
          @for (us of userSymbols; track trackByUserSymbol($index, us)) {\r
            <div class="tv-symbol-row" (click)="goToChart(us.SymbolName || '', '1d')">\r
              <div class="tv-symbol-icon">\r
                @if (us.Icon) {\r
                  <img [src]="us.Icon" [alt]="us.SymbolName" class="tv-coin-img" (error)="clearIcon(us)" />\r
                } @else {\r
                  <span class="tv-coin-placeholder">{{ (us.SymbolName || '?').charAt(0) }}</span>\r
                }\r
              </div>\r
              <div class="tv-symbol-info">\r
                <span class="tv-symbol-name">{{ us.SymbolName || us.SymbolId }}</span>\r
              </div>\r
              <div class="tv-symbol-price">\r
                @if (us.price != null) {\r
                  <span class="tv-price">{{ us.price | number:'1.2-6' }}</span>\r
                  <span class="tv-change" [class.positive]="(us.changePct ?? 0) >= 0" [class.negative]="(us.changePct ?? 0) < 0">\r
                    {{ (us.changePct ?? 0) >= 0 ? '+' : '' }}{{ us.changePct | number:'1.2-2' }}%\r
                  </span>\r
                }\r
              </div>\r
              <div class="tv-symbol-actions">\r
                <button type="button" class="tv-action-btn info" (click)="onCoinInfoClick($event, us.SymbolName || '')" title="Info">\r
                  <span>\u2139</span>\r
                </button>\r
                @if (!us.isFixed) {\r
                  <button type="button" class="tv-action-btn delete" (click)="onDeleteClick($event, us.Id)" title="Remove">\r
                    <span>\u2715</span>\r
                  </button>\r
                }\r
              </div>\r
            </div>\r
          }\r
          @if (userSymbols.length === 0) {\r
            <div class="tv-empty">\r
              <span class="tv-empty-text">No symbols yet</span>\r
              <button type="button" class="tv-add-cta" (click)="goToAddSymbol()">+ Add your first symbol</button>\r
            </div>\r
          }\r
        </div>\r
      </div>\r
    }\r
  </div>\r
\r
  <!-- Coin Info Side Panel -->\r
  @if (infoOpen) {\r
    <div class="coin-info-panel" (click)="closeInfo()">\r
      <div class="coin-info-panel-inner" (click)="$event.stopPropagation()">\r
        <div class="coin-info-panel-header">\r
          <h4 class="coin-info-title">{{ infoSymbol }}</h4>\r
          <button type="button" class="tv-header-btn" (click)="closeInfo()">\u2715</button>\r
        </div>\r
        <app-coin-info [symbolInput]="infoSymbol" [embedded]="true"></app-coin-info>\r
      </div>\r
    </div>\r
  }\r
</div>\r
<app-footer></app-footer>`;

// angular:jit:style:src\app\components\watchlist\watchlist.scss
var watchlist_default2 = '/* src/app/components/watchlist/watchlist.scss */\n.watchlist-root {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  min-height: 100vh;\n  background: #131722;\n  color: #d1d4dc;\n  font-family:\n    -apple-system,\n    BlinkMacSystemFont,\n    "Segoe UI",\n    Roboto,\n    sans-serif;\n}\n.tv-header {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 10px 16px;\n  background: #1e222d;\n  border-bottom: 1px solid #2a2e39;\n  position: sticky;\n  top: 0;\n  z-index: 20;\n}\n.tv-title {\n  margin: 0;\n  font-size: 16px;\n  font-weight: 600;\n  color: #d1d4dc;\n  flex: 1;\n}\n.tv-header-actions {\n  display: flex;\n  gap: 4px;\n  align-items: center;\n}\n.tv-header-btn {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 32px;\n  height: 32px;\n  background: transparent;\n  border: none;\n  border-radius: 4px;\n  color: #787b86;\n  font-size: 16px;\n  cursor: pointer;\n  transition: background 0.15s, color 0.15s;\n}\n.tv-header-btn:hover {\n  background: #2a2e39;\n  color: #d1d4dc;\n}\n.tv-header-btn.add {\n  color: #2962ff;\n  font-size: 20px;\n  font-weight: 700;\n}\n.tv-header-btn.add:hover {\n  background: rgba(41, 98, 255, 0.1);\n}\n.tv-icon {\n  line-height: 1;\n}\n.tv-content {\n  flex: 1 1 auto;\n  overflow-y: auto;\n  padding-bottom: calc(var(--footer-height, 60px) + 16px);\n  scrollbar-width: thin;\n  scrollbar-color: #363a45 transparent;\n}\n.tv-section {\n  margin-bottom: 4px;\n}\n.tv-section-header {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 16px 6px;\n  background: #131722;\n  position: sticky;\n  top: 0;\n  z-index: 5;\n}\n.tv-section-label {\n  font-size: 11px;\n  font-weight: 600;\n  letter-spacing: 0.5px;\n  color: #787b86;\n  text-transform: uppercase;\n}\n.tv-section-count {\n  font-size: 11px;\n  color: #787b86;\n  background: #2a2e39;\n  padding: 1px 6px;\n  border-radius: 3px;\n}\n.tv-symbol-list {\n  display: flex;\n  flex-direction: column;\n}\n.tv-symbol-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 16px;\n  cursor: pointer;\n  transition: background 0.12s;\n  border-bottom: 1px solid rgba(42, 46, 57, 0.5);\n}\n.tv-symbol-row:hover {\n  background: #1e222d;\n}\n.tv-symbol-row:active {\n  background: #262b3a;\n}\n.tv-symbol-icon {\n  width: 28px;\n  height: 28px;\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.tv-coin-img {\n  width: 28px;\n  height: 28px;\n  border-radius: 50%;\n  object-fit: cover;\n}\n.tv-coin-placeholder {\n  width: 28px;\n  height: 28px;\n  border-radius: 50%;\n  background: #2a2e39;\n  color: #787b86;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 13px;\n  font-weight: 600;\n}\n.tv-symbol-info {\n  flex: 1;\n  min-width: 0;\n}\n.tv-symbol-name {\n  font-size: 14px;\n  font-weight: 600;\n  color: #d1d4dc;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.tv-symbol-price {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 1px;\n  min-width: 80px;\n  text-align: right;\n}\n.tv-price {\n  font-size: 13px;\n  font-weight: 500;\n  color: #d1d4dc;\n  font-variant-numeric: tabular-nums;\n}\n.tv-change {\n  font-size: 11px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n}\n.tv-change.positive {\n  color: #26a69a;\n}\n.tv-change.negative {\n  color: #ef5350;\n}\n.tv-symbol-actions {\n  display: flex;\n  gap: 4px;\n  opacity: 1;\n}\n.tv-action-btn {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  background: transparent;\n  border: none;\n  border-radius: 4px;\n  color: #787b86;\n  font-size: 13px;\n  cursor: pointer;\n  transition: background 0.12s, color 0.12s;\n}\n.tv-action-btn:hover {\n  background: #2a2e39;\n  color: #d1d4dc;\n}\n.tv-action-btn.delete:hover {\n  background: rgba(234, 57, 67, 0.15);\n  color: #ef5350;\n}\n.tv-action-btn.info:hover {\n  background: rgba(41, 98, 255, 0.1);\n  color: #2962ff;\n}\n.tv-empty {\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 12px;\n  padding: 32px 16px;\n  color: #787b86;\n}\n.tv-empty-text {\n  font-size: 13px;\n}\n.tv-add-cta {\n  background: transparent;\n  border: 1px solid #2962ff;\n  color: #2962ff;\n  padding: 8px 16px;\n  border-radius: 4px;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n  transition: background 0.15s;\n}\n.tv-add-cta:hover {\n  background: rgba(41, 98, 255, 0.1);\n}\n.coin-info-panel {\n  position: fixed;\n  inset: 0;\n  z-index: 1000;\n  background: rgba(0, 0, 0, 0.5);\n  display: flex;\n  justify-content: flex-end;\n}\n.coin-info-panel-inner {\n  width: 380px;\n  max-width: 100%;\n  background: #1e222d;\n  border-left: 1px solid #2a2e39;\n  display: flex;\n  flex-direction: column;\n  overflow-y: auto;\n}\n.coin-info-panel-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  padding: 12px 16px;\n  border-bottom: 1px solid #2a2e39;\n}\n.coin-info-title {\n  margin: 0;\n  font-size: 15px;\n  font-weight: 600;\n  color: #d1d4dc;\n}\n.wl-error {\n  padding: 16px;\n  font-size: 13px;\n  color: #ef5350;\n  text-align: center;\n}\n@media (max-width: 640px) {\n  .tv-symbol-actions {\n    opacity: 1;\n  }\n  .coin-info-panel-inner {\n    width: 100%;\n  }\n  .tv-header {\n    padding: 8px 12px;\n  }\n  .tv-symbol-row {\n    padding: 8px 12px;\n  }\n}\n/*# sourceMappingURL=watchlist.css.map */\n';

// angular:jit:template:src\app\components\watchlist\matrix\watchlist-matrix.component.html
var watchlist_matrix_component_default = `<div class="matrix-wrapper">\r
  <div class="matrix-grid" role="grid" aria-label="Market Signal Matrix">\r
    <!-- Header Row -->\r
    <div class="cell sticky timeframe header" role="columnheader">Timeframe</div>\r
    <div class="cell header" role="columnheader">BTC</div>\r
    <div class="cell header" role="columnheader">BTC.D</div>\r
    <div class="cell header" role="columnheader">ALT.D</div>\r
    <div class="cell header" role="columnheader">USDT.D</div>\r
\r
    <!-- Body Rows -->\r
    @for (row of rows(); track row.timeframe) {\r
      <div class="cell sticky timeframe" role="rowheader">\r
        {{ row.timeframe }}\r
        @if (row.barsAgo != null) {\r
          <span class="badge" title="Bars ago">{{ row.barsAgo }}</span>\r
        }\r
      </div>\r
\r
      <!-- BTC always present -->\r
      <button class="cell" type="button" (click)="onCellTap('BTC', row.timeframe)" aria-label="BTC {{row.timeframe}}">\r
        <span class="arrow" [class.bullish]="row.btc === 'bullish'" [class.bearish]="row.btc === 'bearish'" [class.neutral]="row.btc === 'neutral'"></span>\r
        @if (row.barsAgo != null) {\r
          <span class="badge badge-inline" title="Bars ago">{{ row.barsAgo }}</span>\r
        }\r
      </button>\r
\r
      <!-- BTC Dominance: always render placeholder to keep grid aligned -->\r
      <button class="cell" type="button" (click)="onCellTap('BTC.D', row.timeframe)" aria-label="BTC.D {{row.timeframe}}" [disabled]="row.btcDominance === undefined">\r
        <span class="arrow"\r
          [class.bullish]="row.btcDominance === 'bullish'"\r
          [class.bearish]="row.btcDominance === 'bearish'"\r
          [class.neutral]="row.btcDominance === 'neutral'"\r
          [class.hidden]="row.btcDominance === undefined"></span>\r
        @if (row.barsAgo != null) {\r
          <span class="badge badge-inline" title="Bars ago">{{ row.barsAgo }}</span>\r
        }\r
      </button>\r
\r
      <button class="cell" type="button" (click)="onCellTap('ALT.D', row.timeframe)" aria-label="ALT.D {{row.timeframe}}" [disabled]="row.altDominance === undefined">\r
        <span class="arrow"\r
          [class.bullish]="row.altDominance === 'bullish'"\r
          [class.bearish]="row.altDominance === 'bearish'"\r
          [class.neutral]="row.altDominance === 'neutral'"\r
          [class.hidden]="row.altDominance === undefined"></span>\r
        @if (row.barsAgo != null) {\r
          <span class="badge badge-inline" title="Bars ago">{{ row.barsAgo }}</span>\r
        }\r
      </button>\r
\r
      <button class="cell" type="button" (click)="onCellTap('USDT.D', row.timeframe)" aria-label="USDT.D {{row.timeframe}}" [disabled]="row.usdtDominance === undefined">\r
        <span class="arrow"\r
          [class.bullish]="row.usdtDominance === 'bullish'"\r
          [class.bearish]="row.usdtDominance === 'bearish'"\r
          [class.neutral]="row.usdtDominance === 'neutral'"\r
          [class.hidden]="row.usdtDominance === undefined"></span>\r
        @if (row.barsAgo != null) {\r
          <span class="badge badge-inline" title="Bars ago">{{ row.barsAgo }}</span>\r
        }\r
      </button>\r
    }\r
  </div>\r
</div>\r
`;

// angular:jit:style:src\app\components\watchlist\matrix\watchlist-matrix.component.scss
var watchlist_matrix_component_default2 = "/* src/app/components/watchlist/matrix/watchlist-matrix.component.scss */\n.matrix-wrapper {\n  background: #0f1114;\n  color: #cfd3dc;\n  border-radius: 8px;\n  overflow: auto;\n}\n.matrix-grid {\n  display: grid;\n  grid-template-columns: minmax(100px, 120px) repeat(4, minmax(64px, 1fr));\n  align-items: center;\n  gap: 0;\n  min-width: 420px;\n  border: 1px solid #2a2f39;\n}\n.cell {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 12px 8px;\n  border-right: 1px solid #2a2f39;\n  border-bottom: 1px solid #2a2f39;\n  background: transparent;\n}\n.cell.header {\n  position: sticky;\n  top: 0;\n  background: #0f1114;\n  font-weight: 600;\n  z-index: 2;\n  border-bottom: 1px solid #2a2f39;\n}\n.timeframe {\n  font-weight: 600;\n}\n.sticky.timeframe {\n  position: sticky;\n  left: 0;\n  background: #0f1114;\n  z-index: 3;\n  border-right: 1px solid #2a2f39;\n}\n.badge {\n  display: inline-block;\n  margin-left: 6px;\n  padding: 2px 6px;\n  font-size: 11px;\n  line-height: 1;\n  color: #cfd3dc;\n  background: #1b2028;\n  border: 1px solid #2a2f39;\n  border-radius: 10px;\n}\n.badge-inline {\n  position: absolute;\n  right: 6px;\n  top: 6px;\n  margin-left: 0;\n}\n@media (max-width: 480px) {\n  .badge {\n    font-size: 10px;\n    padding: 1px 5px;\n  }\n  .badge-inline {\n    right: 4px;\n    top: 4px;\n  }\n}\nbutton.cell {\n  cursor: pointer;\n  border: none;\n  position: relative;\n}\n.arrow {\n  width: 0;\n  height: 0;\n  border-left: 8px solid transparent;\n  border-right: 8px solid transparent;\n  box-shadow: 0 0 8px rgba(0, 0, 0, 0.25);\n}\n.arrow.bullish {\n  border-bottom: 14px solid #22c55e;\n}\n.arrow.bearish {\n  border-top: 14px solid #ef4444;\n}\n.arrow.neutral {\n  border-left: none;\n  border-right: none;\n  width: 16px;\n  height: 2px;\n  background: #6b7280;\n}\n.arrow.hidden {\n  opacity: 0;\n}\n@media (max-width: 480px) {\n  .matrix-grid {\n    grid-template-columns: minmax(80px, 90px) repeat(4, 60px);\n    min-width: 320px;\n  }\n  .cell {\n    padding: 8px 4px;\n    font-size: 12px;\n  }\n  .cell.header {\n    font-size: 12px;\n  }\n  .timeframe {\n    font-size: 12px;\n  }\n  .arrow {\n    border-left-width: 6px;\n    border-right-width: 6px;\n  }\n  .arrow.bullish {\n    border-bottom-width: 10px;\n  }\n  .arrow.bearish {\n    border-top-width: 10px;\n  }\n  .arrow.neutral {\n    width: 14px;\n    height: 2px;\n  }\n}\n@media (max-width: 360px) {\n  .matrix-grid {\n    grid-template-columns: minmax(72px, 80px) repeat(4, 54px);\n    min-width: 300px;\n  }\n  .cell {\n    padding: 6px 3px;\n    font-size: 11px;\n  }\n  .cell.header {\n    font-size: 11px;\n  }\n  .timeframe {\n    font-size: 11px;\n  }\n  .arrow {\n    border-left-width: 5px;\n    border-right-width: 5px;\n  }\n  .arrow.bullish {\n    border-bottom-width: 9px;\n  }\n  .arrow.bearish {\n    border-top-width: 9px;\n  }\n  .arrow.neutral {\n    width: 12px;\n    height: 2px;\n  }\n}\n/*# sourceMappingURL=watchlist-matrix.component.css.map */\n";

// src/app/components/watchlist/matrix/watchlist-matrix.component.ts
var WatchlistMatrixComponent = class WatchlistMatrixComponent2 {
  rowsInput;
  allTimeframes = ["1H", "4H", "1D", "1W", "1M", "12M", "24M"];
  rows = signal([]);
  headers = computed(() => ["Timeframe", "BTC", "BTC.D", "ALT.D", "USDT.D"]);
  chartService = inject(ChartService);
  constructor() {
    if (this.rowsInput && this.rowsInput.length) {
      this.rows.set(this.normalizeRows(this.rowsInput));
    } else {
      this.chartService.getWatchlist().pipe(take(1)).subscribe({
        next: (items) => {
          const mapped = this.mapWatchlistToRows(items);
          this.rows.set(mapped);
        },
        error: () => {
          this.rows.set(this.buildMockData());
        }
      });
    }
  }
  normalizeRows(data) {
    return data.map((r) => this.stripDominanceForLongTF(r));
  }
  stripDominanceForLongTF(row) {
    if (row.timeframe === "12M" || row.timeframe === "24M") {
      return __spreadProps(__spreadValues({}, row), { btcDominance: void 0, altDominance: void 0, usdtDominance: void 0 });
    }
    return row;
  }
  buildMockData() {
    const pick = (idx) => idx % 3 === 0 ? "bullish" : idx % 3 === 1 ? "bearish" : "neutral";
    return this.allTimeframes.map((tf, i) => this.stripDominanceForLongTF({
      timeframe: tf,
      btc: pick(i),
      btcDominance: tf === "12M" || tf === "24M" ? void 0 : pick(i + 1),
      altDominance: tf === "12M" || tf === "24M" ? void 0 : pick(i + 2),
      usdtDominance: tf === "12M" || tf === "24M" ? void 0 : pick(i + 3)
    }));
  }
  tfApiToUi(tf) {
    const lower = (tf || "").toString().trim().toLowerCase();
    switch (lower) {
      case "1h":
        return "1H";
      case "4h":
        return "4H";
      case "1d":
        return "1D";
      case "1w":
        return "1W";
      case "1m":
        return "1M";
      case "12m":
        return "12M";
      case "24m":
        return "24M";
      default:
        return null;
    }
  }
  dirToSignal(direction) {
    const d = (direction || "").toUpperCase();
    if (d === "BULL" || d === "BULLISH" || d === "LONG")
      return "bullish";
    if (d === "BEAR" || d === "BEARISH" || d === "SHORT")
      return "bearish";
    return "neutral";
  }
  pickBetter(current, incoming, state) {
    const isActive = (state || "").toUpperCase() === "ACTIVE";
    if (!current)
      return incoming;
    if (!isActive)
      return current;
    if (incoming === "neutral" && current !== "neutral")
      return current;
    if (incoming !== "neutral")
      return incoming;
    return current;
  }
  mapWatchlistToRows(items) {
    const rowMap = {
      "1H": { timeframe: "1H", barsAgo: null },
      "4H": { timeframe: "4H", barsAgo: null },
      "1D": { timeframe: "1D", barsAgo: null },
      "1W": { timeframe: "1W", barsAgo: null },
      "1M": { timeframe: "1M", barsAgo: null },
      "12M": { timeframe: "12M", barsAgo: null },
      "24M": { timeframe: "24M", barsAgo: null }
    };
    for (const it of items || []) {
      const tf = this.tfApiToUi(it?.Timeframe ?? it?.timeframe ?? "");
      if (!tf)
        continue;
      const symbol = (it?.Symbol ?? it?.symbol ?? "").toString().trim().toUpperCase();
      let dir = this.dirToSignal(it?.Direction ?? it?.direction);
      if (symbol === "USDTDOMINANCE" && tf === "4H") {
        console.debug("[watchlist-matrix] Mapping USDTDOMINANCE 4H ->", dir, it);
      }
      const state = it?.State ?? it?.state;
      const barsAgoRaw = it?.BarsAgo ?? it?.barsAgo;
      const barsAgo = typeof barsAgoRaw === "number" ? barsAgoRaw : null;
      const isDominanceSymbol = symbol === "DOMINANCE" || symbol === "BTCDOMINANCE" || symbol === "BTC.D" || symbol === "ALTCOINDOMINANCE" || symbol === "ALT.D" || symbol === "USDTDOMINANCE" || symbol === "USDT.D";
      if (isDominanceSymbol && (it?.Direction ?? it?.direction ?? "").toString().trim().toUpperCase() === "NONE") {
        dir = "neutral";
      }
      if (symbol === "BTCUSDT" || symbol === "BTC" || symbol === "BTC-EUR" || symbol === "BTCEUR") {
        rowMap[tf].btc = this.pickBetter(rowMap[tf].btc, dir, state);
        rowMap[tf].barsAgo = this.pickBarsAgo(rowMap[tf].barsAgo, barsAgo);
      } else if (symbol === "DOMINANCE" || symbol === "BTCDOMINANCE" || symbol === "BTC.D") {
        if (tf !== "12M" && tf !== "24M")
          rowMap[tf].btcDominance = this.pickBetter(rowMap[tf].btcDominance, dir, state);
        rowMap[tf].barsAgo = this.pickBarsAgo(rowMap[tf].barsAgo, barsAgo);
      } else if (symbol === "ALTCOINDOMINANCE" || symbol === "ALT.D") {
        if (tf !== "12M" && tf !== "24M")
          rowMap[tf].altDominance = this.pickBetter(rowMap[tf].altDominance, dir, state);
        rowMap[tf].barsAgo = this.pickBarsAgo(rowMap[tf].barsAgo, barsAgo);
      } else if (symbol === "USDTDOMINANCE" || symbol === "USDT.D") {
        if (tf !== "12M" && tf !== "24M")
          rowMap[tf].usdtDominance = this.pickBetter(rowMap[tf].usdtDominance, dir, state);
        rowMap[tf].barsAgo = this.pickBarsAgo(rowMap[tf].barsAgo, barsAgo);
      }
    }
    const rows = Object.values(rowMap).map((r) => this.stripDominanceForLongTF(r));
    const row4h = rows.find((r) => r.timeframe === "4H");
    console.debug("[watchlist-matrix] Row 4H after mapping:", row4h);
    return rows;
  }
  pickBarsAgo(current, incoming) {
    if (incoming == null)
      return current ?? null;
    if (current == null)
      return incoming;
    return Math.max(current, incoming);
  }
  onCellTap(indicator, timeframe) {
    const evt = new CustomEvent("watchlist-matrix-tap", {
      detail: { indicator, timeframe },
      bubbles: true
    });
    window.dispatchEvent(evt);
  }
  static ctorParameters = () => [];
  static propDecorators = {
    rowsInput: [{ type: Input, args: [{ required: false }] }]
  };
};
WatchlistMatrixComponent = __decorate([
  Component({
    selector: "app-watchlist-matrix",
    standalone: true,
    imports: [],
    template: watchlist_matrix_component_default,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [watchlist_matrix_component_default2]
  })
], WatchlistMatrixComponent);

// src/app/components/watchlist/watchlist.ts
var WatchlistComponent_1;
var FIXED_SYMBOLS = ["BTCUSDT", "DOMINANCE", "ALTCOINDOMINANCE", "USDTDOMINANCE"];
function resolveIconUrl(symbolName, apiBase64) {
  if (apiBase64) {
    const s = apiBase64.trim();
    return s.startsWith("data:") ? s : `data:image/png;base64,${s}`;
  }
  const name = (symbolName || "").toUpperCase();
  if (name.includes("DOMINANCE"))
    return void 0;
  const quotes = ["USDT", "USDC", "BUSD", "USD", "BTC", "ETH", "BNB", "EUR"];
  let base = name;
  for (const q of quotes) {
    if (name.length > q.length && name.endsWith(q)) {
      base = name.slice(0, -q.length);
      break;
    }
  }
  return `https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/${base.toLowerCase()}.png`;
}
var WatchlistComponent = class WatchlistComponent2 {
  static {
    WatchlistComponent_1 = this;
  }
  loading = false;
  errorMsg = "";
  userSymbols = [];
  infoOpen = false;
  infoSymbol = "";
  tickerSub;
  tickerInterval;
  _chartService = inject(ChartService);
  _userSymbolsService = inject(UserSymbolsService);
  tickerService = inject(BinanceTickerService);
  router = inject(Router);
  _settingsService = inject(SettingsService);
  cdr = inject(ChangeDetectorRef);
  location = inject(Location);
  zone = inject(NgZone);
  static symbolsCache = null;
  ngOnInit() {
    this.refreshUserSymbols();
  }
  ngOnDestroy() {
    this.tickerSub?.unsubscribe();
    if (this.tickerInterval)
      clearInterval(this.tickerInterval);
    this.tickerService.disconnect();
  }
  goToChart(symbol, timeframe) {
    if (!symbol)
      return;
    if (!WatchlistComponent_1.symbolsCache) {
      this._chartService.getSymbols().subscribe((symbols) => {
        WatchlistComponent_1.symbolsCache = symbols ?? [];
        this.navigateToChartWithSymbol(symbol, timeframe);
      });
    } else {
      this.navigateToChartWithSymbol(symbol, timeframe);
    }
  }
  navigateToChartWithSymbol(symbol, timeframe) {
    const symbols = WatchlistComponent_1.symbolsCache;
    const symModel = symbols?.find((s) => s.SymbolName == symbol);
    if (symModel) {
      this._settingsService.dispatchAppAction(SettingsActions.setSelectedSymbol({ symbol: symModel }));
    }
    const cleanedTimeframe = (timeframe || "").trim() || "1d";
    this._settingsService.dispatchAppAction(SettingsActions.setSelectedTimeframe({ timeframe: cleanedTimeframe }));
    const cleanedSymbol = symbol.trim();
    if (cleanedSymbol && cleanedTimeframe) {
      this.router.navigate(["/chart", cleanedSymbol, cleanedTimeframe]);
    } else if (cleanedSymbol) {
      this.router.navigate(["/chart", cleanedSymbol]);
    } else {
      this.router.navigate(["/chart"]);
    }
  }
  goToAddSymbol() {
    this.router.navigate(["/watchlist/add"]);
  }
  refresh() {
    this.refreshUserSymbols();
  }
  back() {
    this.location.back();
  }
  refreshUserSymbols() {
    this.loading = true;
    this.errorMsg = "";
    this._userSymbolsService.getUserSymbols().subscribe({
      next: (data) => {
        this.userSymbols = data ?? [];
        this.enrichWithIcons();
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = "Kon gebruikerssymbolen niet laden.";
        console.error("[Watchlist] user symbols load error", err);
        this.cdr.markForCheck();
      }
    });
  }
  enrichWithIcons() {
    this._chartService.getAllSymbols().subscribe({
      next: (symbols) => {
        WatchlistComponent_1.symbolsCache = symbols ?? [];
        const byId = /* @__PURE__ */ new Map();
        const byName = /* @__PURE__ */ new Map();
        for (const s of symbols ?? []) {
          byId.set(s.Id, s);
          byName.set((s.SymbolName || "").toUpperCase(), s);
        }
        this.userSymbols = this.userSymbols.map((us) => {
          const found = byId.get(us.SymbolId) || byName.get((us.SymbolName || "").toUpperCase());
          return __spreadProps(__spreadValues({}, us), {
            SymbolName: us.SymbolName || found?.SymbolName,
            Icon: resolveIconUrl(us.SymbolName || found?.SymbolName || "", found?.Icon)
          });
        });
        const existingNames = new Set(this.userSymbols.map((u) => (u.SymbolName || "").toUpperCase()));
        for (const name of FIXED_SYMBOLS) {
          if (!existingNames.has(name.toUpperCase())) {
            const sym = byName.get(name.toUpperCase());
            this.userSymbols.unshift({
              Id: 0,
              SymbolId: sym?.Id ?? 0,
              ExchangeId: 0,
              SymbolName: name,
              Icon: resolveIconUrl(name, sym?.Icon),
              isFixed: true
            });
          }
        }
        for (const us of this.userSymbols) {
          if (FIXED_SYMBOLS.includes(us.SymbolName || "")) {
            us.isFixed = true;
          }
        }
        this.userSymbols.sort((a, b) => {
          const ai = FIXED_SYMBOLS.indexOf(a.SymbolName || "");
          const bi = FIXED_SYMBOLS.indexOf(b.SymbolName || "");
          if (ai !== -1 && bi !== -1)
            return ai - bi;
          if (ai !== -1)
            return -1;
          if (bi !== -1)
            return 1;
          return 0;
        });
        this.cdr.markForCheck();
        this.startTickerStream();
      }
    });
  }
  startTickerStream() {
    if (this.tickerSub)
      return;
    this.tickerSub = this.tickerService.connect().subscribe();
    this.tickerInterval = setInterval(() => {
      this.zone.run(() => {
        this.applyTickerData();
        this.cdr.markForCheck();
      });
    }, 2e3);
  }
  applyTickerData() {
    const map = this.tickerService.getLatest();
    if (!map.size)
      return;
    for (const us of this.userSymbols) {
      const t = map.get(us.SymbolName || "");
      if (t) {
        us.price = t.close;
        us.changePct = t.changePct;
      }
    }
  }
  deleteUserSymbol(userSymbolId) {
    if (!userSymbolId)
      return;
    this._userSymbolsService.deleteUserSymbol(userSymbolId).subscribe({
      next: () => {
        this.userSymbols = this.userSymbols.filter((u) => u.Id !== userSymbolId);
        this.cdr.markForCheck();
      },
      error: (err) => console.error("[Watchlist] delete user symbol error", err)
    });
  }
  onDeleteClick(ev, userSymbolId) {
    ev.stopPropagation();
    this.deleteUserSymbol(userSymbolId);
  }
  trackByUserSymbol(index, item) {
    return `${item.ExchangeId}|${item.SymbolId}|${item.Id}`;
  }
  clearIcon(us) {
    us.Icon = void 0;
    this.cdr.markForCheck();
  }
  onCoinInfoClick(ev, symbol) {
    ev.stopPropagation();
    const cleaned = (symbol || "").trim();
    if (!cleaned)
      return;
    this.infoSymbol = cleaned;
    this.infoOpen = true;
    this.cdr.markForCheck();
  }
  onMatrixCellClick(payload) {
    if (!payload?.symbol || !payload?.timeframe)
      return;
    this.goToChart(payload.symbol, payload.timeframe);
  }
  closeInfo() {
    this.infoOpen = false;
    this.infoSymbol = "";
    this.cdr.markForCheck();
  }
};
WatchlistComponent = WatchlistComponent_1 = __decorate([
  Component({
    selector: "app-watchlist",
    imports: [CommonModule, FooterComponent, WatchlistMatrixComponent, CoinInfoComponent, DecimalPipe],
    template: watchlist_default,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [watchlist_default2]
  })
], WatchlistComponent);
export {
  WatchlistComponent
};
//# sourceMappingURL=watchlist-WIWTG5JP.js.map
