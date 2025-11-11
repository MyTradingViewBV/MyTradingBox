import {
  MatChipsModule,
  MatSnackBar
} from "./chunk-56MOTVX5.js";
import {
  ChartService,
  CommonModule,
  MatButton,
  MatCardModule,
  MatFormFieldModule,
  MatIconModule,
  MatSelectModule,
  Router,
  SettingsActions,
  SettingsService
} from "./chunk-ELQY3RNL.js";
import {
  Component,
  __decorate
} from "./chunk-2VC6L3W2.js";

// angular:jit:template:src\app\components\watchlist\watchlist.html
var watchlist_default = '<div class="watchlist-container">\n  <div class="header-actions">\n    <button mat-button (click)="back()">\n      <mat-icon fontIcon="arrow_back"></mat-icon>\n      Back\n    </button>\n    <button mat-button (click)="refresh()">\n      <mat-icon fontIcon="refresh"></mat-icon>\n      Refresh\n    </button>\n    <span class="spacer"></span>\n    <mat-form-field appearance="outline" class="monitoring-select dense">\n      <mat-select\n        [(value)]="selectedMonitoringFilter"\n        (selectionChange)="applyMonitoringFilter()"\n        placeholder="Monitoring"\n      >\n        <mat-option value="ALL">ALL</mat-option>\n        <mat-option value="ACTIVEMONITORING">ACTIVEMONITORING</mat-option>\n        <mat-option value="NO MONITORING">NO MONITORING</mat-option>\n      </mat-select>\n    </mat-form-field>\n  </div>\n\n  <div class="scrollable-list">\n    <!-- Group 1: BTC-DIV -->\n    <h3 class="group-label">BTC-DIV</h3>\n    <mat-card\n      *ngFor="let item of btcDivItemsFiltered"\n      class="watchlist-row-card"\n      (click)="goToChart(item.Symbol, item.Timeframe)"\n    >\n      <div class="row-top">\n        <span class="symbol">{{ item.Symbol }}</span>\n        <span class="timeframe">{{ item.Timeframe }}</span>\n      </div>\n\n      <div class="row-bottom">\n        <mat-chip-listbox class="chip-list">\n          <mat-chip>{{ item.Status }}</mat-chip>\n          <mat-chip [ngClass]="item.Direction.toLowerCase()">{{\n            item.Direction\n          }}</mat-chip>\n        </mat-chip-listbox>\n\n        <span class="created">{{ item.CreatedAt | date: "HH:mm" }}</span>\n      </div>\n    </mat-card>\n\n    <!-- Group 2: Other statuses -->\n    <h3 class="group-label">Other</h3>\n    <mat-card\n      *ngFor="let item of otherItemsFiltered"\n      class="watchlist-row-card"\n      (click)="goToChart(item.Symbol, item.Timeframe)"\n    >\n      <div class="row-top">\n        <span class="symbol">{{ item.Symbol }}</span>\n        <span class="timeframe">{{ item.Timeframe }}</span>\n      </div>\n\n      <div class="row-bottom">\n        <mat-chip-listbox class="chip-list">\n          <mat-chip>{{ item.Status }}</mat-chip>\n          <mat-chip [ngClass]="item.Direction.toLowerCase()">{{\n            item.Direction\n          }}</mat-chip>\n          <mat-chip color="accent">{{ item.MonitoringStatus }}</mat-chip>\n          <mat-chip>{{ item.EntryOption }}</mat-chip>\n        </mat-chip-listbox>\n\n        <span class="created">{{ item.CreatedAt | date: "HH:mm" }}</span>\n      </div>\n    </mat-card>\n  </div>\n</div>\n';

