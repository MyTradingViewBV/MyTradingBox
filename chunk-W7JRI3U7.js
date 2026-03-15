import {
  Router
} from "./chunk-IOKBW7VW.js";
import {
  Component,
  __decorate,
  inject
} from "./chunk-X5OTQXGI.js";

// angular:jit:template:src\app\components\footer\footer-compenent.html
var footer_compenent_default = `<footer class="app-footer">\r
  <button type="button" class="footer-btn" (click)="navigate('chart')">\r
    <span class="icon">\u{1F4CA}</span>\r
    <span class="label">Grafiek</span>\r
  </button>\r
\r
  <button type="button" class="footer-btn" (click)="navigate('orders')">\r
    <span class="icon">\u{1F4BC}</span>\r
    <span class="label">Orders</span>\r
  </button>\r
\r
  <button type="button" class="footer-btn" (click)="navigate('watchlist')">\r
    <span class="icon">\u{1F441}\uFE0F</span>\r
    <span class="label">Watchlist</span>\r
  </button>\r
\r
  <button type="button" class="footer-btn" (click)="navigate('balance')">\r
    <span class="icon">\u{1F4B0}</span>\r
    <span class="label">Balance</span>\r
  </button>\r
\r
  <button type="button" class="footer-btn" (click)="navigate('dashboard')">\r
    <span class="icon">\u2699\uFE0F</span>\r
    <span class="label">Settings</span>\r
  </button>\r
</footer>`;

// angular:jit:style:src\app\components\footer\footer-compenent.scss
var footer_compenent_default2 = "/* src/app/components/footer/footer-compenent.scss */\n.app-footer {\n  position: fixed;\n  bottom: 0;\n  left: 0;\n  right: 0;\n  height: 48px;\n  display: flex;\n  justify-content: space-around;\n  align-items: center;\n  gap: 8px;\n  padding: 0 8px;\n  background: #121212;\n  color: #fff;\n  border-top: 1px solid rgba(255, 255, 255, 0.08);\n  z-index: 1000;\n  box-shadow: 0 -1px 6px rgba(0, 0, 0, 0.6);\n}\n.compact-toggle .icon {\n  transition: color 0.2s ease, transform 0.2s ease;\n}\n.compact-toggle .icon.active {\n  color: #8ab4f8;\n  transform: scale(1.15);\n}\n@media (max-aspect-ratio: 1/1) {\n  .compact-toggle {\n    display: none;\n  }\n}\n@media (min-aspect-ratio: 1/1) {\n  .compact-toggle {\n    display: block;\n  }\n}\n.app-footer,\n.app-footer *,\n.app-footer button,\n.app-footer .mat-button,\n.app-footer .mat-button .mat-button-wrapper {\n  color: #fff !important;\n}\n.app-footer button.mat-button {\n  min-width: 40px;\n  height: 36px;\n  padding: 4px 6px;\n  border-radius: 6px;\n  color: #fff !important;\n  background: transparent !important;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  font-size: 12px;\n}\n.app-footer button.mat-button .mat-icon {\n  font-size: 20px;\n  line-height: 20px;\n  margin: 0;\n  color: #fff !important;\n  fill: #fff !important;\n}\n.app-footer button.mat-button span {\n  display: none;\n  color: #fff !important;\n}\n.app-footer button.mat-button:hover {\n  background: rgba(255, 255, 255, 0.04) !important;\n}\n.app-footer button.mat-button:active {\n  background: rgba(255, 255, 255, 0.06) !important;\n}\n@media (min-width: 900px) {\n  .app-footer {\n    height: 56px;\n    gap: 12px;\n  }\n  .app-footer button.mat-button span {\n    display: inline-block;\n    margin-left: 6px;\n    font-size: 13px;\n    color: #fff !important;\n  }\n}\n/*# sourceMappingURL=footer-compenent.css.map */\n";

// src/app/components/footer/footer-compenent.ts
var FooterComponent = class FooterComponent2 {
  _router = inject(Router);
  constructor() {
  }
  navigate(route) {
    console.log("navigating to", route);
    this._router.navigate([`/${route}`]);
  }
  static ctorParameters = () => [];
};
FooterComponent = __decorate([
  Component({
    selector: "app-footer",
    // Angular Material removed; using plain HTML elements now
    imports: [],
    template: footer_compenent_default,
    styles: [footer_compenent_default2]
  })
], FooterComponent);

export {
  FooterComponent
};
//# sourceMappingURL=chunk-W7JRI3U7.js.map
