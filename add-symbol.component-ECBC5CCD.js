import {
  FormsModule
} from "./chunk-Q2YWWPC5.js";
import {
  BinanceTickerService,
  UserSymbolsService
} from "./chunk-5BKVEBDP.js";
import {
  ChartService
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
  NgZone,
  __decorate,
  inject
} from "./chunk-X5OTQXGI.js";

// angular:jit:template:src\app\components\watchlist\add-symbol\add-symbol.component.html
var add_symbol_component_default = `<div class="add-symbol-root">\r
  <!-- Header -->\r
  <div class="tv-header">\r
    <button type="button" class="tv-header-btn" (click)="goBack()" aria-label="Back">\r
      <span class="tv-icon">\u2190</span>\r
    </button>\r
    <h2 class="tv-title">Add Symbol</h2>\r
  </div>\r
\r
  <!-- Search bar -->\r
  <div class="tv-search-bar">\r
    <span class="tv-search-icon">\u{1F50D}</span>\r
    <input\r
      type="text"\r
      class="tv-search-input"\r
      placeholder="Search symbols..."\r
      [(ngModel)]="searchQuery"\r
      (input)="onSearchInput()"\r
      autofocus\r
    />\r
    @if (searchQuery) {\r
      <button type="button" class="tv-clear-btn" (click)="clearSearch()">\u2715</button>\r
    }\r
  </div>\r
\r
  <!-- Results -->\r
  <div class="tv-results">\r
    @if (loading) {\r
      <div class="tv-loading">\r
        <span class="mtb-spinner"></span>\r
      </div>\r
    }\r
\r
    @if (!loading && filteredSymbols.length === 0) {\r
      <div class="tv-no-results">\r
        No symbols found\r
      </div>\r
    }\r
\r
    @if (!loading) {\r
      <div class="tv-results-count">\r
        <span>{{ filteredSymbols.length }} symbols</span>\r
      </div>\r
      @for (vm of filteredSymbols; track trackBySymbol($index, vm)) {\r
        <div\r
          class="tv-result-row"\r
          [class.is-added]="vm.isAdded"\r
          [class.is-adding]="vm.adding"\r
          (click)="onRowClick(vm)"\r
        >\r
          <div class="tv-result-icon">\r
            @if (vm.icon) {\r
              <img [src]="vm.icon" [alt]="vm.name" class="tv-coin-img" (error)="onIconError(vm)" />\r
            } @else {\r
              <span class="tv-coin-placeholder">{{ vm.name.charAt(0) }}</span>\r
            }\r
          </div>\r
          <div class="tv-result-info">\r
            <span class="tv-result-name">{{ vm.name }}</span>\r
          </div>\r
          <div class="tv-result-price">\r
            @if (vm.price != null) {\r
              <span class="tv-price">{{ vm.price | number:'1.2-6' }}</span>\r
              <span class="tv-change" [class.positive]="(vm.changePct ?? 0) >= 0" [class.negative]="(vm.changePct ?? 0) < 0">\r
                {{ (vm.changePct ?? 0) >= 0 ? '+' : '' }}{{ vm.changePct | number:'1.2-2' }}%\r
              </span>\r
            }\r
          </div>\r
          <div class="tv-result-status">\r
            @if (vm.adding || vm.removing) {\r
              <span class="mtb-spinner small"></span>\r
            } @else if (vm.isAdded) {\r
              <span class="tv-remove-badge" title="Remove">\u2715</span>\r
            }\r
          </div>\r
        </div>\r
      }\r
    }\r
  </div>\r
</div>\r
`;

