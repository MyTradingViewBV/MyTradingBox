import {
  ChartService,
  FooterComponent,
  FormsModule,
  SettingsActions,
  SettingsService,
  environment
} from "./chunk-GUCC4LEO.js";
import {
  CoinInfoComponent
} from "./chunk-XBQATYYR.js";
import {
  CommonModule,
  HttpClient,
  Location,
  Router,
  isPlatformBrowser
} from "./chunk-UXLVID43.js";
import {
  ApplicationRef,
  BehaviorSubject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ConnectableObservable,
  DOCUMENT,
  DestroyRef,
  Directive,
  ElementRef,
  EventEmitter,
  FactoryTarget,
  Inject,
  Injectable,
  InjectionToken,
  Injector,
  Input,
  IterableDiffers,
  NgModule,
  NgZone,
  Observable,
  Optional,
  Output,
  PLATFORM_ID,
  Renderer2,
  RendererFactory2,
  Subject,
  Subscription,
  TemplateRef,
  ViewChild,
  ViewContainerRef,
  ViewEncapsulation,
  __decorate,
  __spreadProps,
  __spreadValues,
  afterNextRender,
  animationFrameScheduler,
  asapScheduler,
  auditTime,
  booleanAttribute,
  combineLatest,
  computed,
  core_exports,
  debounceTime,
  distinctUntilChanged,
  effect,
  filter,
  forwardRef,
  inject,
  isObservable,
  map,
  of,
  pairwise,
  shareReplay,
  signal,
  startWith,
  switchMap,
  take,
  takeUntil,
  untracked,
  ɵɵngDeclareClassMetadata,
  ɵɵngDeclareComponent,
  ɵɵngDeclareDirective,
  ɵɵngDeclareFactory,
  ɵɵngDeclareInjectable,
  ɵɵngDeclareInjector,
  ɵɵngDeclareNgModule
} from "./chunk-YQZJSQAI.js";

// angular:jit:template:src\app\components\watchlist\watchlist.html
var watchlist_default = `<div class="watchlist-root">\r
  <!-- Top bar -->\r
  <div class="wl-header">\r
    <h2 class="wl-title">Watchlist</h2>\r
    <button type="button" class="wl-btn" (click)="back()" aria-label="Back">\r
      <span class="icon">\u21A9</span>\r
    </button>\r
    <button type="button" class="wl-btn" (click)="refresh()" aria-label="Refresh">\r
      <span class="icon">\u27F3</span>\r
    </button>\r
  </div>\r
\r
  <!-- Search -->\r
  <div class="wl-search">\r
    <input\r
      type="text"\r
      placeholder="Zoek symbol..."\r
      [(ngModel)]="searchQuery"\r
      (input)="onSearchInput()"\r
      (focus)="onSearchFocus()"\r
      (click)="onSearchFocus()"\r
      (blur)="onSearchBlur()"\r
      />\r
      @if (searchQuery) {\r
        <button type="button" class="wl-icon-btn" (click)="clearSearch()">\u2715</button>\r
      }\r
    </div>\r
\r
    <!-- Search Results: explicit actions only (no row click) -->\r
    @if ((mergedSearchResults$ | async)?.length) {\r
      <div class="wl-section">\r
        <div class="wl-section-header alt">\r
          <h3>Search Results</h3>\r
          <span class="badge">{{ (mergedSearchResults$ | async)?.length }}</span>\r
        </div>\r
        <div class="wl-card-list">\r
          <div class="wl-list">\r
            @for (vm of (mergedSearchResults$ | async); track vm) {\r
              <div class="wl-card" [class.is-user]="vm.isUserSymbol">\r
                <div class="gradient-hover"></div>\r
                <div class="shimmer-mask"></div>\r
                <div class="wl-card-inner">\r
                  <div class="wl-left">\r
                    <div class="pair-block">\r
                      <div class="pair">{{ vm.name }}</div>\r
                    </div>\r
                  </div>\r
                  <div class="wl-right">\r
                    <div class="chips" style="display: flex; gap: 8px; align-items: center;">\r
                      <button type="button" class="chip" (click)="goToChart(vm.name, '1d')">Open Chart</button>\r
                      <button type="button" class="chip" (click)="onCoinInfoClick($event, vm.name)">Info</button>\r
                      @if (!vm.isUserSymbol) {\r
                        <button type="button" class="chip" (click)="addSymbolByVm(vm)">Add</button>\r
                      }\r
                      @if (vm.isUserSymbol) {\r
                        <button type="button" class="chip" (click)="deleteByVm(vm)">Delete</button>\r
                      }\r
                    </div>\r
                  </div>\r
                </div>\r
              </div>\r
            }\r
          </div>\r
        </div>\r
      </div>\r
    }\r
\r
\r
    <div class="wl-content component-wrapper" style="position: relative;">\r
      @if (loading) {\r
        <div class="mtb-overlay"><span class="mtb-spinner large"></span></div>\r
      }\r
      @if (loading) {\r
        <div class="wl-loading" style="visibility: hidden;">Loading symbols\u2026</div>\r
      }\r
      @if (!loading && errorMsg) {\r
        <div class="wl-error">{{ errorMsg }}</div>\r
      }\r
\r
      <!-- Matrix View -->\r
      @if (!loading) {\r
        <div class="wl-section">\r
          <div class="wl-section-header alt">\r
            <h3>Matrix</h3>\r
          </div>\r
          <app-watchlist-matrix></app-watchlist-matrix>\r
        </div>\r
      }\r
\r
      <!-- User Symbols (Watchlist) -->\r
      @if (!loading) {\r
        <div class="wl-section">\r
          <div class="wl-section-header alt">\r
            <h3>My Symbols</h3>\r
            <span class="badge">{{ userSymbols.length }}</span>\r
          </div>\r
          <div class="wl-card-list">\r
            <div class="wl-list">\r
              @for (us of userSymbols; track trackByUserSymbol($index, us)) {\r
                <div class="wl-card">\r
                  <div class="gradient-hover"></div>\r
                  <div class="shimmer-mask"></div>\r
                  <div class="wl-card-inner">\r
                    <div class="wl-left">\r
                      <div class="pair-block">\r
                        <div class="pair">{{ us.SymbolName || us.SymbolId }}</div>\r
                      </div>\r
                    </div>\r
                    <div class="wl-right">\r
                      <div class="chips" style="display: flex; gap: 8px; align-items: center;">\r
                        <button type="button" class="chip" (click)="goToChart(us.SymbolName || '', '1d')">Open Chart</button>\r
                        <button type="button" class="chip" (click)="onCoinInfoClick($event, us.SymbolName || '')">Info</button>\r
                        <button type="button" class="chip" (click)="deleteUserSymbol(us.Id)">Delete</button>\r
                      </div>\r
                    </div>\r
                  </div>\r
                </div>\r
              }\r
            </div>\r
          </div>\r
        </div>\r
      }\r
    </div>\r
\r
    <!-- Coin Info Side Panel (non-navigating) -->\r
    @if (infoOpen) {\r
      <div class="coin-info-panel">\r
        <div class="coin-info-panel-header">\r
          <h4 class="coin-info-title">Info: {{ infoSymbol }}</h4>\r
          <button type="button" class="wl-icon-btn" (click)="closeInfo()">\u2715</button>\r
        </div>\r
        <app-coin-info [symbolInput]="infoSymbol" [embedded]="true"></app-coin-info>\r
      </div>\r
    }\r
  </div>\r
  <app-footer></app-footer>`;

// angular:jit:style:src\app\components\watchlist\watchlist.scss
var watchlist_default2 = '/* src/app/components/watchlist/watchlist.scss */\n.watchlist-container {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n  background: var(--sys-surface-container-high, #181a20);\n  color: var(--sys-on-surface, #ddd);\n  padding-bottom: calc(var(--footer-height));\n}\n.scrollable-list {\n  flex: 1;\n  overflow-y: auto;\n  padding: 8px 12px 12px;\n  box-sizing: border-box;\n  scrollbar-width: thin;\n}\n.wl-viewport {\n  height: 60vh;\n  width: 100%;\n}\n.wl-loading,\n.wl-error {\n  padding: 12px;\n  font-size: 13px;\n}\n.wl-error {\n  color: #e57373;\n}\n.group-label {\n  margin: 18px 0 6px;\n  font-weight: 600;\n  font-size: 13px;\n  letter-spacing: 0.5px;\n  color: var(--sys-on-surface-variant, #8a8f99);\n  text-transform: uppercase;\n  position: sticky;\n  top: 0;\n  -webkit-backdrop-filter: blur(4px);\n  backdrop-filter: blur(4px);\n  padding: 4px 0;\n}\n.watchlist-row-card {\n  display: flex;\n  flex-direction: column;\n  padding: 10px 14px 8px;\n  margin: 0 0 10px;\n  background: var(--sys-surface-container, #20242b);\n  border: 1px solid #262a30;\n  border-radius: 12px;\n  cursor: pointer;\n  position: relative;\n  transition:\n    background 0.2s ease,\n    transform 0.16s ease,\n    box-shadow 0.16s ease;\n  overflow: hidden;\n}\n.watchlist-row-card::before {\n  content: "";\n  position: absolute;\n  inset: 0;\n  background:\n    linear-gradient(\n      90deg,\n      rgba(255, 255, 255, 0.04),\n      rgba(255, 255, 255, 0));\n  opacity: 0;\n  transition: opacity 0.25s ease;\n  pointer-events: none;\n}\n.watchlist-row-card:hover {\n  background: var(--sys-surface-container-high, #181a20);\n  transform: translateY(-2px);\n  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);\n}\n.watchlist-row-card:hover::before {\n  opacity: 1;\n}\n.watchlist-row-card:active {\n  transform: translateY(0);\n}\n.row-top {\n  display: flex;\n  justify-content: space-between;\n  font-weight: 600;\n  font-size: 13px;\n  color: var(--sys-on-surface, #eee);\n}\n.row-top .timeframe {\n  font-weight: 500;\n  color: #8a8f99;\n}\n.row-bottom {\n  margin-top: 4px;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n}\n.row-bottom .chip-list {\n  display: flex;\n  gap: 4px;\n}\n.row-bottom .chip-list mat-chip {\n  height: 22px;\n  font-size: 12px;\n  padding: 0 6px;\n}\n.row-bottom .chip-list .bear,\n.row-bottom .chip-list .short {\n  background: #e57373;\n  color: white;\n}\n.row-bottom .chip-list .bull,\n.row-bottom .chip-list .long {\n  background: #81c784;\n  color: white;\n}\n.row-bottom .chip-list .divergence {\n  background: #64b5f6;\n  color: white;\n}\n.row-bottom .chip-list .none {\n  background: #bdbdbd;\n  color: white;\n}\n.row-bottom .created {\n  font-size: 11px;\n  color: #8a8f99;\n  margin-left: auto;\n  font-variant-numeric: tabular-nums;\n}\n.header-actions {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  margin: 8px 8px 0;\n  height: 54px;\n  position: sticky;\n  top: 0;\n  z-index: 10;\n  background: var(--sys-surface-container-high, #181a20);\n  border-bottom: 1px solid var(--sys-outline, #222);\n  -webkit-backdrop-filter: blur(4px);\n  backdrop-filter: blur(4px);\n  padding: 8px 4px;\n}\n.header-actions button[mat-button] {\n  height: 34px;\n  line-height: 34px;\n  font-size: 13px;\n  font-weight: 500;\n  color: var(--sys-on-surface, #eee);\n  background: rgba(255, 255, 255, 0.04);\n  border: 1px solid #2a2d33;\n  border-radius: 8px;\n  padding: 0 14px;\n  transition:\n    background 0.2s ease,\n    transform 0.2s ease,\n    box-shadow 0.2s ease;\n  text-transform: capitalize;\n}\n.header-actions button[mat-button]:hover {\n  background: rgba(255, 255, 255, 0.08);\n  transform: translateY(-1px);\n}\n.header-actions button[mat-button]:active {\n  background: rgba(255, 255, 255, 0.12);\n  transform: translateY(0);\n}\n.header-actions .spacer {\n  flex: 1 1 auto;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense {\n  max-width: 230px;\n  height: 65px;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-form-field-flex {\n  min-height: 34px;\n  height: 34px;\n  padding: 0 10px !important;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-form-field-infix {\n  padding: 0 !important;\n  min-height: 34px !important;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-select-trigger {\n  height: 34px;\n  display: flex;\n  align-items: center;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-select-value,\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-select-placeholder {\n  font-size: 13px;\n}\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-form-field-outline-start,\n.header-actions .monitoring-select.mat-mdc-form-field.dense .mat-mdc-form-field-outline-end {\n  height: 34px;\n}\n.wl-header {\n  position: sticky;\n  top: 0;\n}\n.wl-header .wl-title {\n  position: absolute;\n  left: 50%;\n  transform: translateX(-50%);\n  margin: 0;\n  font-size: 18px;\n  font-weight: 600;\n  letter-spacing: 0.5px;\n  background:\n    linear-gradient(\n      90deg,\n      #ff8b2f,\n      #ffd643);\n  -webkit-background-clip: text;\n  color: transparent;\n}\n.chip-list mat-chip {\n  font-weight: 500;\n  letter-spacing: 0.3px;\n  border-radius: 6px !important;\n}\n.chip-list mat-chip.bear,\n.chip-list mat-chip.short {\n  background: #b04141;\n}\n.chip-list mat-chip.bull,\n.chip-list mat-chip.long {\n  background: #2e7d32;\n}\n.chip-list mat-chip.divergence {\n  background: #1565c0;\n}\n.chip-list mat-chip.none {\n  background: #616161;\n}\n@media (max-width: 600px) {\n  .watchlist-row-card {\n    padding: 8px 10px 6px;\n    border-radius: 10px;\n  }\n  .row-top {\n    font-size: 12px;\n  }\n  .header-actions {\n    height: 50px;\n  }\n  .group-label {\n    font-size: 12px;\n  }\n}\n.watchlist-root {\n  display: flex;\n  flex-direction: column;\n  height: 100%;\n}\n.wl-content {\n  flex: 1 1 auto;\n  overflow-y: auto;\n}\n.wl-card-list {\n  overflow: visible;\n}\n.wl-list {\n  display: block;\n}\n.wl-viewport {\n  height: auto;\n  overflow: visible;\n}\n.wl-card.is-user {\n  border: 1px solid #ffd643 !important;\n  box-shadow: 0 0 0 1px rgba(255, 214, 67, 0.2), 0 6px 18px rgba(0, 0, 0, 0.35);\n}\n.wl-card .chips .chip,\n.wl-icon-btn.chip,\nbutton.chip {\n  display: inline-block;\n  background: rgba(255, 255, 255, 0.06);\n  border: 1px solid #2a2d33;\n  color: #eee;\n  padding: 4px 10px;\n  font-size: 12px;\n  border-radius: 10px;\n  cursor: pointer;\n}\n.wl-card .chips .chip:hover,\nbutton.chip:hover {\n  background: rgba(255, 255, 255, 0.1);\n}\n.coin-info-panel {\n  position: fixed;\n  right: 0;\n  top: 0;\n  bottom: 0;\n  width: 360px;\n  background: var(--sys-surface, #0f1115);\n  color: var(--sys-on-surface, #eee);\n  box-shadow: -6px 0 18px rgba(0, 0, 0, 0.35);\n  border-left: 1px solid var(--sys-outline, #1f2329);\n  z-index: 1000;\n  padding: 12px;\n}\n.coin-info-panel-header {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  margin-bottom: 8px;\n}\n.coin-info-title {\n  margin: 0;\n  font-size: 16px;\n  font-weight: 600;\n  letter-spacing: 0.3px;\n  background:\n    linear-gradient(\n      90deg,\n      #ff8b2f,\n      #ffd643);\n  -webkit-background-clip: text;\n  color: transparent;\n}\n@media (max-width: 640px) {\n  .coin-info-panel {\n    width: 100%;\n  }\n}\n/*# sourceMappingURL=watchlist.css.map */\n';

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