// angular:jit:style:src\app\components\watchlist\watchlist.scss
var watchlist_default2 = '/* src/app/components/watchlist/watchlist.scss */\n.watchlist-container {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  background: var(--sys-surface-container-high, #181a20);\n  color: var(--sys-on-surface, #ddd);\n  padding-bottom: calc(var(--footer-height));\n}\n.scrollable-list {\n  flex: 1;\n  overflow-y: auto;\n  padding: 8px 12px 12px;\n  box-sizing: border-box;\n  scrollbar-width: thin;\n}\n.group-label {\n  margin: 18px 0 6px;\n  font-weight: 600;\n  font-size: 13px;\n  letter-spacing: 0.5px;\n  color: var(--sys-on-surface-variant, #8a8f99);\n  text-transform: uppercase;\n  position: sticky;\n  top: 0;\n  -webkit-backdrop-filter: blur(4px);\n  backdrop-filter: blur(4px);\n  padding: 4px 0;\n}\n.watchlist-row-card {\n  display: flex;\n  flex-direction: column;\n  padding: 10px 14px 8px;\n  margin: 0 0 10px;\n  background: var(--sys-surface-container, #20242b);\n  border: 1px solid #262a30;\n  border-radius: 12px;\n  cursor: pointer;\n  position: relative;\n  transition:\n    background 0.2s ease,\n    transform 0.16s ease,\n    box-shadow 0.16s ease;\n  overflow: hidden;\n}\n.watchlist-row-card::before {\n  content: "";\n  position: absolute;\n  inset: 0;\n  background:\n    linear-gradient(\n      90deg,\n      rgba(255, 255, 255, 0.04),\n      rgba(255, 255, 255, 0));\n  opacity: 0;\n  transition: opacity 0.25s ease;\n  pointer-events: none;\n}\n.watchlist-row-card:hover {\n  background: var(--sys-surface-container-high, #181a20);\n  transform: translateY(-2px);\n  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);\n}\n.watchlist-row-card:hover::before {\n  opacity: 1;\n}\n.watchlist-row-card:active {\n  transform: translateY(0);\n}\n.row-top {\n  display: flex;\n  justify-content: space-between;\n  font-weight: 600;\n  font-size: 13px;\n  color: var(--sys-on-surface, #eee);\n}\n.row-top .timeframe {\n  font-weight: 500;\n  color: #8a8f99;\n}\n.row-bottom {\n  margin-top: 4px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.row-bottom .chip-list {\n  display: flex;\n  gap: 4px;\n}\n.row-bottom .chip-list mat-chip {\n  height: 22px;\n  font-size: 12px;\n  padding: 0 6px;\n}\n.row-bottom .chip-list .bear,\n.row-bottom .chip-list .short {\n  background: #e57373;\n  color: white;\n}\n.row-bottom .chip-list .bull,\n.row-bottom .chip-list .long {\n  background: #81c784;\n  color: white;\n}\n.row-bottom .chip-list .divergence {\n  background: #64b5f6;\n  color: white;\n}\n.row-bottom .chip-list .none {\n  background: #bdbdbd;\n  color: white;\n}\n.row-bottom .created {\n  font-size: 11px;\n  color: #8a8f99;\n  margin-left: auto;\n  font-variant-numeric: tabular-nums;\n}\n.header-actions {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin: 8px 8px 0;\n  height: 54px;\n  position: sticky;\n  top: 0;\n  z-index: 10;\n  background: var(--sys-surface-container-high, #181a20);\n  border-bottom: 1px solid var(--sys-outline, #222);\n  -webkit-backdrop-filter: blur(4px);\n  backdrop-filter: blur(4px);\n  padding: 8px 4px;\n}\n.header-actions button[mat-button] {\n  height: 34px;\n  line-height: 34px;\n  font-size: 13px;\n  font-weight: 500;\n  color: var(--sys-on-surface, #eee);\n  background: rgba(255, 255, 255, 0.04);\n  border: 1px solid #2a2d33;\n  border-radius: 8px;\n  padding: 0 14px;\n  transition:\n    background 0.2s ease,\n    transform 0.2s ease,\n    box-shadow 0.2s ease;\n  text-transform: capitalize;\n}\n.header-actions button[mat-button]:hover {\n  background: rgba(255, 255, 255, 0.08);\n  transform: translateY(-1px);\n}\n.header-actions button[mat-button]:active {\n  background: rgba(255, 255, 255, 0.12);\n  transform: translateY(0);\n}\n.header-actions .spacer {\n  flex: 1 1 auto;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense {\n  max-width: 230px;\n  height: 65px;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-form-field-flex {\n  min-height: 34px;\n  height: 34px;\n  padding: 0 10px !important;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-form-field-infix {\n  padding: 0 !important;\n  min-height: 34px !important;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-select-trigger {\n  height: 34px;\n  display: flex;\n  align-items: center;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-select-value,\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-select-placeholder {\n  font-size: 13px;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-form-field-outline-start,\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-form-field-outline-end {\n  height: 34px;\n}\n.chip-list mat-chip {\n  font-weight: 500;\n  letter-spacing: 0.3px;\n  border-radius: 6px !important;\n}\n.chip-list mat-chip.bear,\n.chip-list mat-chip.short {\n  background: #b04141;\n}\n.chip-list mat-chip.bull,\n.chip-list mat-chip.long {\n  background: #2e7d32;\n}\n.chip-list mat-chip.divergence {\n  background: #1565c0;\n}\n.chip-list mat-chip.none {\n  background: #616161;\n}\n@media (max-width: 600px) {\n  .watchlist-row-card {\n    padding: 8px 10px 6px;\n    border-radius: 10px;\n  }\n  .row-top {\n    font-size: 12px;\n  }\n  .header-actions {\n    height: 50px;\n  }\n  .group-label {\n    font-size: 12px;\n  }\n}\n/*# sourceMappingURL=watchlist.css.map */\n';