// angular:jit:style:src\app\components\watchlist\add-symbol\add-symbol.component.scss
var add_symbol_component_default2 = '/* src/app/components/watchlist/add-symbol/add-symbol.component.scss */\n.add-symbol-root {\n  display: flex;\n  flex-direction: column;\n  height: 100vh;\n  background: #131722;\n  color: #d1d4dc;\n  font-family:\n    -apple-system,\n    BlinkMacSystemFont,\n    "Segoe UI",\n    Roboto,\n    sans-serif;\n}\n.tv-header {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 10px 16px;\n  background: #1e222d;\n  border-bottom: 1px solid #2a2e39;\n}\n.tv-title {\n  margin: 0;\n  font-size: 16px;\n  font-weight: 600;\n  color: #d1d4dc;\n  flex: 1;\n}\n.tv-header-btn {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 32px;\n  height: 32px;\n  background: transparent;\n  border: none;\n  border-radius: 4px;\n  color: #787b86;\n  font-size: 16px;\n  cursor: pointer;\n  transition: background 0.15s, color 0.15s;\n}\n.tv-header-btn:hover {\n  background: #2a2e39;\n  color: #d1d4dc;\n}\n.tv-icon {\n  line-height: 1;\n}\n.tv-search-bar {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 8px 16px;\n  background: #1e222d;\n  border-bottom: 1px solid #2a2e39;\n}\n.tv-search-icon {\n  color: #787b86;\n  font-size: 14px;\n  flex-shrink: 0;\n}\n.tv-search-input {\n  flex: 1;\n  background: transparent;\n  border: none;\n  outline: none;\n  color: #d1d4dc;\n  font-size: 14px;\n  padding: 6px 0;\n}\n.tv-search-input::placeholder {\n  color: #787b86;\n}\n.tv-clear-btn {\n  background: transparent;\n  border: none;\n  color: #787b86;\n  font-size: 14px;\n  cursor: pointer;\n  padding: 4px;\n  border-radius: 4px;\n}\n.tv-clear-btn:hover {\n  color: #d1d4dc;\n  background: #2a2e39;\n}\n.tv-results {\n  flex: 1;\n  overflow-y: auto;\n  scrollbar-width: thin;\n  scrollbar-color: #363a45 transparent;\n}\n.tv-results-count {\n  padding: 6px 16px;\n  font-size: 11px;\n  color: #787b86;\n  border-bottom: 1px solid rgba(42, 46, 57, 0.5);\n}\n.tv-loading,\n.tv-no-results {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  padding: 40px 16px;\n  color: #787b86;\n  font-size: 14px;\n}\n.tv-result-row {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  padding: 8px 16px;\n  border-bottom: 1px solid rgba(42, 46, 57, 0.3);\n  transition: background 0.12s;\n  cursor: pointer;\n  -webkit-user-select: none;\n  user-select: none;\n}\n.tv-result-row:hover {\n  background: #1e222d;\n}\n.tv-result-row:active {\n  background: #262b3a;\n}\n.tv-result-row.is-added {\n  background: rgba(41, 98, 255, 0.04);\n  cursor: default;\n}\n.tv-result-row.is-added:hover {\n  background: rgba(41, 98, 255, 0.06);\n}\n.tv-result-row.is-adding {\n  opacity: 0.6;\n  cursor: wait;\n}\n.tv-result-icon {\n  width: 28px;\n  height: 28px;\n  flex-shrink: 0;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.tv-coin-img {\n  width: 28px;\n  height: 28px;\n  border-radius: 50%;\n  object-fit: cover;\n}\n.tv-coin-placeholder {\n  width: 28px;\n  height: 28px;\n  border-radius: 50%;\n  background: #2a2e39;\n  color: #787b86;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 13px;\n  font-weight: 600;\n}\n.tv-result-info {\n  flex: 1;\n  min-width: 0;\n}\n.tv-result-name {\n  font-size: 14px;\n  font-weight: 500;\n  color: #d1d4dc;\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.tv-result-action {\n  flex-shrink: 0;\n}\n.tv-result-price {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 1px;\n  margin-left: auto;\n  min-width: 80px;\n  text-align: right;\n}\n.tv-price {\n  font-size: 13px;\n  font-weight: 500;\n  color: #d1d4dc;\n  font-variant-numeric: tabular-nums;\n}\n.tv-change {\n  font-size: 11px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n}\n.tv-change.positive {\n  color: #26a69a;\n}\n.tv-change.negative {\n  color: #ef5350;\n}\n.tv-result-status {\n  flex-shrink: 0;\n  width: 28px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n.tv-added-badge {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 22px;\n  height: 22px;\n  border-radius: 50%;\n  background: rgba(41, 98, 255, 0.15);\n  color: #2962ff;\n  font-size: 12px;\n  font-weight: 700;\n}\n.tv-remove-badge {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 22px;\n  height: 22px;\n  border-radius: 50%;\n  background: rgba(239, 83, 80, 0.15);\n  color: #ef5350;\n  font-size: 12px;\n  font-weight: 700;\n}\n.tv-add-btn {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 30px;\n  height: 30px;\n  background: transparent;\n  border: 1px solid #2a2e39;\n  border-radius: 4px;\n  color: #787b86;\n  font-size: 18px;\n  font-weight: 600;\n  cursor: pointer;\n  transition: all 0.15s;\n}\n.tv-add-btn:hover {\n  border-color: #2962ff;\n  color: #2962ff;\n  background: rgba(41, 98, 255, 0.1);\n}\n.tv-remove-btn {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  width: 30px;\n  height: 30px;\n  background: rgba(41, 98, 255, 0.1);\n  border: 1px solid #2962ff;\n  border-radius: 4px;\n  color: #2962ff;\n  font-size: 14px;\n  font-weight: 700;\n  cursor: pointer;\n  transition: all 0.15s;\n}\n.tv-remove-btn:hover {\n  background: rgba(234, 57, 67, 0.1);\n  border-color: #ef5350;\n  color: #ef5350;\n}\n.tv-adding-spinner {\n  display: inline-block;\n}\n@media (max-width: 640px) {\n  .tv-search-bar {\n    padding: 8px 12px;\n  }\n  .tv-result-row {\n    padding: 8px 12px;\n  }\n}\n/*# sourceMappingURL=add-symbol.component.css.map */\n';

