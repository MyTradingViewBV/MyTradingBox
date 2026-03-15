import {
  FooterComponent
} from "./chunk-W7JRI3U7.js";
import {
  FormsModule
} from "./chunk-Q2YWWPC5.js";
import {
  ChartService,
  SettingsActions,
  SettingsService
} from "./chunk-UO4HDZ2G.js";
import {
  CommonModule,
  Location,
  Router
} from "./chunk-IOKBW7VW.js";
import {
  Component,
  __decorate,
  inject
} from "./chunk-X5OTQXGI.js";

// angular:jit:template:src\app\components\orders\orders.html
var orders_default = `<div class="orders-root">\r
  <div class="wl-header">\r
    <h2 class="wl-title">Orders</h2>\r
    <button type="button" class="wl-btn" (click)="back()" [disabled]="loading" aria-label="Back">\r
      <span class="icon">\u21A9</span>\r
    </button>\r
    <button type="button" class="wl-btn" (click)="refresh()" [disabled]="loading" aria-label="Refresh">\r
      <span class="icon">\u27F3</span>\r
    </button>\r
    <div class="ord-filter">\r
      <select [(ngModel)]="selectedStatus" (change)="filterOrders()" [disabled]="loading">\r
        <option value="">Alle</option>\r
        <option value="ACTIVE">Active</option>\r
        <option value="NEW">New</option>\r
        <option value="DONE">Done</option>\r
      </select>\r
    </div>\r
  </div>\r
\r
  <div class="component-wrapper" style="position: relative;">\r
    @if (loading) {\r
      <div class="mtb-overlay"><span class="mtb-spinner large"></span></div>\r
    }\r
  </div>\r
\r
  @if (!loading) {\r
    <div class="ord-summary">\r
      <h2>Portfolio Overview</h2>\r
      <div class="ord-summary-grid">\r
        <div class="ord-s-item">\r
          <span>Balance</span>\r
          <div class="ord-s-val">$ {{ fullResult.AccountBalance | number:'1.2-2' }}</div>\r
        </div>\r
        <div class="ord-s-item">\r
          <span>Balance + Open</span>\r
          <div class="ord-s-val"\r
            [ngClass]="{positive: fullResult.AccountBalanceWithOpenOrders > 0, negative: fullResult.AccountBalanceWithOpenOrders < 0}">\r
            $ {{ fullResult.AccountBalanceWithOpenOrders | number:'1.2-2' }}\r
          </div>\r
        </div>\r
        <div class="ord-s-item">\r
          <span>Closed Realized</span>\r
          <div class="ord-s-val"\r
            [ngClass]="{positive: fullResult.ClosedRealizedAmount > 0, negative: fullResult.ClosedRealizedAmount < 0}">\r
            {{ fullResult.ClosedRealizedAmount | number:'1.2-2' }}%\r
          </div>\r
        </div>\r
        <div class="ord-s-item">\r
          <span>Market Value Open</span>\r
          <div class="ord-s-val"\r
            [ngClass]="{positive: fullResult.MarketValueOpenOrders > 0, negative: fullResult.MarketValueOpenOrders < 0}">\r
            $ {{ fullResult.MarketValueOpenOrders | number:'1.2-2' }}\r
          </div>\r
        </div>\r
        <div class="ord-s-item">\r
          <span>Open Unrealized</span>\r
          <div class="ord-s-val"\r
            [ngClass]="{positive: fullResult.OpenUnrealizedAmount > 0, negative: fullResult.OpenUnrealizedAmount < 0}">\r
            $ {{ fullResult.OpenUnrealizedAmount | number:'1.2-2' }}\r
          </div>\r
        </div>\r
        <div class="ord-s-item">\r
          <span>Total %</span>\r
          <div class="ord-s-val"\r
            [ngClass]="{positive: fullResult.TotalPercentageAmount > 0, negative: fullResult.TotalPercentageAmount < 0}">\r
            {{ fullResult.TotalPercentageAmount | number:'1.2-2' }}%\r
          </div>\r
        </div>\r
      </div>\r
    </div>\r
  }\r
\r
  @if (!loading) {\r
    <div class="ord-section">\r
      <div class="ord-section-header">\r
        <h3>Orders</h3>\r
        <span class="badge">{{ filteredOrders.length }}</span>\r
      </div>\r
      <div class="ord-orders-list">\r
        @for (order of filteredOrders; track order) {\r
          <div class="ord-expansion" [class.open]="isExpanded(order)">\r
            <button type="button" class="ord-expansion-header" (click)="toggleOrder(order)">\r
              <span class="chevron" [class.rot]="isExpanded(order)">\u25B6</span>\r
              <span class="pnl" [ngClass]="{positive: order.PnlAmount > 0, negative: order.PnlAmount < 0}">{{\r
              order.PnlPercent | number:'1.2-2' }}%</span>\r
              <span class="sym">{{ order.Symbol }}</span>\r
              <span class="dir" [ngClass]="{positive: order.Direction === 'LONG', negative: order.Direction === 'SHORT'}">{{\r
              order.Direction }}</span>\r
              <span class="st">{{ order.Status }}</span>\r
              <span class="tf">{{ order.ExecutionTimeframe }} / {{ order.ConfirmationTimeframe }}</span>\r
              <span class="created">{{ order.CreatedAt | date:'HH:mm dd/MM' }}</span>\r
            </button>\r
            @if (isExpanded(order)) {\r
              <div class="ord-expansion-body">\r
                <div class="ord-fields">\r
                  <div class="ord-field"><span class="label">Entry</span><span class="val">$ {{ order.EntryPrice |\r
                number:'1.2-4' }}</span></div>\r
                <div class="ord-field"><span class="label">Current</span><span class="val">$ {{ order.CurrentPrice |\r
              number:'1.2-4' }}</span></div>\r
              <div class="ord-field"><span class="label">Stop</span><span class="val">$ {{ order.StopLoss | number:'1.2-4'\r
            }}</span></div>\r
            <div class="ord-field"><span class="label">Target1</span><span class="val">$ {{ order.TargetPrice |\r
          number:'1.2-4' }}</span></div>\r
          <div class="ord-field"><span class="label">Target2</span><span class="val">$ {{ order.Target2Price |\r
        number:'1.2-4' }}</span></div>\r
        <div class="ord-field"><span class="label">Exit Price</span><span class="val">{{ order.ExitPrice ? ('$ ' +\r
      (order.ExitPrice | number:'1.2-4')) : '-' }}</span></div>\r
      @if (order.ExitType) {\r
        <div class="ord-field"><span class="label">Exit Type</span><span class="val">{{\r
      order.ExitType }}</span></div>\r
    }\r
    @if (order.FailureReason) {\r
      <div class="ord-field"><span class="label">Failure</span><span class="val">{{\r
    order.FailureReason }}</span></div>\r
  }\r
  <div class="ord-field"><span class="label">Entry Opt</span><span class="val">{{ order.EntryOption }}</span>\r
</div>\r
<div class="ord-field"><span class="label">Confidence</span><span class="val">{{ order.ConfidenceScore\r
}}</span></div>\r
<div class="ord-field"><span class="label">Reason</span><span class="val">{{ order.ConfidenceReason || '-'\r
}}</span></div>\r
<div class="ord-field"><span class="label">Qty</span><span class="val">{{ order.Quantity }}</span></div>\r
<div class="ord-field"><span class="label">Real / Unreal</span><span class="val">\r
<span [ngClass]="{positive: order.RealizedAmount > 0, negative: order.RealizedAmount < 0}">{{\r
order.RealizedAmount | number:'1.2-2' }}</span>\r
/\r
<span [ngClass]="{positive: order.UnrealizedAmount > 0, negative: order.UnrealizedAmount < 0}">{{\r
order.UnrealizedAmount | number:'1.2-2' }}</span>\r
</span></div>\r
@if (order.Target1ExitedQuantity || order.Target1ExitPrice) {\r
  <div class="ord-field"><span class="label">T1\r
  Exited</span><span class="val">{{ order.Target1ExitedQuantity }} @ $ {{ order.Target1ExitPrice || '-'\r
}}</span></div>\r
}\r
@if (order.Target2ExitedQuantity || order.Target2ExitPrice) {\r
  <div class="ord-field"><span class="label">T2\r
  Exited</span><span class="val">{{ order.Target2ExitedQuantity }} @ $ {{ order.Target2ExitPrice || '-'\r
}}</span></div>\r
}\r
@if (order.SourceSignalType) {\r
  <div class="ord-field"><span class="label">Signal</span><span class="val">{{\r
order.SourceSignalType }}</span></div>\r
}\r
</div>\r
<div class="ord-actions">\r
  <button type="button" (click)="goToChart(order.Symbol, order.ConfirmationTimeframe)">Open Chart</button>\r
</div>\r
</div>\r
}\r
</div>\r
}\r
</div>\r
</div>\r
}\r
\r
@if (loading) {\r
  <div class="spinner-container">Loading...</div>\r
}\r
</div>\r
<app-footer></app-footer>`;

