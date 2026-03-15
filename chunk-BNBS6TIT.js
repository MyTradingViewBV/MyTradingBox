import {
  ActivatedRoute,
  CommonModule,
  Router
} from "./chunk-IOKBW7VW.js";
import {
  ChangeDetectionStrategy,
  Component,
  Input,
  __decorate,
  inject
} from "./chunk-X5OTQXGI.js";

// angular:jit:template:src\app\components\coin-info\coin-info.html
var coin_info_default = `<div class="coin-root" [class.embedded]="embedded" role="region" aria-label="Coin information">\r
  <!-- Full header for standalone usage -->\r
  @if (!embedded) {\r
    <div class="ci-header">\r
      <button type="button" class="ci-btn circle" (click)="goBack()" aria-label="Back to Watchlist">\u2715</button>\r
      <h2 class="ci-title">Info: {{ info?.name }} <span class="muted">({{ info?.symbol }})</span></h2>\r
      <button type="button" class="ci-btn circle" (click)="openChart()" aria-label="Open in Chart">\u2934</button>\r
    </div>\r
  }\r
\r
  <!-- Compact header for embedded side panel -->\r
  @if (embedded) {\r
    <div class="ci-embedded-header">\r
      <h3 class="ci-title">Info: {{ info?.name }} <span class="muted">({{ info?.symbol }})</span></h3>\r
    </div>\r
  }\r
\r
  <div class="ci-card wl-card">\r
    <div class="ci-row">\r
      <div class="ci-label">Symbol</div>\r
      <div class="ci-value">{{ info?.symbol }}</div>\r
    </div>\r
    <div class="ci-row">\r
      <div class="ci-label">Price (USD)</div>\r
      <div class="ci-value">{{ info?.priceUsd | number:'1.2-2' }}</div>\r
    </div>\r
    <div class="ci-row">\r
      <div class="ci-label">24h Change</div>\r
      <div class="ci-value" [class.pos]="(info?.change24hPct||0) > 0" [class.neg]="(info?.change24hPct||0) < 0">\r
        {{ info?.change24hPct }}%\r
      </div>\r
    </div>\r
    <div class="ci-row">\r
      <div class="ci-label">Market Cap</div>\r
      <div class="ci-value">\${{ info?.marketCapUsd | number:'1.0-0' }}</div>\r
    </div>\r
  </div>\r
\r
  <div class="ci-card wl-card about">\r
    <h3 class="ci-subtitle">About</h3>\r
    <div class="ci-divider"></div>\r
    <p class="ci-desc">{{ info?.description }}</p>\r
  </div>\r
</div>\r
`;