// node_modules/@angular/cdk/fesm2022/element.mjs
function coerceNumberProperty(value, fallbackValue = 0) {
  if (_isNumberValue(value)) {
    return Number(value);
  }
  return arguments.length === 2 ? fallbackValue : 0;
}
function _isNumberValue(value) {
  return !isNaN(parseFloat(value)) && !isNaN(Number(value));
}
function coerceElement(elementOrRef) {
  return elementOrRef instanceof ElementRef ? elementOrRef.nativeElement : elementOrRef;
}

// node_modules/@angular/cdk/fesm2022/platform2.mjs
var hasV8BreakIterator;
try {
  hasV8BreakIterator = typeof Intl !== "undefined" && Intl.v8BreakIterator;
} catch (e) {
  hasV8BreakIterator = false;
}
var Platform = class _Platform {
  _platformId = inject(PLATFORM_ID);
  // We want to use the Angular platform check because if the Document is shimmed
  // without the navigator, the following checks will fail. This is preferred because
  // sometimes the Document may be shimmed without the user's knowledge or intention
  /** Whether the Angular application is being rendered in the browser. */
  isBrowser = this._platformId ? isPlatformBrowser(this._platformId) : typeof document === "object" && !!document;
  /** Whether the current browser is Microsoft Edge. */
  EDGE = this.isBrowser && /(edge)/i.test(navigator.userAgent);
  /** Whether the current rendering engine is Microsoft Trident. */
  TRIDENT = this.isBrowser && /(msie|trident)/i.test(navigator.userAgent);
  // EdgeHTML and Trident mock Blink specific things and need to be excluded from this check.
  /** Whether the current rendering engine is Blink. */
  BLINK = this.isBrowser && !!(window.chrome || hasV8BreakIterator) && typeof CSS !== "undefined" && !this.EDGE && !this.TRIDENT;
  // Webkit is part of the userAgent in EdgeHTML, Blink and Trident. Therefore we need to
  // ensure that Webkit runs standalone and is not used as another engine's base.
  /** Whether the current rendering engine is WebKit. */
  WEBKIT = this.isBrowser && /AppleWebKit/i.test(navigator.userAgent) && !this.BLINK && !this.EDGE && !this.TRIDENT;
  /** Whether the current platform is Apple iOS. */
  IOS = this.isBrowser && /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
  // It's difficult to detect the plain Gecko engine, because most of the browsers identify
  // them self as Gecko-like browsers and modify the userAgent's according to that.
  // Since we only cover one explicit Firefox case, we can simply check for Firefox
  // instead of having an unstable check for Gecko.
  /** Whether the current browser is Firefox. */
  FIREFOX = this.isBrowser && /(firefox|minefield)/i.test(navigator.userAgent);
  /** Whether the current platform is Android. */
  // Trident on mobile adds the android platform to the userAgent to trick detections.
  ANDROID = this.isBrowser && /android/i.test(navigator.userAgent) && !this.TRIDENT;
  // Safari browsers will include the Safari keyword in their userAgent. Some browsers may fake
  // this and just place the Safari keyword in the userAgent. To be more safe about Safari every
  // Safari browser should also use Webkit as its layout engine.
  /** Whether the current browser is Safari. */
  SAFARI = this.isBrowser && /safari/i.test(navigator.userAgent) && this.WEBKIT;
  constructor() {
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _Platform, deps: [], target: FactoryTarget.Injectable });
  static \u0275prov = \u0275\u0275ngDeclareInjectable({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _Platform, providedIn: "root" });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: Platform, decorators: [{
  type: Injectable,
  args: [{ providedIn: "root" }]
}], ctorParameters: () => [] });

// node_modules/@angular/cdk/fesm2022/directionality.mjs
var DIR_DOCUMENT = new InjectionToken("cdk-dir-doc", {
  providedIn: "root",
  factory: DIR_DOCUMENT_FACTORY
});
function DIR_DOCUMENT_FACTORY() {
  return inject(DOCUMENT);
}
var RTL_LOCALE_PATTERN = /^(ar|ckb|dv|he|iw|fa|nqo|ps|sd|ug|ur|yi|.*[-_](Adlm|Arab|Hebr|Nkoo|Rohg|Thaa))(?!.*[-_](Latn|Cyrl)($|-|_))($|-|_)/i;
function _resolveDirectionality(rawValue) {
  const value = rawValue?.toLowerCase() || "";
  if (value === "auto" && typeof navigator !== "undefined" && navigator?.language) {
    return RTL_LOCALE_PATTERN.test(navigator.language) ? "rtl" : "ltr";
  }
  return value === "rtl" ? "rtl" : "ltr";
}
var Directionality = class _Directionality {
  /** The current 'ltr' or 'rtl' value. */
  get value() {
    return this.valueSignal();
  }
  /**
   * The current 'ltr' or 'rtl' value.
   */
  valueSignal = signal("ltr", ...ngDevMode ? [{ debugName: "valueSignal" }] : []);
  /** Stream that emits whenever the 'ltr' / 'rtl' state changes. */
  change = new EventEmitter();
  constructor() {
    const _document = inject(DIR_DOCUMENT, { optional: true });
    if (_document) {
      const bodyDir = _document.body ? _document.body.dir : null;
      const htmlDir = _document.documentElement ? _document.documentElement.dir : null;
      this.valueSignal.set(_resolveDirectionality(bodyDir || htmlDir || "ltr"));
    }
  }
  ngOnDestroy() {
    this.change.complete();
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _Directionality, deps: [], target: FactoryTarget.Injectable });
  static \u0275prov = \u0275\u0275ngDeclareInjectable({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _Directionality, providedIn: "root" });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: Directionality, decorators: [{
  type: Injectable,
  args: [{ providedIn: "root" }]
}], ctorParameters: () => [] });

// node_modules/@angular/cdk/fesm2022/scrolling2.mjs
var RtlScrollAxisType;
(function(RtlScrollAxisType2) {
  RtlScrollAxisType2[RtlScrollAxisType2["NORMAL"] = 0] = "NORMAL";
  RtlScrollAxisType2[RtlScrollAxisType2["NEGATED"] = 1] = "NEGATED";
  RtlScrollAxisType2[RtlScrollAxisType2["INVERTED"] = 2] = "INVERTED";
})(RtlScrollAxisType || (RtlScrollAxisType = {}));
var rtlScrollAxisType;
var scrollBehaviorSupported;
function supportsScrollBehavior() {
  if (scrollBehaviorSupported == null) {
    if (typeof document !== "object" || !document || typeof Element !== "function" || !Element) {
      scrollBehaviorSupported = false;
      return scrollBehaviorSupported;
    }
    if (document.documentElement?.style && "scrollBehavior" in document.documentElement.style) {
      scrollBehaviorSupported = true;
    } else {
      const scrollToFunction = Element.prototype.scrollTo;
      if (scrollToFunction) {
        scrollBehaviorSupported = !/\{\s*\[native code\]\s*\}/.test(scrollToFunction.toString());
      } else {
        scrollBehaviorSupported = false;
      }
    }
  }
  return scrollBehaviorSupported;
}
function getRtlScrollAxisType() {
  if (typeof document !== "object" || !document) {
    return RtlScrollAxisType.NORMAL;
  }
  if (rtlScrollAxisType == null) {
    const scrollContainer = document.createElement("div");
    const containerStyle = scrollContainer.style;
    scrollContainer.dir = "rtl";
    containerStyle.width = "1px";
    containerStyle.overflow = "auto";
    containerStyle.visibility = "hidden";
    containerStyle.pointerEvents = "none";
    containerStyle.position = "absolute";
    const content = document.createElement("div");
    const contentStyle = content.style;
    contentStyle.width = "2px";
    contentStyle.height = "1px";
    scrollContainer.appendChild(content);
    document.body.appendChild(scrollContainer);
    rtlScrollAxisType = RtlScrollAxisType.NORMAL;
    if (scrollContainer.scrollLeft === 0) {
      scrollContainer.scrollLeft = 1;
      rtlScrollAxisType = scrollContainer.scrollLeft === 0 ? RtlScrollAxisType.NEGATED : RtlScrollAxisType.INVERTED;
    }
    scrollContainer.remove();
  }
  return rtlScrollAxisType;
}