// angular:jit:style:src\app\components\orders\orders.scss
var orders_default2 = "/* src/app/components/orders/orders.scss */\n.ord-viewport {\n  height: 70vh;\n  width: 100%;\n}\n.ord-expansion-header {\n  min-height: 56px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 4px 8px;\n}\n.ord-expansion {\n  border-bottom: 1px solid rgba(255, 255, 255, 0.08);\n}\n.ord-fields {\n  display: grid;\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  gap: 6px 12px;\n}\n.ord-field .label {\n  opacity: 0.8;\n  margin-right: 6px;\n}\n.wl-header {\n  position: sticky;\n  top: 0;\n}\n.wl-header .wl-title {\n  position: absolute;\n  left: 50%;\n  transform: translateX(-50%);\n  margin: 0;\n  font-size: 18px;\n  font-weight: 600;\n  letter-spacing: 0.5px;\n  background:\n    linear-gradient(\n      90deg,\n      #ff8b2f,\n      #ffd643);\n  -webkit-background-clip: text;\n  color: transparent;\n}\n/*# sourceMappingURL=orders.css.map */\n";

// src/app/modules/shared/models/orders/tradeOrders.dto.ts
var TradePlanModel = class {
  AccountBalance = 0;
  // e.g. 9798.39
  AccountBalanceWithOpenOrders = 0;
  // e.g. 9992.7479
  MarketValueOpenOrders = 0;
  // e.g. 194.35
  OpenUnrealizedAmount = 0;
  // e.g. -5.64
  ClosedRealizedAmount = 0;
  // e.g. -14.28
  TotalPercentageAmount = 0;
  // e.g. 1.9835
  PricesCount = 0;
  // e.g. 4
  Orders = [];
  BaseStake = 0;
  TotalPnlAmount = 0;
  TotalPnlPercent = 0;
  DonePnlAmount = 0;
};