// angular:jit:style:src\app\components\coin-info\coin-info.scss
var coin_info_default2 = "/* src/app/components/coin-info/coin-info.scss */\n.coin-root {\n  min-height: 100vh;\n  background: var(--sys-surface, #0f1115);\n  color: #eee;\n  padding: 12px 16px 72px;\n  box-sizing: border-box;\n}\n.coin-root.embedded {\n  min-height: auto;\n  background: transparent;\n  color: inherit;\n  padding: 0;\n}\n.ci-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  position: sticky;\n  top: 0;\n  background: var(--sys-surface-container-high, rgba(0, 0, 0, 0.85));\n  -webkit-backdrop-filter: blur(6px);\n  backdrop-filter: blur(6px);\n  padding: 12px 8px;\n  border-bottom: 1px solid var(--sys-outline, #191919);\n  z-index: 5;\n  margin-bottom: 16px;\n}\n.ci-embedded-header {\n  margin: 0 0 16px;\n}\n.ci-title {\n  margin: 0;\n  font-size: 18px;\n  font-weight: 600;\n  line-height: 1.35;\n  letter-spacing: 0.5px;\n  background:\n    linear-gradient(\n      90deg,\n      #ff8b2f,\n      #ffd643);\n  -webkit-background-clip: text;\n  color: transparent;\n}\n.ci-title .muted {\n  color: #8a8f99;\n  background: none;\n  -webkit-background-clip: initial;\n}\n.ci-btn {\n  background: #181a20;\n  border: 1px solid #2a2d33;\n  color: #ddd;\n  padding: 8px 12px;\n  border-radius: 12px;\n  cursor: pointer;\n  font-size: 14px;\n  transition:\n    background 0.2s ease,\n    border-color 0.2s ease,\n    color 0.2s ease;\n}\n.ci-btn.circle {\n  width: 34px;\n  height: 34px;\n  padding: 0;\n  border-radius: 50%;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n}\n.ci-btn:hover {\n  background: rgba(255, 255, 255, 0.08);\n  color: #fff;\n  border-color: #ff8b2f;\n}\n.ci-card {\n  background: var(--sys-surface-container, #20242b);\n  border: 1px solid #262a30;\n  border-radius: 12px;\n  padding: 16px;\n  margin-top: 16px;\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);\n}\n.ci-card.about {\n  margin-top: 24px;\n}\n.coin-root.embedded .ci-card {\n  background: transparent;\n  border: none;\n  border-radius: 12px;\n  padding: 12px;\n  box-shadow: none;\n}\n.ci-subtitle {\n  margin: 0 0 10px;\n  font-size: 15px;\n  font-weight: 600;\n  color: #bbb;\n}\n.ci-desc {\n  margin: 12px 0 0;\n  color: #9aa0a6;\n  line-height: 1.7;\n  max-width: 60ch;\n}\n.ci-divider {\n  height: 1px;\n  background: #1f2329;\n  opacity: 0.9;\n  border-radius: 1px;\n}\n.ci-row {\n  display: flex;\n  align-items: center;\n  padding: 12px 0;\n  border-bottom: 1px solid #1f2329;\n}\n.ci-row:last-child {\n  border-bottom: none;\n}\n.ci-label {\n  width: 150px;\n  color: #8a8f99;\n  font-size: 12px;\n  line-height: 1.4;\n}\n.ci-value {\n  font-size: 15px;\n  font-weight: 600;\n  line-height: 1.5;\n}\n.ci-value.pos {\n  color: #55c772;\n}\n.ci-value.neg {\n  color: #ff7b7b;\n}\n@media (max-width: 600px) {\n  .ci-label {\n    width: 120px;\n  }\n  .ci-card {\n    padding: 14px;\n  }\n  .ci-row {\n    padding: 12px 0;\n  }\n}\n/*# sourceMappingURL=coin-info.css.map */\n";

// src/app/components/coin-info/coin-info.ts
var CoinInfoComponent = class CoinInfoComponent2 {
  symbolInput = null;
  embedded = false;
  symbol = "";
  info = null;
  route = inject(ActivatedRoute);
  router = inject(Router);
  constructor() {
    const fromRoute = (this.route.snapshot.paramMap.get("symbol") || "").trim();
    this.symbol = fromRoute;
    this.info = this.buildMock(this.symbol);
  }
  ngOnChanges(changes) {
    if ("symbolInput" in changes) {
      const s = (this.symbolInput || "").trim();
      if (s) {
        this.symbol = s;
        this.info = this.buildMock(this.symbol);
      }
    }
  }
  buildMock(symbol) {
    const upper = (symbol || "UNKNOWN").toUpperCase();
    const baseName = upper.replace("USDT", "");
    const seed = Math.max(1, baseName.charCodeAt(0) - 64);
    return {
      symbol: upper,
      name: `${baseName} Token`,
      description: `${baseName} is a mock asset used for preview purposes. This page shows placeholder fundamentals while the real API is not available.`,
      priceUsd: 10 + seed * 3.1415,
      change24hPct: seed % 7 - 3,
      marketCapUsd: seed * 1e9
    };
  }
  goBack() {
    this.router.navigate(["/watchlist"]);
  }
  openChart() {
    const tf = "1d";
    if (this.symbol) {
      this.router.navigate(["/chart", this.symbol, tf]);
    }
  }
  static ctorParameters = () => [];
  static propDecorators = {
    symbolInput: [{ type: Input }],
    embedded: [{ type: Input }]
  };
};
CoinInfoComponent = __decorate([
  Component({
    selector: "app-coin-info",
    standalone: true,
    imports: [CommonModule],
    template: coin_info_default,
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [coin_info_default2]
  })
], CoinInfoComponent);

export {
  CoinInfoComponent
};
//# sourceMappingURL=chunk-BNBS6TIT.js.map