// node_modules/@angular/cdk/fesm2022/bidi.mjs
var Dir = class _Dir {
  /** Whether the `value` has been set to its initial value. */
  _isInitialized = false;
  /** Direction as passed in by the consumer. */
  _rawDir;
  /** Event emitted when the direction changes. */
  change = new EventEmitter();
  /** @docs-private */
  get dir() {
    return this.valueSignal();
  }
  set dir(value) {
    const previousValue = this.valueSignal();
    this.valueSignal.set(_resolveDirectionality(value));
    this._rawDir = value;
    if (previousValue !== this.valueSignal() && this._isInitialized) {
      this.change.emit(this.valueSignal());
    }
  }
  /** Current layout direction of the element. */
  get value() {
    return this.dir;
  }
  valueSignal = signal("ltr", ...ngDevMode ? [{ debugName: "valueSignal" }] : []);
  /** Initialize once default value has been set. */
  ngAfterContentInit() {
    this._isInitialized = true;
  }
  ngOnDestroy() {
    this.change.complete();
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _Dir, deps: [], target: FactoryTarget.Directive });
  static \u0275dir = \u0275\u0275ngDeclareDirective({ minVersion: "14.0.0", version: "20.2.0-next.2", type: _Dir, isStandalone: true, selector: "[dir]", inputs: { dir: "dir" }, outputs: { change: "dirChange" }, host: { properties: { "attr.dir": "_rawDir" } }, providers: [{ provide: Directionality, useExisting: _Dir }], exportAs: ["dir"], ngImport: core_exports });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: Dir, decorators: [{
  type: Directive,
  args: [{
    selector: "[dir]",
    providers: [{ provide: Directionality, useExisting: Dir }],
    host: { "[attr.dir]": "_rawDir" },
    exportAs: "dir"
  }]
}], propDecorators: { change: [{
  type: Output,
  args: ["dirChange"]
}], dir: [{
  type: Input
}] } });
var BidiModule = class _BidiModule {
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _BidiModule, deps: [], target: FactoryTarget.NgModule });
  static \u0275mod = \u0275\u0275ngDeclareNgModule({ minVersion: "14.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _BidiModule, imports: [Dir], exports: [Dir] });
  static \u0275inj = \u0275\u0275ngDeclareInjector({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _BidiModule });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: BidiModule, decorators: [{
  type: NgModule,
  args: [{
    imports: [Dir],
    exports: [Dir]
  }]
}] });

// node_modules/@angular/cdk/fesm2022/data-source.mjs
var DataSource = class {
};
function isDataSource(value) {
  return value && typeof value.connect === "function" && !(value instanceof ConnectableObservable);
}

// node_modules/@angular/cdk/fesm2022/recycle-view-repeater-strategy.mjs
var ArrayDataSource = class extends DataSource {
  _data;
  constructor(_data) {
    super();
    this._data = _data;
  }
  connect() {
    return isObservable(this._data) ? this._data : of(this._data);
  }
  disconnect() {
  }
};
var _ViewRepeaterOperation;
(function(_ViewRepeaterOperation2) {
  _ViewRepeaterOperation2[_ViewRepeaterOperation2["REPLACED"] = 0] = "REPLACED";
  _ViewRepeaterOperation2[_ViewRepeaterOperation2["INSERTED"] = 1] = "INSERTED";
  _ViewRepeaterOperation2[_ViewRepeaterOperation2["MOVED"] = 2] = "MOVED";
  _ViewRepeaterOperation2[_ViewRepeaterOperation2["REMOVED"] = 3] = "REMOVED";
})(_ViewRepeaterOperation || (_ViewRepeaterOperation = {}));
var _VIEW_REPEATER_STRATEGY = new InjectionToken("_ViewRepeater");
var _RecycleViewRepeaterStrategy = class {
  /**
   * The size of the cache used to store unused views.
   * Setting the cache size to `0` will disable caching. Defaults to 20 views.
   */
  viewCacheSize = 20;
  /**
   * View cache that stores embedded view instances that have been previously stamped out,
   * but don't are not currently rendered. The view repeater will reuse these views rather than
   * creating brand new ones.
   *
   * TODO(michaeljamesparsons) Investigate whether using a linked list would improve performance.
   */
  _viewCache = [];
  /** Apply changes to the DOM. */
  applyChanges(changes, viewContainerRef, itemContextFactory, itemValueResolver, itemViewChanged) {
    changes.forEachOperation((record, adjustedPreviousIndex, currentIndex) => {
      let view;
      let operation;
      if (record.previousIndex == null) {
        const viewArgsFactory = () => itemContextFactory(record, adjustedPreviousIndex, currentIndex);
        view = this._insertView(viewArgsFactory, currentIndex, viewContainerRef, itemValueResolver(record));
        operation = view ? _ViewRepeaterOperation.INSERTED : _ViewRepeaterOperation.REPLACED;
      } else if (currentIndex == null) {
        this._detachAndCacheView(adjustedPreviousIndex, viewContainerRef);
        operation = _ViewRepeaterOperation.REMOVED;
      } else {
        view = this._moveView(adjustedPreviousIndex, currentIndex, viewContainerRef, itemValueResolver(record));
        operation = _ViewRepeaterOperation.MOVED;
      }
      if (itemViewChanged) {
        itemViewChanged({
          context: view?.context,
          operation,
          record
        });
      }
    });
  }
  detach() {
    for (const view of this._viewCache) {
      view.destroy();
    }
    this._viewCache = [];
  }
  /**
   * Inserts a view for a new item, either from the cache or by creating a new
   * one. Returns `undefined` if the item was inserted into a cached view.
   */
  _insertView(viewArgsFactory, currentIndex, viewContainerRef, value) {
    const cachedView = this._insertViewFromCache(currentIndex, viewContainerRef);
    if (cachedView) {
      cachedView.context.$implicit = value;
      return void 0;
    }
    const viewArgs = viewArgsFactory();
    return viewContainerRef.createEmbeddedView(viewArgs.templateRef, viewArgs.context, viewArgs.index);
  }
  /** Detaches the view at the given index and inserts into the view cache. */
  _detachAndCacheView(index, viewContainerRef) {
    const detachedView = viewContainerRef.detach(index);
    this._maybeCacheView(detachedView, viewContainerRef);
  }
  /** Moves view at the previous index to the current index. */
  _moveView(adjustedPreviousIndex, currentIndex, viewContainerRef, value) {
    const view = viewContainerRef.get(adjustedPreviousIndex);
    viewContainerRef.move(view, currentIndex);
    view.context.$implicit = value;
    return view;
  }
  /**
   * Cache the given detached view. If the cache is full, the view will be
   * destroyed.
   */
  _maybeCacheView(view, viewContainerRef) {
    if (this._viewCache.length < this.viewCacheSize) {
      this._viewCache.push(view);
    } else {
      const index = viewContainerRef.indexOf(view);
      if (index === -1) {
        view.destroy();
      } else {
        viewContainerRef.remove(index);
      }
    }
  }
  /** Inserts a recycled view from the cache at the given index. */
  _insertViewFromCache(index, viewContainerRef) {
    const cachedView = this._viewCache.pop();
    if (cachedView) {
      viewContainerRef.insert(cachedView, index);
    }
    return cachedView || null;
  }
};