// src/app/components/orders/orders.ts
var OrdersComponent = class OrdersComponent2 {
  orders = [];
  filteredOrders = [];
  selectedStatus = "ACTIVE";
  fullResult = new TradePlanModel();
  loading = false;
  // watchlist: WatchlistDTO[] = [];
  selectedTimeframe = "";
  expandedOrderIds = /* @__PURE__ */ new Set();
  _chartService = inject(ChartService);
  router = inject(Router);
  _settingsService = inject(SettingsService);
  location = inject(Location);
  constructor() {
  }
  ngOnInit() {
    this.loading = true;
    this._chartService.getTradeOrdersV2().subscribe((data) => {
      console.log("DATA: ", data);
      this.orders = data.Orders;
      this.fullResult = data;
      this.filteredOrders = [...this.orders];
      this.loading = false;
      this.filterOrders();
      console.log("Orders fetched:", this.orders);
    });
  }
  goToChart(symbol, timeframe) {
    if (!symbol)
      return;
    this._chartService.getSymbols().subscribe((symbols) => {
      if (symbols) {
        const symModel = symbols.find((s) => s.SymbolName == symbol);
        this._settingsService.dispatchAppAction(SettingsActions.setSelectedSymbol({ symbol: symModel }));
        const tf = (timeframe || "").trim() || "1d";
        if (tf) {
          this._settingsService.dispatchAppAction(SettingsActions.setSelectedTimeframe({ timeframe: tf }));
        }
        const cleanedSymbol = symbol.trim();
        const cleanedTimeframe = tf;
        if (cleanedSymbol && cleanedTimeframe) {
          this.router.navigate(["/chart", cleanedSymbol, cleanedTimeframe]);
        } else if (cleanedSymbol) {
          this.router.navigate(["/chart", cleanedSymbol]);
        } else {
          this.router.navigate(["/chart"]);
        }
      }
    });
  }
  filterOrders() {
    if (!this.selectedStatus) {
      this.filteredOrders = [...this.orders];
    } else {
      if (this.selectedStatus === "ACTIVE") {
        this.filteredOrders = this.orders.filter((x) => x.Status === "NEW" || x.Status === "TARGET1");
      } else {
        this.filteredOrders = this.orders.filter((o) => o.Status === this.selectedStatus);
      }
    }
  }
  getStatusColor(status) {
    return status === "NEW" ? "primary" : status === "DONE" ? "accent" : "";
  }
  deleteOrder(orderId) {
    this._chartService.deleteOrder(orderId).subscribe(() => {
      this.orders = this.orders.filter((order) => order.Id !== orderId);
      console.log(`Order with ID ${orderId} deleted.`);
    });
  }
  refresh() {
    this.loading = true;
    this._chartService.getTradeOrdersV2().subscribe((data) => {
      this.orders = data.Orders;
      this.fullResult = data;
      this.filteredOrders = [...this.orders];
      console.log("Orders refreshed:", this.orders);
      this.loading = false;
      this.selectedStatus = "NEW";
      this.filterOrders();
      console.log("Orders refreshed");
    });
  }
  toggleOrder(order) {
    const id = order.Id;
    if (this.expandedOrderIds.has(id)) {
      this.expandedOrderIds.delete(id);
    } else {
      this.expandedOrderIds.add(id);
    }
  }
  isExpanded(order) {
    return this.expandedOrderIds.has(order.Id);
  }
  back() {
    this.location.back();
  }
  static ctorParameters = () => [];
};
OrdersComponent = __decorate([
  Component({
    selector: "app-orders",
    imports: [CommonModule, FormsModule, FooterComponent],
    template: orders_default,
    styles: [orders_default2]
  })
], OrdersComponent);
export {
  OrdersComponent
};
//# sourceMappingURL=orders-63IYQPDQ.js.map