// src/app/components/watchlist/add-symbol/add-symbol.component.ts
var AddSymbolComponent = class AddSymbolComponent2 {
  searchQuery = "";
  loading = true;
  allSymbols = [];
  filteredSymbols = [];
  /** Maps SymbolId → UserSymbol.Id so we can call delete */
  userSymbolMap = /* @__PURE__ */ new Map();
  tickerSub;
  tickerInterval;
  _chartService = inject(ChartService);
  _userSymbolsService = inject(UserSymbolsService);
  tickerService = inject(BinanceTickerService);
  router = inject(Router);
  location = inject(Location);
  cdr = inject(ChangeDetectorRef);
  zone = inject(NgZone);
  ngOnInit() {
    this._userSymbolsService.getUserSymbols().subscribe({
      next: (userSymbols) => {
        for (const us of userSymbols ?? []) {
          this.userSymbolMap.set(us.SymbolId, us.Id);
        }
        this.loadAllSymbols();
      },
      error: () => this.loadAllSymbols()
    });
  }
  ngOnDestroy() {
    this.tickerSub?.unsubscribe();
    if (this.tickerInterval)
      clearInterval(this.tickerInterval);
    this.tickerService.disconnect();
  }
  resolveIconUrl(symbolName, apiBase64) {
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
  onIconError(vm) {
    vm.icon = void 0;
    this.cdr.markForCheck();
  }
  loadAllSymbols() {
    this._chartService.getSymbols().subscribe({
      next: (symbols) => {
        this.allSymbols = (symbols ?? []).map((s) => ({
          id: s.Id,
          name: s.SymbolName,
          icon: this.resolveIconUrl(s.SymbolName, s.Icon),
          isAdded: this.userSymbolMap.has(s.Id),
          adding: false,
          removing: false,
          userSymbolId: this.userSymbolMap.get(s.Id)
        }));
        this.applyFilter();
        this.loading = false;
        this.cdr.markForCheck();
        this.startTickerStream();
      },
      error: () => {
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }
  startTickerStream() {
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
    for (const vm of this.filteredSymbols) {
      const t = map.get(vm.name);
      if (t) {
        vm.price = t.close;
        vm.changePct = t.changePct;
      }
    }
  }
  onSearchInput() {
    this.applyFilter();
  }
  clearSearch() {
    this.searchQuery = "";
    this.applyFilter();
  }
  applyFilter() {
    const q = (this.searchQuery || "").trim().toLowerCase();
    if (!q) {
      this.filteredSymbols = [...this.allSymbols];
    } else {
      this.filteredSymbols = this.allSymbols.filter((s) => s.name.toLowerCase().includes(q));
    }
    this.filteredSymbols.sort((a, b) => Number(b.isAdded) - Number(a.isAdded) || a.name.localeCompare(b.name));
    this.applyTickerData();
    this.cdr.markForCheck();
  }
  onRowClick(vm) {
    if (vm.adding || vm.removing)
      return;
    if (vm.isAdded) {
      const userSymbolId = vm.userSymbolId;
      if (!userSymbolId)
        return;
      vm.removing = true;
      this.cdr.markForCheck();
      this._userSymbolsService.deleteUserSymbol(userSymbolId).subscribe({
        next: () => {
          vm.isAdded = false;
          vm.removing = false;
          vm.userSymbolId = void 0;
          this.userSymbolMap.delete(vm.id);
          this.applyFilter();
        },
        error: () => {
          vm.removing = false;
          this.cdr.markForCheck();
        }
      });
    } else {
      vm.adding = true;
      this.cdr.markForCheck();
      this._userSymbolsService.addUserSymbol(vm.id).subscribe({
        next: (created) => {
          vm.isAdded = true;
          vm.adding = false;
          vm.userSymbolId = created?.Id;
          this.userSymbolMap.set(vm.id, created?.Id);
          this.router.navigate(["/watchlist"]);
        },
        error: () => {
          vm.adding = false;
          this.cdr.markForCheck();
        }
      });
    }
  }
  goBack() {
    this.location.back();
  }
  trackBySymbol(_index, vm) {
    return vm.id;
  }
};
AddSymbolComponent = __decorate([
  Component({
    selector: "app-add-symbol",
    standalone: true,
    imports: [CommonModule, FormsModule, DecimalPipe],
    template: add_symbol_component_default,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [add_symbol_component_default2]
  })
], AddSymbolComponent);
export {
  AddSymbolComponent
};
//# sourceMappingURL=add-symbol.component-ECBC5CCD.js.map