// node_modules/@angular/cdk/fesm2022/scrolling.mjs
var VIRTUAL_SCROLL_STRATEGY = new InjectionToken("VIRTUAL_SCROLL_STRATEGY");
var FixedSizeVirtualScrollStrategy = class {
  _scrolledIndexChange = new Subject();
  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  scrolledIndexChange = this._scrolledIndexChange.pipe(distinctUntilChanged());
  /** The attached viewport. */
  _viewport = null;
  /** The size of the items in the virtually scrolling list. */
  _itemSize;
  /** The minimum amount of buffer rendered beyond the viewport (in pixels). */
  _minBufferPx;
  /** The number of buffer items to render beyond the edge of the viewport (in pixels). */
  _maxBufferPx;
  /**
   * @param itemSize The size of the items in the virtually scrolling list.
   * @param minBufferPx The minimum amount of buffer (in pixels) before needing to render more
   * @param maxBufferPx The amount of buffer (in pixels) to render when rendering more.
   */
  constructor(itemSize, minBufferPx, maxBufferPx) {
    this._itemSize = itemSize;
    this._minBufferPx = minBufferPx;
    this._maxBufferPx = maxBufferPx;
  }
  /**
   * Attaches this scroll strategy to a viewport.
   * @param viewport The viewport to attach this strategy to.
   */
  attach(viewport) {
    this._viewport = viewport;
    this._updateTotalContentSize();
    this._updateRenderedRange();
  }
  /** Detaches this scroll strategy from the currently attached viewport. */
  detach() {
    this._scrolledIndexChange.complete();
    this._viewport = null;
  }
  /**
   * Update the item size and buffer size.
   * @param itemSize The size of the items in the virtually scrolling list.
   * @param minBufferPx The minimum amount of buffer (in pixels) before needing to render more
   * @param maxBufferPx The amount of buffer (in pixels) to render when rendering more.
   */
  updateItemAndBufferSize(itemSize, minBufferPx, maxBufferPx) {
    if (maxBufferPx < minBufferPx && (typeof ngDevMode === "undefined" || ngDevMode)) {
      throw Error("CDK virtual scroll: maxBufferPx must be greater than or equal to minBufferPx");
    }
    this._itemSize = itemSize;
    this._minBufferPx = minBufferPx;
    this._maxBufferPx = maxBufferPx;
    this._updateTotalContentSize();
    this._updateRenderedRange();
  }
  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  onContentScrolled() {
    this._updateRenderedRange();
  }
  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  onDataLengthChanged() {
    this._updateTotalContentSize();
    this._updateRenderedRange();
  }
  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  onContentRendered() {
  }
  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  onRenderedOffsetChanged() {
  }
  /**
   * Scroll to the offset for the given index.
   * @param index The index of the element to scroll to.
   * @param behavior The ScrollBehavior to use when scrolling.
   */
  scrollToIndex(index, behavior) {
    if (this._viewport) {
      this._viewport.scrollToOffset(index * this._itemSize, behavior);
    }
  }
  /** Update the viewport's total content size. */
  _updateTotalContentSize() {
    if (!this._viewport) {
      return;
    }
    this._viewport.setTotalContentSize(this._viewport.getDataLength() * this._itemSize);
  }
  /** Update the viewport's rendered range. */
  _updateRenderedRange() {
    if (!this._viewport) {
      return;
    }
    const renderedRange = this._viewport.getRenderedRange();
    const newRange = { start: renderedRange.start, end: renderedRange.end };
    const viewportSize = this._viewport.getViewportSize();
    const dataLength = this._viewport.getDataLength();
    let scrollOffset = this._viewport.measureScrollOffset();
    let firstVisibleIndex = this._itemSize > 0 ? scrollOffset / this._itemSize : 0;
    if (newRange.end > dataLength) {
      const maxVisibleItems = Math.ceil(viewportSize / this._itemSize);
      const newVisibleIndex = Math.max(0, Math.min(firstVisibleIndex, dataLength - maxVisibleItems));
      if (firstVisibleIndex != newVisibleIndex) {
        firstVisibleIndex = newVisibleIndex;
        scrollOffset = newVisibleIndex * this._itemSize;
        newRange.start = Math.floor(firstVisibleIndex);
      }
      newRange.end = Math.max(0, Math.min(dataLength, newRange.start + maxVisibleItems));
    }
    const startBuffer = scrollOffset - newRange.start * this._itemSize;
    if (startBuffer < this._minBufferPx && newRange.start != 0) {
      const expandStart = Math.ceil((this._maxBufferPx - startBuffer) / this._itemSize);
      newRange.start = Math.max(0, newRange.start - expandStart);
      newRange.end = Math.min(dataLength, Math.ceil(firstVisibleIndex + (viewportSize + this._minBufferPx) / this._itemSize));
    } else {
      const endBuffer = newRange.end * this._itemSize - (scrollOffset + viewportSize);
      if (endBuffer < this._minBufferPx && newRange.end != dataLength) {
        const expandEnd = Math.ceil((this._maxBufferPx - endBuffer) / this._itemSize);
        if (expandEnd > 0) {
          newRange.end = Math.min(dataLength, newRange.end + expandEnd);
          newRange.start = Math.max(0, Math.floor(firstVisibleIndex - this._minBufferPx / this._itemSize));
        }
      }
    }
    this._viewport.setRenderedRange(newRange);
    this._viewport.setRenderedContentOffset(Math.round(this._itemSize * newRange.start));
    this._scrolledIndexChange.next(Math.floor(firstVisibleIndex));
  }
};
function _fixedSizeVirtualScrollStrategyFactory(fixedSizeDir) {
  return fixedSizeDir._scrollStrategy;
}
var CdkFixedSizeVirtualScroll = class _CdkFixedSizeVirtualScroll {
  /** The size of the items in the list (in pixels). */
  get itemSize() {
    return this._itemSize;
  }
  set itemSize(value) {
    this._itemSize = coerceNumberProperty(value);
  }
  _itemSize = 20;
  /**
   * The minimum amount of buffer rendered beyond the viewport (in pixels).
   * If the amount of buffer dips below this number, more items will be rendered. Defaults to 100px.
   */
  get minBufferPx() {
    return this._minBufferPx;
  }
  set minBufferPx(value) {
    this._minBufferPx = coerceNumberProperty(value);
  }
  _minBufferPx = 100;
  /**
   * The number of pixels worth of buffer to render for when rendering new items. Defaults to 200px.
   */
  get maxBufferPx() {
    return this._maxBufferPx;
  }
  set maxBufferPx(value) {
    this._maxBufferPx = coerceNumberProperty(value);
  }
  _maxBufferPx = 200;
  /** The scroll strategy used by this directive. */
  _scrollStrategy = new FixedSizeVirtualScrollStrategy(this.itemSize, this.minBufferPx, this.maxBufferPx);
  ngOnChanges() {
    this._scrollStrategy.updateItemAndBufferSize(this.itemSize, this.minBufferPx, this.maxBufferPx);
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkFixedSizeVirtualScroll, deps: [], target: FactoryTarget.Directive });
  static \u0275dir = \u0275\u0275ngDeclareDirective({ minVersion: "14.0.0", version: "20.2.0-next.2", type: _CdkFixedSizeVirtualScroll, isStandalone: true, selector: "cdk-virtual-scroll-viewport[itemSize]", inputs: { itemSize: "itemSize", minBufferPx: "minBufferPx", maxBufferPx: "maxBufferPx" }, providers: [
    {
      provide: VIRTUAL_SCROLL_STRATEGY,
      useFactory: _fixedSizeVirtualScrollStrategyFactory,
      deps: [forwardRef(() => _CdkFixedSizeVirtualScroll)]
    }
  ], usesOnChanges: true, ngImport: core_exports });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: CdkFixedSizeVirtualScroll, decorators: [{
  type: Directive,
  args: [{
    selector: "cdk-virtual-scroll-viewport[itemSize]",
    providers: [
      {
        provide: VIRTUAL_SCROLL_STRATEGY,
        useFactory: _fixedSizeVirtualScrollStrategyFactory,
        deps: [forwardRef(() => CdkFixedSizeVirtualScroll)]
      }
    ]
  }]
}], propDecorators: { itemSize: [{
  type: Input
}], minBufferPx: [{
  type: Input
}], maxBufferPx: [{
  type: Input
}] } });
var DEFAULT_SCROLL_TIME = 20;
var ScrollDispatcher = class _ScrollDispatcher {
  _ngZone = inject(NgZone);
  _platform = inject(Platform);
  _renderer = inject(RendererFactory2).createRenderer(null, null);
  _cleanupGlobalListener;
  constructor() {
  }
  /** Subject for notifying that a registered scrollable reference element has been scrolled. */
  _scrolled = new Subject();
  /** Keeps track of the amount of subscriptions to `scrolled`. Used for cleaning up afterwards. */
  _scrolledCount = 0;
  /**
   * Map of all the scrollable references that are registered with the service and their
   * scroll event subscriptions.
   */
  scrollContainers = /* @__PURE__ */ new Map();
  /**
   * Registers a scrollable instance with the service and listens for its scrolled events. When the
   * scrollable is scrolled, the service emits the event to its scrolled observable.
   * @param scrollable Scrollable instance to be registered.
   */
  register(scrollable) {
    if (!this.scrollContainers.has(scrollable)) {
      this.scrollContainers.set(scrollable, scrollable.elementScrolled().subscribe(() => this._scrolled.next(scrollable)));
    }
  }
  /**
   * De-registers a Scrollable reference and unsubscribes from its scroll event observable.
   * @param scrollable Scrollable instance to be deregistered.
   */
  deregister(scrollable) {
    const scrollableReference = this.scrollContainers.get(scrollable);
    if (scrollableReference) {
      scrollableReference.unsubscribe();
      this.scrollContainers.delete(scrollable);
    }
  }
  /**
   * Returns an observable that emits an event whenever any of the registered Scrollable
   * references (or window, document, or body) fire a scrolled event. Can provide a time in ms
   * to override the default "throttle" time.
   *
   * **Note:** in order to avoid hitting change detection for every scroll event,
   * all of the events emitted from this stream will be run outside the Angular zone.
   * If you need to update any data bindings as a result of a scroll event, you have
   * to run the callback using `NgZone.run`.
   */
  scrolled(auditTimeInMs = DEFAULT_SCROLL_TIME) {
    if (!this._platform.isBrowser) {
      return of();
    }
    return new Observable((observer) => {
      if (!this._cleanupGlobalListener) {
        this._cleanupGlobalListener = this._ngZone.runOutsideAngular(() => this._renderer.listen("document", "scroll", () => this._scrolled.next()));
      }
      const subscription = auditTimeInMs > 0 ? this._scrolled.pipe(auditTime(auditTimeInMs)).subscribe(observer) : this._scrolled.subscribe(observer);
      this._scrolledCount++;
      return () => {
        subscription.unsubscribe();
        this._scrolledCount--;
        if (!this._scrolledCount) {
          this._cleanupGlobalListener?.();
          this._cleanupGlobalListener = void 0;
        }
      };
    });
  }
  ngOnDestroy() {
    this._cleanupGlobalListener?.();
    this._cleanupGlobalListener = void 0;
    this.scrollContainers.forEach((_, container) => this.deregister(container));
    this._scrolled.complete();
  }
  /**
   * Returns an observable that emits whenever any of the
   * scrollable ancestors of an element are scrolled.
   * @param elementOrElementRef Element whose ancestors to listen for.
   * @param auditTimeInMs Time to throttle the scroll events.
   */
  ancestorScrolled(elementOrElementRef, auditTimeInMs) {
    const ancestors = this.getAncestorScrollContainers(elementOrElementRef);
    return this.scrolled(auditTimeInMs).pipe(filter((target) => !target || ancestors.indexOf(target) > -1));
  }
  /** Returns all registered Scrollables that contain the provided element. */
  getAncestorScrollContainers(elementOrElementRef) {
    const scrollingContainers = [];
    this.scrollContainers.forEach((_subscription, scrollable) => {
      if (this._scrollableContainsElement(scrollable, elementOrElementRef)) {
        scrollingContainers.push(scrollable);
      }
    });
    return scrollingContainers;
  }
  /** Returns true if the element is contained within the provided Scrollable. */
  _scrollableContainsElement(scrollable, elementOrElementRef) {
    let element = coerceElement(elementOrElementRef);
    let scrollableElement = scrollable.getElementRef().nativeElement;
    do {
      if (element == scrollableElement) {
        return true;
      }
    } while (element = element.parentElement);
    return false;
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _ScrollDispatcher, deps: [], target: FactoryTarget.Injectable });
  static \u0275prov = \u0275\u0275ngDeclareInjectable({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _ScrollDispatcher, providedIn: "root" });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: ScrollDispatcher, decorators: [{
  type: Injectable,
  args: [{ providedIn: "root" }]
}], ctorParameters: () => [] });
var CdkScrollable = class _CdkScrollable {
  elementRef = inject(ElementRef);
  scrollDispatcher = inject(ScrollDispatcher);
  ngZone = inject(NgZone);
  dir = inject(Directionality, { optional: true });
  _scrollElement = this.elementRef.nativeElement;
  _destroyed = new Subject();
  _renderer = inject(Renderer2);
  _cleanupScroll;
  _elementScrolled = new Subject();
  constructor() {
  }
  ngOnInit() {
    this._cleanupScroll = this.ngZone.runOutsideAngular(() => this._renderer.listen(this._scrollElement, "scroll", (event) => this._elementScrolled.next(event)));
    this.scrollDispatcher.register(this);
  }
  ngOnDestroy() {
    this._cleanupScroll?.();
    this._elementScrolled.complete();
    this.scrollDispatcher.deregister(this);
    this._destroyed.next();
    this._destroyed.complete();
  }
  /** Returns observable that emits when a scroll event is fired on the host element. */
  elementScrolled() {
    return this._elementScrolled;
  }
  /** Gets the ElementRef for the viewport. */
  getElementRef() {
    return this.elementRef;
  }
  /**
   * Scrolls to the specified offsets. This is a normalized version of the browser's native scrollTo
   * method, since browsers are not consistent about what scrollLeft means in RTL. For this method
   * left and right always refer to the left and right side of the scrolling container irrespective
   * of the layout direction. start and end refer to left and right in an LTR context and vice-versa
   * in an RTL context.
   * @param options specified the offsets to scroll to.
   */
  scrollTo(options) {
    const el = this.elementRef.nativeElement;
    const isRtl = this.dir && this.dir.value == "rtl";
    if (options.left == null) {
      options.left = isRtl ? options.end : options.start;
    }
    if (options.right == null) {
      options.right = isRtl ? options.start : options.end;
    }
    if (options.bottom != null) {
      options.top = el.scrollHeight - el.clientHeight - options.bottom;
    }
    if (isRtl && getRtlScrollAxisType() != RtlScrollAxisType.NORMAL) {
      if (options.left != null) {
        options.right = el.scrollWidth - el.clientWidth - options.left;
      }
      if (getRtlScrollAxisType() == RtlScrollAxisType.INVERTED) {
        options.left = options.right;
      } else if (getRtlScrollAxisType() == RtlScrollAxisType.NEGATED) {
        options.left = options.right ? -options.right : options.right;
      }
    } else {
      if (options.right != null) {
        options.left = el.scrollWidth - el.clientWidth - options.right;
      }
    }
    this._applyScrollToOptions(options);
  }
  _applyScrollToOptions(options) {
    const el = this.elementRef.nativeElement;
    if (supportsScrollBehavior()) {
      el.scrollTo(options);
    } else {
      if (options.top != null) {
        el.scrollTop = options.top;
      }
      if (options.left != null) {
        el.scrollLeft = options.left;
      }
    }
  }
  /**
   * Measures the scroll offset relative to the specified edge of the viewport. This method can be
   * used instead of directly checking scrollLeft or scrollTop, since browsers are not consistent
   * about what scrollLeft means in RTL. The values returned by this method are normalized such that
   * left and right always refer to the left and right side of the scrolling container irrespective
   * of the layout direction. start and end refer to left and right in an LTR context and vice-versa
   * in an RTL context.
   * @param from The edge to measure from.
   */
  measureScrollOffset(from) {
    const LEFT = "left";
    const RIGHT = "right";
    const el = this.elementRef.nativeElement;
    if (from == "top") {
      return el.scrollTop;
    }
    if (from == "bottom") {
      return el.scrollHeight - el.clientHeight - el.scrollTop;
    }
    const isRtl = this.dir && this.dir.value == "rtl";
    if (from == "start") {
      from = isRtl ? RIGHT : LEFT;
    } else if (from == "end") {
      from = isRtl ? LEFT : RIGHT;
    }
    if (isRtl && getRtlScrollAxisType() == RtlScrollAxisType.INVERTED) {
      if (from == LEFT) {
        return el.scrollWidth - el.clientWidth - el.scrollLeft;
      } else {
        return el.scrollLeft;
      }
    } else if (isRtl && getRtlScrollAxisType() == RtlScrollAxisType.NEGATED) {
      if (from == LEFT) {
        return el.scrollLeft + el.scrollWidth - el.clientWidth;
      } else {
        return -el.scrollLeft;
      }
    } else {
      if (from == LEFT) {
        return el.scrollLeft;
      } else {
        return el.scrollWidth - el.clientWidth - el.scrollLeft;
      }
    }
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkScrollable, deps: [], target: FactoryTarget.Directive });
  static \u0275dir = \u0275\u0275ngDeclareDirective({ minVersion: "14.0.0", version: "20.2.0-next.2", type: _CdkScrollable, isStandalone: true, selector: "[cdk-scrollable], [cdkScrollable]", ngImport: core_exports });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: CdkScrollable, decorators: [{
  type: Directive,
  args: [{
    selector: "[cdk-scrollable], [cdkScrollable]"
  }]
}], ctorParameters: () => [] });
var DEFAULT_RESIZE_TIME = 20;
var ViewportRuler = class _ViewportRuler {
  _platform = inject(Platform);
  _listeners;
  /** Cached viewport dimensions. */
  _viewportSize;
  /** Stream of viewport change events. */
  _change = new Subject();
  /** Used to reference correct document/window */
  _document = inject(DOCUMENT);
  constructor() {
    const ngZone = inject(NgZone);
    const renderer = inject(RendererFactory2).createRenderer(null, null);
    ngZone.runOutsideAngular(() => {
      if (this._platform.isBrowser) {
        const changeListener = (event) => this._change.next(event);
        this._listeners = [
          renderer.listen("window", "resize", changeListener),
          renderer.listen("window", "orientationchange", changeListener)
        ];
      }
      this.change().subscribe(() => this._viewportSize = null);
    });
  }
  ngOnDestroy() {
    this._listeners?.forEach((cleanup) => cleanup());
    this._change.complete();
  }
  /** Returns the viewport's width and height. */
  getViewportSize() {
    if (!this._viewportSize) {
      this._updateViewportSize();
    }
    const output = { width: this._viewportSize.width, height: this._viewportSize.height };
    if (!this._platform.isBrowser) {
      this._viewportSize = null;
    }
    return output;
  }
  /** Gets a DOMRect for the viewport's bounds. */
  getViewportRect() {
    const scrollPosition = this.getViewportScrollPosition();
    const { width, height } = this.getViewportSize();
    return {
      top: scrollPosition.top,
      left: scrollPosition.left,
      bottom: scrollPosition.top + height,
      right: scrollPosition.left + width,
      height,
      width
    };
  }
  /** Gets the (top, left) scroll position of the viewport. */
  getViewportScrollPosition() {
    if (!this._platform.isBrowser) {
      return { top: 0, left: 0 };
    }
    const document2 = this._document;
    const window2 = this._getWindow();
    const documentElement = document2.documentElement;
    const documentRect = documentElement.getBoundingClientRect();
    const top = -documentRect.top || document2.body.scrollTop || window2.scrollY || documentElement.scrollTop || 0;
    const left = -documentRect.left || document2.body.scrollLeft || window2.scrollX || documentElement.scrollLeft || 0;
    return { top, left };
  }
  /**
   * Returns a stream that emits whenever the size of the viewport changes.
   * This stream emits outside of the Angular zone.
   * @param throttleTime Time in milliseconds to throttle the stream.
   */
  change(throttleTime = DEFAULT_RESIZE_TIME) {
    return throttleTime > 0 ? this._change.pipe(auditTime(throttleTime)) : this._change;
  }
  /** Use defaultView of injected document if available or fallback to global window reference */
  _getWindow() {
    return this._document.defaultView || window;
  }
  /** Updates the cached viewport size. */
  _updateViewportSize() {
    const window2 = this._getWindow();
    this._viewportSize = this._platform.isBrowser ? { width: window2.innerWidth, height: window2.innerHeight } : { width: 0, height: 0 };
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _ViewportRuler, deps: [], target: FactoryTarget.Injectable });
  static \u0275prov = \u0275\u0275ngDeclareInjectable({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _ViewportRuler, providedIn: "root" });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: ViewportRuler, decorators: [{
  type: Injectable,
  args: [{ providedIn: "root" }]
}], ctorParameters: () => [] });
var VIRTUAL_SCROLLABLE = new InjectionToken("VIRTUAL_SCROLLABLE");
var CdkVirtualScrollable = class _CdkVirtualScrollable extends CdkScrollable {
  constructor() {
    super();
  }
  /**
   * Measure the viewport size for the provided orientation.
   *
   * @param orientation The orientation to measure the size from.
   */
  measureViewportSize(orientation) {
    const viewportEl = this.elementRef.nativeElement;
    return orientation === "horizontal" ? viewportEl.clientWidth : viewportEl.clientHeight;
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkVirtualScrollable, deps: [], target: FactoryTarget.Directive });
  static \u0275dir = \u0275\u0275ngDeclareDirective({ minVersion: "14.0.0", version: "20.2.0-next.2", type: _CdkVirtualScrollable, isStandalone: true, usesInheritance: true, ngImport: core_exports });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: CdkVirtualScrollable, decorators: [{
  type: Directive
}], ctorParameters: () => [] });
function rangesEqual(r1, r2) {
  return r1.start == r2.start && r1.end == r2.end;
}
var SCROLL_SCHEDULER = typeof requestAnimationFrame !== "undefined" ? animationFrameScheduler : asapScheduler;
var CdkVirtualScrollViewport = class _CdkVirtualScrollViewport extends CdkVirtualScrollable {
  elementRef = inject(ElementRef);
  _changeDetectorRef = inject(ChangeDetectorRef);
  _scrollStrategy = inject(VIRTUAL_SCROLL_STRATEGY, {
    optional: true
  });
  scrollable = inject(VIRTUAL_SCROLLABLE, { optional: true });
  _platform = inject(Platform);
  /** Emits when the viewport is detached from a CdkVirtualForOf. */
  _detachedSubject = new Subject();
  /** Emits when the rendered range changes. */
  _renderedRangeSubject = new Subject();
  /** The direction the viewport scrolls. */
  get orientation() {
    return this._orientation;
  }
  set orientation(orientation) {
    if (this._orientation !== orientation) {
      this._orientation = orientation;
      this._calculateSpacerSize();
    }
  }
  _orientation = "vertical";
  /**
   * Whether rendered items should persist in the DOM after scrolling out of view. By default, items
   * will be removed.
   */
  appendOnly = false;
  // Note: we don't use the typical EventEmitter here because we need to subscribe to the scroll
  // strategy lazily (i.e. only if the user is actually listening to the events). We do this because
  // depending on how the strategy calculates the scrolled index, it may come at a cost to
  // performance.
  /** Emits when the index of the first element visible in the viewport changes. */
  scrolledIndexChange = new Observable((observer) => this._scrollStrategy.scrolledIndexChange.subscribe((index) => Promise.resolve().then(() => this.ngZone.run(() => observer.next(index)))));
  /** The element that wraps the rendered content. */
  _contentWrapper;
  /** A stream that emits whenever the rendered range changes. */
  renderedRangeStream = this._renderedRangeSubject;
  /**
   * The total size of all content (in pixels), including content that is not currently rendered.
   */
  _totalContentSize = 0;
  /** A string representing the `style.width` property value to be used for the spacer element. */
  _totalContentWidth = signal("", ...ngDevMode ? [{ debugName: "_totalContentWidth" }] : []);
  /** A string representing the `style.height` property value to be used for the spacer element. */
  _totalContentHeight = signal("", ...ngDevMode ? [{ debugName: "_totalContentHeight" }] : []);
  /**
   * The CSS transform applied to the rendered subset of items so that they appear within the bounds
   * of the visible viewport.
   */
  _renderedContentTransform;
  /** The currently rendered range of indices. */
  _renderedRange = { start: 0, end: 0 };
  /** The length of the data bound to this viewport (in number of items). */
  _dataLength = 0;
  /** The size of the viewport (in pixels). */
  _viewportSize = 0;
  /** the currently attached CdkVirtualScrollRepeater. */
  _forOf;
  /** The last rendered content offset that was set. */
  _renderedContentOffset = 0;
  /**
   * Whether the last rendered content offset was to the end of the content (and therefore needs to
   * be rewritten as an offset to the start of the content).
   */
  _renderedContentOffsetNeedsRewrite = false;
  _changeDetectionNeeded = signal(false, ...ngDevMode ? [{ debugName: "_changeDetectionNeeded" }] : []);
  /** A list of functions to run after the next change detection cycle. */
  _runAfterChangeDetection = [];
  /** Subscription to changes in the viewport size. */
  _viewportChanges = Subscription.EMPTY;
  _injector = inject(Injector);
  _isDestroyed = false;
  constructor() {
    super();
    const viewportRuler = inject(ViewportRuler);
    if (!this._scrollStrategy && (typeof ngDevMode === "undefined" || ngDevMode)) {
      throw Error('Error: cdk-virtual-scroll-viewport requires the "itemSize" property to be set.');
    }
    this._viewportChanges = viewportRuler.change().subscribe(() => {
      this.checkViewportSize();
    });
    if (!this.scrollable) {
      this.elementRef.nativeElement.classList.add("cdk-virtual-scrollable");
      this.scrollable = this;
    }
    const ref = effect(() => {
      if (this._changeDetectionNeeded()) {
        this._doChangeDetection();
      }
    }, ...ngDevMode ? [{ debugName: "ref", injector: inject(ApplicationRef).injector }] : [
      // Using ApplicationRef injector is important here because we want this to be a root
      // effect that runs before change detection of any application views (since we're depending on markForCheck marking parents dirty)
      { injector: inject(ApplicationRef).injector }
    ]);
    inject(DestroyRef).onDestroy(() => void ref.destroy());
  }
  ngOnInit() {
    if (!this._platform.isBrowser) {
      return;
    }
    if (this.scrollable === this) {
      super.ngOnInit();
    }
    this.ngZone.runOutsideAngular(() => Promise.resolve().then(() => {
      this._measureViewportSize();
      this._scrollStrategy.attach(this);
      this.scrollable.elementScrolled().pipe(
        // Start off with a fake scroll event so we properly detect our initial position.
        startWith(null),
        // Collect multiple events into one until the next animation frame. This way if
        // there are multiple scroll events in the same frame we only need to recheck
        // our layout once.
        auditTime(0, SCROLL_SCHEDULER),
        // Usually `elementScrolled` is completed when the scrollable is destroyed, but
        // that may not be the case if a `CdkVirtualScrollableElement` is used so we have
        // to unsubscribe here just in case.
        takeUntil(this._destroyed)
      ).subscribe(() => this._scrollStrategy.onContentScrolled());
      this._markChangeDetectionNeeded();
    }));
  }
  ngOnDestroy() {
    this.detach();
    this._scrollStrategy.detach();
    this._renderedRangeSubject.complete();
    this._detachedSubject.complete();
    this._viewportChanges.unsubscribe();
    this._isDestroyed = true;
    super.ngOnDestroy();
  }
  /** Attaches a `CdkVirtualScrollRepeater` to this viewport. */
  attach(forOf) {
    if (this._forOf && (typeof ngDevMode === "undefined" || ngDevMode)) {
      throw Error("CdkVirtualScrollViewport is already attached.");
    }
    this.ngZone.runOutsideAngular(() => {
      this._forOf = forOf;
      this._forOf.dataStream.pipe(takeUntil(this._detachedSubject)).subscribe((data) => {
        const newLength = data.length;
        if (newLength !== this._dataLength) {
          this._dataLength = newLength;
          this._scrollStrategy.onDataLengthChanged();
        }
        this._doChangeDetection();
      });
    });
  }
  /** Detaches the current `CdkVirtualForOf`. */
  detach() {
    this._forOf = null;
    this._detachedSubject.next();
  }
  /** Gets the length of the data bound to this viewport (in number of items). */
  getDataLength() {
    return this._dataLength;
  }
  /** Gets the size of the viewport (in pixels). */
  getViewportSize() {
    return this._viewportSize;
  }
  // TODO(mmalerba): This is technically out of sync with what's really rendered until a render
  // cycle happens. I'm being careful to only call it after the render cycle is complete and before
  // setting it to something else, but its error prone and should probably be split into
  // `pendingRange` and `renderedRange`, the latter reflecting whats actually in the DOM.
  /** Get the current rendered range of items. */
  getRenderedRange() {
    return this._renderedRange;
  }
  measureBoundingClientRectWithScrollOffset(from) {
    return this.getElementRef().nativeElement.getBoundingClientRect()[from];
  }
  /**
   * Sets the total size of all content (in pixels), including content that is not currently
   * rendered.
   */
  setTotalContentSize(size) {
    if (this._totalContentSize !== size) {
      this._totalContentSize = size;
      this._calculateSpacerSize();
      this._markChangeDetectionNeeded();
    }
  }
  /** Sets the currently rendered range of indices. */
  setRenderedRange(range) {
    if (!rangesEqual(this._renderedRange, range)) {
      if (this.appendOnly) {
        range = { start: 0, end: Math.max(this._renderedRange.end, range.end) };
      }
      this._renderedRangeSubject.next(this._renderedRange = range);
      this._markChangeDetectionNeeded(() => this._scrollStrategy.onContentRendered());
    }
  }
  /**
   * Gets the offset from the start of the viewport to the start of the rendered data (in pixels).
   */
  getOffsetToRenderedContentStart() {
    return this._renderedContentOffsetNeedsRewrite ? null : this._renderedContentOffset;
  }
  /**
   * Sets the offset from the start of the viewport to either the start or end of the rendered data
   * (in pixels).
   */
  setRenderedContentOffset(offset, to = "to-start") {
    offset = this.appendOnly && to === "to-start" ? 0 : offset;
    const isRtl = this.dir && this.dir.value == "rtl";
    const isHorizontal = this.orientation == "horizontal";
    const axis = isHorizontal ? "X" : "Y";
    const axisDirection = isHorizontal && isRtl ? -1 : 1;
    let transform = `translate${axis}(${Number(axisDirection * offset)}px)`;
    this._renderedContentOffset = offset;
    if (to === "to-end") {
      transform += ` translate${axis}(-100%)`;
      this._renderedContentOffsetNeedsRewrite = true;
    }
    if (this._renderedContentTransform != transform) {
      this._renderedContentTransform = transform;
      this._markChangeDetectionNeeded(() => {
        if (this._renderedContentOffsetNeedsRewrite) {
          this._renderedContentOffset -= this.measureRenderedContentSize();
          this._renderedContentOffsetNeedsRewrite = false;
          this.setRenderedContentOffset(this._renderedContentOffset);
        } else {
          this._scrollStrategy.onRenderedOffsetChanged();
        }
      });
    }
  }
  /**
   * Scrolls to the given offset from the start of the viewport. Please note that this is not always
   * the same as setting `scrollTop` or `scrollLeft`. In a horizontal viewport with right-to-left
   * direction, this would be the equivalent of setting a fictional `scrollRight` property.
   * @param offset The offset to scroll to.
   * @param behavior The ScrollBehavior to use when scrolling. Default is behavior is `auto`.
   */
  scrollToOffset(offset, behavior = "auto") {
    const options = { behavior };
    if (this.orientation === "horizontal") {
      options.start = offset;
    } else {
      options.top = offset;
    }
    this.scrollable.scrollTo(options);
  }
  /**
   * Scrolls to the offset for the given index.
   * @param index The index of the element to scroll to.
   * @param behavior The ScrollBehavior to use when scrolling. Default is behavior is `auto`.
   */
  scrollToIndex(index, behavior = "auto") {
    this._scrollStrategy.scrollToIndex(index, behavior);
  }
  /**
   * Gets the current scroll offset from the start of the scrollable (in pixels).
   * @param from The edge to measure the offset from. Defaults to 'top' in vertical mode and 'start'
   *     in horizontal mode.
   */
  measureScrollOffset(from) {
    let measureScrollOffset;
    if (this.scrollable == this) {
      measureScrollOffset = (_from) => super.measureScrollOffset(_from);
    } else {
      measureScrollOffset = (_from) => this.scrollable.measureScrollOffset(_from);
    }
    return Math.max(0, measureScrollOffset(from ?? (this.orientation === "horizontal" ? "start" : "top")) - this.measureViewportOffset());
  }
  /**
   * Measures the offset of the viewport from the scrolling container
   * @param from The edge to measure from.
   */
  measureViewportOffset(from) {
    let fromRect;
    const LEFT = "left";
    const RIGHT = "right";
    const isRtl = this.dir?.value == "rtl";
    if (from == "start") {
      fromRect = isRtl ? RIGHT : LEFT;
    } else if (from == "end") {
      fromRect = isRtl ? LEFT : RIGHT;
    } else if (from) {
      fromRect = from;
    } else {
      fromRect = this.orientation === "horizontal" ? "left" : "top";
    }
    const scrollerClientRect = this.scrollable.measureBoundingClientRectWithScrollOffset(fromRect);
    const viewportClientRect = this.elementRef.nativeElement.getBoundingClientRect()[fromRect];
    return viewportClientRect - scrollerClientRect;
  }
  /** Measure the combined size of all of the rendered items. */
  measureRenderedContentSize() {
    const contentEl = this._contentWrapper.nativeElement;
    return this.orientation === "horizontal" ? contentEl.offsetWidth : contentEl.offsetHeight;
  }
  /**
   * Measure the total combined size of the given range. Throws if the range includes items that are
   * not rendered.
   */
  measureRangeSize(range) {
    if (!this._forOf) {
      return 0;
    }
    return this._forOf.measureRangeSize(range, this.orientation);
  }
  /** Update the viewport dimensions and re-render. */
  checkViewportSize() {
    this._measureViewportSize();
    this._scrollStrategy.onDataLengthChanged();
  }
  /** Measure the viewport size. */
  _measureViewportSize() {
    this._viewportSize = this.scrollable.measureViewportSize(this.orientation);
  }
  /** Queue up change detection to run. */
  _markChangeDetectionNeeded(runAfter) {
    if (runAfter) {
      this._runAfterChangeDetection.push(runAfter);
    }
    if (untracked(this._changeDetectionNeeded)) {
      return;
    }
    this.ngZone.runOutsideAngular(() => {
      Promise.resolve().then(() => {
        this.ngZone.run(() => {
          this._changeDetectionNeeded.set(true);
        });
      });
    });
  }
  /** Run change detection. */
  _doChangeDetection() {
    if (this._isDestroyed) {
      return;
    }
    this.ngZone.run(() => {
      this._changeDetectorRef.markForCheck();
      this._contentWrapper.nativeElement.style.transform = this._renderedContentTransform;
      afterNextRender(() => {
        this._changeDetectionNeeded.set(false);
        const runAfterChangeDetection = this._runAfterChangeDetection;
        this._runAfterChangeDetection = [];
        for (const fn of runAfterChangeDetection) {
          fn();
        }
      }, { injector: this._injector });
    });
  }
  /** Calculates the `style.width` and `style.height` for the spacer element. */
  _calculateSpacerSize() {
    this._totalContentHeight.set(this.orientation === "horizontal" ? "" : `${this._totalContentSize}px`);
    this._totalContentWidth.set(this.orientation === "horizontal" ? `${this._totalContentSize}px` : "");
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkVirtualScrollViewport, deps: [], target: FactoryTarget.Component });
  static \u0275cmp = \u0275\u0275ngDeclareComponent({ minVersion: "16.1.0", version: "20.2.0-next.2", type: _CdkVirtualScrollViewport, isStandalone: true, selector: "cdk-virtual-scroll-viewport", inputs: { orientation: "orientation", appendOnly: ["appendOnly", "appendOnly", booleanAttribute] }, outputs: { scrolledIndexChange: "scrolledIndexChange" }, host: { properties: { "class.cdk-virtual-scroll-orientation-horizontal": 'orientation === "horizontal"', "class.cdk-virtual-scroll-orientation-vertical": 'orientation !== "horizontal"' }, classAttribute: "cdk-virtual-scroll-viewport" }, providers: [
    {
      provide: CdkScrollable,
      useFactory: (virtualScrollable, viewport) => virtualScrollable || viewport,
      deps: [[new Optional(), new Inject(VIRTUAL_SCROLLABLE)], _CdkVirtualScrollViewport]
    }
  ], viewQueries: [{ propertyName: "_contentWrapper", first: true, predicate: ["contentWrapper"], descendants: true, static: true }], usesInheritance: true, ngImport: core_exports, template: '<!--\n  Wrap the rendered content in an element that will be used to offset it based on the scroll\n  position.\n-->\n<div #contentWrapper class="cdk-virtual-scroll-content-wrapper">\n  <ng-content></ng-content>\n</div>\n<!--\n  Spacer used to force the scrolling container to the correct size for the *total* number of items\n  so that the scrollbar captures the size of the entire data set.\n-->\n<div class="cdk-virtual-scroll-spacer"\n     [style.width]="_totalContentWidth()" [style.height]="_totalContentHeight()"></div>\n', styles: ["cdk-virtual-scroll-viewport{display:block;position:relative;transform:translateZ(0)}.cdk-virtual-scrollable{overflow:auto;will-change:scroll-position;contain:strict}.cdk-virtual-scroll-content-wrapper{position:absolute;top:0;left:0;contain:content}[dir=rtl] .cdk-virtual-scroll-content-wrapper{right:0;left:auto}.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper{min-height:100%}.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper>dl:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper>ol:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper>table:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper>ul:not([cdkVirtualFor]){padding-left:0;padding-right:0;margin-left:0;margin-right:0;border-left-width:0;border-right-width:0;outline:none}.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper{min-width:100%}.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper>dl:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper>ol:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper>table:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper>ul:not([cdkVirtualFor]){padding-top:0;padding-bottom:0;margin-top:0;margin-bottom:0;border-top-width:0;border-bottom-width:0;outline:none}.cdk-virtual-scroll-spacer{height:1px;transform-origin:0 0;flex:0 0 auto}[dir=rtl] .cdk-virtual-scroll-spacer{transform-origin:100% 0}\n"], changeDetection: ChangeDetectionStrategy.OnPush, encapsulation: ViewEncapsulation.None });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: CdkVirtualScrollViewport, decorators: [{
  type: Component,
  args: [{ selector: "cdk-virtual-scroll-viewport", host: {
    "class": "cdk-virtual-scroll-viewport",
    "[class.cdk-virtual-scroll-orientation-horizontal]": 'orientation === "horizontal"',
    "[class.cdk-virtual-scroll-orientation-vertical]": 'orientation !== "horizontal"'
  }, encapsulation: ViewEncapsulation.None, changeDetection: ChangeDetectionStrategy.OnPush, providers: [
    {
      provide: CdkScrollable,
      useFactory: (virtualScrollable, viewport) => virtualScrollable || viewport,
      deps: [[new Optional(), new Inject(VIRTUAL_SCROLLABLE)], CdkVirtualScrollViewport]
    }
  ], template: '<!--\n  Wrap the rendered content in an element that will be used to offset it based on the scroll\n  position.\n-->\n<div #contentWrapper class="cdk-virtual-scroll-content-wrapper">\n  <ng-content></ng-content>\n</div>\n<!--\n  Spacer used to force the scrolling container to the correct size for the *total* number of items\n  so that the scrollbar captures the size of the entire data set.\n-->\n<div class="cdk-virtual-scroll-spacer"\n     [style.width]="_totalContentWidth()" [style.height]="_totalContentHeight()"></div>\n', styles: ["cdk-virtual-scroll-viewport{display:block;position:relative;transform:translateZ(0)}.cdk-virtual-scrollable{overflow:auto;will-change:scroll-position;contain:strict}.cdk-virtual-scroll-content-wrapper{position:absolute;top:0;left:0;contain:content}[dir=rtl] .cdk-virtual-scroll-content-wrapper{right:0;left:auto}.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper{min-height:100%}.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper>dl:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper>ol:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper>table:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-horizontal .cdk-virtual-scroll-content-wrapper>ul:not([cdkVirtualFor]){padding-left:0;padding-right:0;margin-left:0;margin-right:0;border-left-width:0;border-right-width:0;outline:none}.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper{min-width:100%}.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper>dl:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper>ol:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper>table:not([cdkVirtualFor]),.cdk-virtual-scroll-orientation-vertical .cdk-virtual-scroll-content-wrapper>ul:not([cdkVirtualFor]){padding-top:0;padding-bottom:0;margin-top:0;margin-bottom:0;border-top-width:0;border-bottom-width:0;outline:none}.cdk-virtual-scroll-spacer{height:1px;transform-origin:0 0;flex:0 0 auto}[dir=rtl] .cdk-virtual-scroll-spacer{transform-origin:100% 0}\n"] }]
}], ctorParameters: () => [], propDecorators: { orientation: [{
  type: Input
}], appendOnly: [{
  type: Input,
  args: [{ transform: booleanAttribute }]
}], scrolledIndexChange: [{
  type: Output
}], _contentWrapper: [{
  type: ViewChild,
  args: ["contentWrapper", { static: true }]
}] } });
function getOffset(orientation, direction, node) {
  const el = node;
  if (!el.getBoundingClientRect) {
    return 0;
  }
  const rect = el.getBoundingClientRect();
  if (orientation === "horizontal") {
    return direction === "start" ? rect.left : rect.right;
  }
  return direction === "start" ? rect.top : rect.bottom;
}
var CdkVirtualForOf = class _CdkVirtualForOf {
  _viewContainerRef = inject(ViewContainerRef);
  _template = inject(TemplateRef);
  _differs = inject(IterableDiffers);
  _viewRepeater = inject(_VIEW_REPEATER_STRATEGY);
  _viewport = inject(CdkVirtualScrollViewport, { skipSelf: true });
  /** Emits when the rendered view of the data changes. */
  viewChange = new Subject();
  /** Subject that emits when a new DataSource instance is given. */
  _dataSourceChanges = new Subject();
  /** The DataSource to display. */
  get cdkVirtualForOf() {
    return this._cdkVirtualForOf;
  }
  set cdkVirtualForOf(value) {
    this._cdkVirtualForOf = value;
    if (isDataSource(value)) {
      this._dataSourceChanges.next(value);
    } else {
      this._dataSourceChanges.next(new ArrayDataSource(isObservable(value) ? value : Array.from(value || [])));
    }
  }
  _cdkVirtualForOf;
  /**
   * The `TrackByFunction` to use for tracking changes. The `TrackByFunction` takes the index and
   * the item and produces a value to be used as the item's identity when tracking changes.
   */
  get cdkVirtualForTrackBy() {
    return this._cdkVirtualForTrackBy;
  }
  set cdkVirtualForTrackBy(fn) {
    this._needsUpdate = true;
    this._cdkVirtualForTrackBy = fn ? (index, item) => fn(index + (this._renderedRange ? this._renderedRange.start : 0), item) : void 0;
  }
  _cdkVirtualForTrackBy;
  /** The template used to stamp out new elements. */
  set cdkVirtualForTemplate(value) {
    if (value) {
      this._needsUpdate = true;
      this._template = value;
    }
  }
  /**
   * The size of the cache used to store templates that are not being used for re-use later.
   * Setting the cache size to `0` will disable caching. Defaults to 20 templates.
   */
  get cdkVirtualForTemplateCacheSize() {
    return this._viewRepeater.viewCacheSize;
  }
  set cdkVirtualForTemplateCacheSize(size) {
    this._viewRepeater.viewCacheSize = coerceNumberProperty(size);
  }
  /** Emits whenever the data in the current DataSource changes. */
  dataStream = this._dataSourceChanges.pipe(
    // Start off with null `DataSource`.
    startWith(null),
    // Bundle up the previous and current data sources so we can work with both.
    pairwise(),
    // Use `_changeDataSource` to disconnect from the previous data source and connect to the
    // new one, passing back a stream of data changes which we run through `switchMap` to give
    // us a data stream that emits the latest data from whatever the current `DataSource` is.
    switchMap(([prev, cur]) => this._changeDataSource(prev, cur)),
    // Replay the last emitted data when someone subscribes.
    shareReplay(1)
  );
  /** The differ used to calculate changes to the data. */
  _differ = null;
  /** The most recent data emitted from the DataSource. */
  _data;
  /** The currently rendered items. */
  _renderedItems;
  /** The currently rendered range of indices. */
  _renderedRange;
  /** Whether the rendered data should be updated during the next ngDoCheck cycle. */
  _needsUpdate = false;
  _destroyed = new Subject();
  constructor() {
    const ngZone = inject(NgZone);
    this.dataStream.subscribe((data) => {
      this._data = data;
      this._onRenderedDataChange();
    });
    this._viewport.renderedRangeStream.pipe(takeUntil(this._destroyed)).subscribe((range) => {
      this._renderedRange = range;
      if (this.viewChange.observers.length) {
        ngZone.run(() => this.viewChange.next(this._renderedRange));
      }
      this._onRenderedDataChange();
    });
    this._viewport.attach(this);
  }
  /**
   * Measures the combined size (width for horizontal orientation, height for vertical) of all items
   * in the specified range. Throws an error if the range includes items that are not currently
   * rendered.
   */
  measureRangeSize(range, orientation) {
    if (range.start >= range.end) {
      return 0;
    }
    if ((range.start < this._renderedRange.start || range.end > this._renderedRange.end) && (typeof ngDevMode === "undefined" || ngDevMode)) {
      throw Error(`Error: attempted to measure an item that isn't rendered.`);
    }
    const renderedStartIndex = range.start - this._renderedRange.start;
    const rangeLen = range.end - range.start;
    let firstNode;
    let lastNode;
    for (let i = 0; i < rangeLen; i++) {
      const view = this._viewContainerRef.get(i + renderedStartIndex);
      if (view && view.rootNodes.length) {
        firstNode = lastNode = view.rootNodes[0];
        break;
      }
    }
    for (let i = rangeLen - 1; i > -1; i--) {
      const view = this._viewContainerRef.get(i + renderedStartIndex);
      if (view && view.rootNodes.length) {
        lastNode = view.rootNodes[view.rootNodes.length - 1];
        break;
      }
    }
    return firstNode && lastNode ? getOffset(orientation, "end", lastNode) - getOffset(orientation, "start", firstNode) : 0;
  }
  ngDoCheck() {
    if (this._differ && this._needsUpdate) {
      const changes = this._differ.diff(this._renderedItems);
      if (!changes) {
        this._updateContext();
      } else {
        this._applyChanges(changes);
      }
      this._needsUpdate = false;
    }
  }
  ngOnDestroy() {
    this._viewport.detach();
    this._dataSourceChanges.next(void 0);
    this._dataSourceChanges.complete();
    this.viewChange.complete();
    this._destroyed.next();
    this._destroyed.complete();
    this._viewRepeater.detach();
  }
  /** React to scroll state changes in the viewport. */
  _onRenderedDataChange() {
    if (!this._renderedRange) {
      return;
    }
    this._renderedItems = this._data.slice(this._renderedRange.start, this._renderedRange.end);
    if (!this._differ) {
      this._differ = this._differs.find(this._renderedItems).create((index, item) => {
        return this.cdkVirtualForTrackBy ? this.cdkVirtualForTrackBy(index, item) : item;
      });
    }
    this._needsUpdate = true;
  }
  /** Swap out one `DataSource` for another. */
  _changeDataSource(oldDs, newDs) {
    if (oldDs) {
      oldDs.disconnect(this);
    }
    this._needsUpdate = true;
    return newDs ? newDs.connect(this) : of();
  }
  /** Update the `CdkVirtualForOfContext` for all views. */
  _updateContext() {
    const count = this._data.length;
    let i = this._viewContainerRef.length;
    while (i--) {
      const view = this._viewContainerRef.get(i);
      view.context.index = this._renderedRange.start + i;
      view.context.count = count;
      this._updateComputedContextProperties(view.context);
      view.detectChanges();
    }
  }
  /** Apply changes to the DOM. */
  _applyChanges(changes) {
    this._viewRepeater.applyChanges(changes, this._viewContainerRef, (record, _adjustedPreviousIndex, currentIndex) => this._getEmbeddedViewArgs(record, currentIndex), (record) => record.item);
    changes.forEachIdentityChange((record) => {
      const view = this._viewContainerRef.get(record.currentIndex);
      view.context.$implicit = record.item;
    });
    const count = this._data.length;
    let i = this._viewContainerRef.length;
    while (i--) {
      const view = this._viewContainerRef.get(i);
      view.context.index = this._renderedRange.start + i;
      view.context.count = count;
      this._updateComputedContextProperties(view.context);
    }
  }
  /** Update the computed properties on the `CdkVirtualForOfContext`. */
  _updateComputedContextProperties(context) {
    context.first = context.index === 0;
    context.last = context.index === context.count - 1;
    context.even = context.index % 2 === 0;
    context.odd = !context.even;
  }
  _getEmbeddedViewArgs(record, index) {
    return {
      templateRef: this._template,
      context: {
        $implicit: record.item,
        // It's guaranteed that the iterable is not "undefined" or "null" because we only
        // generate views for elements if the "cdkVirtualForOf" iterable has elements.
        cdkVirtualForOf: this._cdkVirtualForOf,
        index: -1,
        count: -1,
        first: false,
        last: false,
        odd: false,
        even: false
      },
      index
    };
  }
  static ngTemplateContextGuard(directive, context) {
    return true;
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkVirtualForOf, deps: [], target: FactoryTarget.Directive });
  static \u0275dir = \u0275\u0275ngDeclareDirective({ minVersion: "14.0.0", version: "20.2.0-next.2", type: _CdkVirtualForOf, isStandalone: true, selector: "[cdkVirtualFor][cdkVirtualForOf]", inputs: { cdkVirtualForOf: "cdkVirtualForOf", cdkVirtualForTrackBy: "cdkVirtualForTrackBy", cdkVirtualForTemplate: "cdkVirtualForTemplate", cdkVirtualForTemplateCacheSize: "cdkVirtualForTemplateCacheSize" }, providers: [{ provide: _VIEW_REPEATER_STRATEGY, useClass: _RecycleViewRepeaterStrategy }], ngImport: core_exports });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: CdkVirtualForOf, decorators: [{
  type: Directive,
  args: [{
    selector: "[cdkVirtualFor][cdkVirtualForOf]",
    providers: [{ provide: _VIEW_REPEATER_STRATEGY, useClass: _RecycleViewRepeaterStrategy }]
  }]
}], ctorParameters: () => [], propDecorators: { cdkVirtualForOf: [{
  type: Input
}], cdkVirtualForTrackBy: [{
  type: Input
}], cdkVirtualForTemplate: [{
  type: Input
}], cdkVirtualForTemplateCacheSize: [{
  type: Input
}] } });
var CdkVirtualScrollableElement = class _CdkVirtualScrollableElement extends CdkVirtualScrollable {
  constructor() {
    super();
  }
  measureBoundingClientRectWithScrollOffset(from) {
    return this.getElementRef().nativeElement.getBoundingClientRect()[from] - this.measureScrollOffset(from);
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkVirtualScrollableElement, deps: [], target: FactoryTarget.Directive });
  static \u0275dir = \u0275\u0275ngDeclareDirective({ minVersion: "14.0.0", version: "20.2.0-next.2", type: _CdkVirtualScrollableElement, isStandalone: true, selector: "[cdkVirtualScrollingElement]", host: { classAttribute: "cdk-virtual-scrollable" }, providers: [{ provide: VIRTUAL_SCROLLABLE, useExisting: _CdkVirtualScrollableElement }], usesInheritance: true, ngImport: core_exports });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: CdkVirtualScrollableElement, decorators: [{
  type: Directive,
  args: [{
    selector: "[cdkVirtualScrollingElement]",
    providers: [{ provide: VIRTUAL_SCROLLABLE, useExisting: CdkVirtualScrollableElement }],
    host: {
      "class": "cdk-virtual-scrollable"
    }
  }]
}], ctorParameters: () => [] });
var CdkVirtualScrollableWindow = class _CdkVirtualScrollableWindow extends CdkVirtualScrollable {
  constructor() {
    super();
    const document2 = inject(DOCUMENT);
    this.elementRef = new ElementRef(document2.documentElement);
    this._scrollElement = document2;
  }
  measureBoundingClientRectWithScrollOffset(from) {
    return this.getElementRef().nativeElement.getBoundingClientRect()[from];
  }
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkVirtualScrollableWindow, deps: [], target: FactoryTarget.Directive });
  static \u0275dir = \u0275\u0275ngDeclareDirective({ minVersion: "14.0.0", version: "20.2.0-next.2", type: _CdkVirtualScrollableWindow, isStandalone: true, selector: "cdk-virtual-scroll-viewport[scrollWindow]", providers: [{ provide: VIRTUAL_SCROLLABLE, useExisting: _CdkVirtualScrollableWindow }], usesInheritance: true, ngImport: core_exports });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: CdkVirtualScrollableWindow, decorators: [{
  type: Directive,
  args: [{
    selector: "cdk-virtual-scroll-viewport[scrollWindow]",
    providers: [{ provide: VIRTUAL_SCROLLABLE, useExisting: CdkVirtualScrollableWindow }]
  }]
}], ctorParameters: () => [] });
var CdkScrollableModule = class _CdkScrollableModule {
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkScrollableModule, deps: [], target: FactoryTarget.NgModule });
  static \u0275mod = \u0275\u0275ngDeclareNgModule({ minVersion: "14.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkScrollableModule, imports: [CdkScrollable], exports: [CdkScrollable] });
  static \u0275inj = \u0275\u0275ngDeclareInjector({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _CdkScrollableModule });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: CdkScrollableModule, decorators: [{
  type: NgModule,
  args: [{
    exports: [CdkScrollable],
    imports: [CdkScrollable]
  }]
}] });
var ScrollingModule = class _ScrollingModule {
  static \u0275fac = \u0275\u0275ngDeclareFactory({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _ScrollingModule, deps: [], target: FactoryTarget.NgModule });
  static \u0275mod = \u0275\u0275ngDeclareNgModule({ minVersion: "14.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _ScrollingModule, imports: [
    BidiModule,
    CdkScrollableModule,
    CdkVirtualScrollViewport,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollableWindow,
    CdkVirtualScrollableElement
  ], exports: [
    BidiModule,
    CdkScrollableModule,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    CdkVirtualScrollViewport,
    CdkVirtualScrollableWindow,
    CdkVirtualScrollableElement
  ] });
  static \u0275inj = \u0275\u0275ngDeclareInjector({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: _ScrollingModule, imports: [
    BidiModule,
    CdkScrollableModule,
    BidiModule,
    CdkScrollableModule
  ] });
};
\u0275\u0275ngDeclareClassMetadata({ minVersion: "12.0.0", version: "20.2.0-next.2", ngImport: core_exports, type: ScrollingModule, decorators: [{
  type: NgModule,
  args: [{
    imports: [
      BidiModule,
      CdkScrollableModule,
      CdkVirtualScrollViewport,
      CdkFixedSizeVirtualScroll,
      CdkVirtualForOf,
      CdkVirtualScrollableWindow,
      CdkVirtualScrollableElement
    ],
    exports: [
      BidiModule,
      CdkScrollableModule,
      CdkFixedSizeVirtualScroll,
      CdkVirtualForOf,
      CdkVirtualScrollViewport,
      CdkVirtualScrollableWindow,
      CdkVirtualScrollableElement
    ]
  }]
}] });

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
var WatchlistComponent = class WatchlistComponent2 {
  static {
    WatchlistComponent_1 = this;
  }
  // Loading / error state
  loading = false;
  errorMsg = "";
  // Search state: keep AllSymbols separate from UserSymbols
  searchQuery = "";
  searchTerm$ = new BehaviorSubject("");
  searchOpen$ = new BehaviorSubject(false);
  allSymbolsLoaded = false;
  allSymbols$ = new BehaviorSubject([]);
  userSymbols$ = new BehaviorSubject([]);
  mergedSearchResults$ = combineLatest([
    this.allSymbols$.asObservable(),
    this.userSymbols$.asObservable(),
    this.searchTerm$.pipe(debounceTime(300)),
    this.searchOpen$
  ]).pipe(map(([all, users, term, open]) => {
    if (!open)
      return [];
    const q = (term || "").trim().toLowerCase();
    const usersBySymbolId = /* @__PURE__ */ new Map();
    for (const u of users || [])
      usersBySymbolId.set(u.SymbolId, u);
    const filtered = (all || []).filter((s) => !q || (s.SymbolName || "").toLowerCase().includes(q));
    const vms = filtered.map((s) => {
      const u = usersBySymbolId.get(s.Id);
      return { id: s.Id, name: s.SymbolName, isUserSymbol: !!u, userSymbolId: u?.Id };
    });
    vms.sort((a, b) => Number(b.isUserSymbol) - Number(a.isUserSymbol) || a.name.localeCompare(b.name));
    return vms.slice(0, 200);
  }));
  // User symbols list from backend
  userSymbols = [];
  // Info side panel state
  infoOpen = false;
  infoSymbol = "";
  _chartService = inject(ChartService);
  _userSymbolsService = inject(UserSymbolsService);
  router = inject(Router);
  _settingsService = inject(SettingsService);
  cdr = inject(ChangeDetectorRef);
  location = inject(Location);
  constructor() {
  }
  ngOnInit() {
    this.refreshUserSymbols();
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
  static symbolsCache = null;
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
        this.userSymbols$.next(this.userSymbols);
        this.computeUserSymbolNames();
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
  computeUserSymbolNames() {
    const all = this.allSymbols$.getValue();
    if (!this.userSymbols?.length || !all?.length)
      return;
    const byId = /* @__PURE__ */ new Map();
    for (const s of all) {
      byId.set(s.Id, s);
    }
    this.userSymbols = this.userSymbols.map((us) => {
      if (!us.SymbolName) {
        const found = byId.get(us.SymbolId);
        if (found?.SymbolName) {
          return __spreadProps(__spreadValues({}, us), { SymbolName: found.SymbolName });
        }
      }
      return us;
    });
  }
  onSearchInput() {
    this.searchTerm$.next(this.searchQuery);
  }
  clearSearch() {
    this.searchQuery = "";
    this.searchTerm$.next("");
    this.searchOpen$.next(false);
  }
  onSearchFocus() {
    this.searchOpen$.next(true);
    if (!this.allSymbolsLoaded) {
      this._chartService.getSymbols().subscribe({
        next: (symbols) => {
          this.allSymbolsLoaded = true;
          this.allSymbols$.next(symbols ?? []);
          this.computeUserSymbolNames();
          this.cdr.markForCheck();
        },
        error: (err) => console.error("[Watchlist] symbols load error", err)
      });
    }
  }
  onSearchBlur() {
  }
  addSymbolToProfile(symbol) {
    if (!symbol?.Id)
      return;
    if (this.userSymbols.some((u) => u.SymbolId === symbol.Id)) {
      this.clearSearch();
      return;
    }
    this._userSymbolsService.addUserSymbol(symbol.Id).subscribe({
      next: (created) => {
        const appended = {
          Id: created?.Id ?? 0,
          SymbolId: symbol.Id,
          ExchangeId: created?.ExchangeId ?? 0,
          SymbolName: symbol.SymbolName
        };
        this.userSymbols = [...this.userSymbols, appended];
        this.userSymbols$.next(this.userSymbols);
        this.clearSearch();
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error("[Watchlist] add user symbol error", err);
      }
    });
  }
  addSymbolByVm(vm) {
    if (!vm || vm.isUserSymbol)
      return;
    const symbol = (this.allSymbols$.getValue() || []).find((s) => s.Id === vm.id);
    if (!symbol)
      return;
    this.addSymbolToProfile(symbol);
  }
  deleteUserSymbol(userSymbolId) {
    if (!userSymbolId)
      return;
    this._userSymbolsService.deleteUserSymbol(userSymbolId).subscribe({
      next: () => {
        this.userSymbols = this.userSymbols.filter((u) => u.Id !== userSymbolId);
        this.userSymbols$.next(this.userSymbols);
        this.cdr.markForCheck();
      },
      error: (err) => console.error("[Watchlist] delete user symbol error", err)
    });
  }
  deleteByVm(vm) {
    if (!vm?.userSymbolId)
      return;
    this.deleteUserSymbol(vm.userSymbolId);
  }
  addWatchlist() {
    console.log("[Watchlist] addWatchlist (deprecated)");
  }
  // Favorites removed in new architecture
  // Direction helpers not needed for user symbols list
  trackByUserSymbol(index, item) {
    return `${item.ExchangeId}|${item.SymbolId}|${item.Id}`;
  }
  trackBySearchSymbol(index, item) {
    return `${item.Id}|${item.SymbolName}`;
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
  // Matrix cell click handler
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
  static ctorParameters = () => [];
};
WatchlistComponent = WatchlistComponent_1 = __decorate([
  Component({
    selector: "app-watchlist",
    imports: [CommonModule, FormsModule, FooterComponent, ScrollingModule, WatchlistMatrixComponent, CoinInfoComponent],
    template: watchlist_default,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [watchlist_default2]
  })
], WatchlistComponent);
export {
  WatchlistComponent
};
//# sourceMappingURL=watchlist-IHDSE4QE.js.map