// src/app/components/watchlist/watchlist.ts
var WatchlistComponent = class WatchlistComponent2 {
  _chartService;
  _snackbar;
  router;
  _settingsService;
  watchlist = [];
  // Monitoring filter state
  selectedMonitoringFilter = "ACTIVEMONITORING";
  btcDivItemsFiltered = [];
  otherItemsFiltered = [];
  constructor(_chartService, _snackbar, router, _settingsService) {
    this._chartService = _chartService;
    this._snackbar = _snackbar;
    this.router = router;
    this._settingsService = _settingsService;
  }
  get btcDivItems() {
    return this.watchlist?.filter((i) => i.Status === "BTC-DIV") ?? [];
  }
  get otherItems() {
    return this.watchlist?.filter((i) => i.Status !== "BTC-DIV") ?? [];
  }
  applyMonitoringFilter() {
    this.computeFiltered();
  }
  ngOnInit() {
    this._chartService.getWatchlist().subscribe((data) => {
      this.watchlist = data;
      console.log("watchlist fetched:", this.watchlist);
      this.computeFiltered();
    });
  }
  goToChart(symbol, timeframe) {
    if (!symbol)
      return;
    this._chartService.getSymbols().subscribe((symbols) => {
      if (symbols) {
        const symModel = symbols.find((s) => s.SymbolName == symbol);
        this._settingsService.dispatchAppAction(SettingsActions.setSelectedSymbol({ symbol: symModel }));
        const cleanedTimeframe = (timeframe || "").trim();
        const cleanedSymbol = symbol.trim();
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
  refresh() {
    this._chartService.getWatchlist().subscribe((data) => {
      this.watchlist = data;
      console.log("watchlist refreshed:", this.watchlist);
      this._snackbar.open("watchlist refreshed", "Close", { duration: 2e3 });
      this.computeFiltered();
    });
  }
  back() {
    window.history.back();
  }
  computeFiltered() {
    const filter = this.selectedMonitoringFilter;
    const sourceBtc = this.btcDivItems;
    let sourceOther = this.otherItems;
    if (filter === "ACTIVEMONITORING") {
      sourceOther = sourceOther.filter((i) => (i.MonitoringStatus || "").toUpperCase() === "ACTIVEMONITORING");
    } else if (filter === "NO MONITORING") {
      sourceOther = sourceOther.filter((i) => !i.MonitoringStatus || i.MonitoringStatus.toUpperCase() === "NO MONITORING");
    }
    this.btcDivItemsFiltered = sourceBtc;
    this.otherItemsFiltered = sourceOther;
  }
  static ctorParameters = () => [
    { type: ChartService },
    { type: MatSnackBar },
    { type: Router },
    { type: SettingsService }
  ];
};
WatchlistComponent = __decorate([
  Component({
    selector: "app-watchlist",
    imports: [
      CommonModule,
      MatCardModule,
      MatButton,
      MatChipsModule,
      MatIconModule,
      MatFormFieldModule,
      MatSelectModule
    ],
    template: watchlist_default,
    styles: [watchlist_default2]
  })
], WatchlistComponent);
export {
  WatchlistComponent
};
//# sourceMappingURL=watchlist-WKHWVDFI.js.map
