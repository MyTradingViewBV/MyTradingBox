import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { FooterComponent } from '../footer/footer-compenent';
import { DrawingToolboxComponent } from '../chart/drawing-toolbox.component';
import { WebOrdersPanelComponent } from '../web-chart/web-orders-panel.component';
import { WebChartBaseComponent } from '../web-chart/web-chart-base.component';
import {
  WebTestOrder,
  WebTestOrderDraft,
} from 'src/app/modules/shared/models/orders/web-test-order.model';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { Exchange } from 'src/app/modules/shared/models/orders/exchange.dto';
import {
  ChartTextOverlayComponent,
  ElliottWaveScenario,
} from './chart-text-overlay.component';

type WavePivot = { x: number; y: number; kind: 'high' | 'low' };

type InternalWaveScenario = ElliottWaveScenario & {
  points: WavePivot[];
};

@Component({
  selector: 'app-web-chart-next-test',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseChartDirective,
    DrawingToolboxComponent,
    WebOrdersPanelComponent,
    ChartTextOverlayComponent,
    TranslateModule,
    FooterComponent,
  ],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './web-chart-next-test.component.html',
  styleUrls: ['./web-chart-next-test.component.scss'],
})
export class WebChartNextTestComponent extends WebChartBaseComponent {
  private readonly webSettings = inject(SettingsService);
  private readonly webTestOrdersSignal = toSignal(
    this.webSettings.getWebTestOrders(),
    { initialValue: [] as WebTestOrder[] },
  );

  showHamburgerMenu = false;
  showTestOrdersPanel = false;
  ordersPanelMode: 'add' | 'table' | 'simple' = 'table';
  selectedFakeOrderId: number | null = null;
  waveScenarios: ElliottWaveScenario[] = [];

  constructor(cdr: ChangeDetectorRef) {
    super(cdr);
  }

  override ngOnInit(): void {
    super.ngOnInit();
    if (this.chartOptions?.scales?.x?.ticks) {
      this.chartOptions.scales.x.ticks.callback = (val: any) => this.formatWebTimeTick(val);
      this.chartOptions.scales.x.ticks.padding = 6;
    }
  }

  override loadCandles(symbol: string) {
    return super.loadCandles(symbol).pipe(
      tap(() => {
        this.renderFakeOrdersOnChart();
        this.rebuildElliottWaveScenarios();
      }),
    );
  }

  override onSymbolChange(symbol: SymbolModel): void {
    this.hideVisibleWebOrders();
    super.onSymbolChange(symbol);
  }

  override onExchangeChange(exchange: Exchange): void {
    this.hideVisibleWebOrders();
    super.onExchangeChange(exchange);
  }

  override onTouchStart(event: TouchEvent): void {
    if (this.isWebOverlayTouch(event)) return;
    super.onTouchStart(event);
  }

  override onTouchMove(event: TouchEvent): void {
    if (this.isWebOverlayTouch(event)) return;
    super.onTouchMove(event);
  }

  override onTouchEnd(event: TouchEvent): void {
    if (this.isWebOverlayTouch(event)) return;
    super.onTouchEnd(event);
  }

  toggleHamburgerMenu(): void {
    this.showHamburgerMenu = !this.showHamburgerMenu;
  }

  openAddOrderPanel(): void {
    this.ordersPanelMode = 'add';
    this.showTestOrdersPanel = true;
    this.showHamburgerMenu = false;
  }

  openSimpleOrderPanel(): void {
    this.ordersPanelMode = 'simple';
    this.showTestOrdersPanel = true;
    this.showHamburgerMenu = false;
  }

  openOrdersTablePanel(): void {
    this.ordersPanelMode = 'table';
    this.showTestOrdersPanel = true;
    this.showHamburgerMenu = false;
  }

  hideSelectedOrder(): void {
    const selected = this.selectedFakeOrderId == null
      ? null
      : this.webTestOrdersSignal().find((o) => o.id === this.selectedFakeOrderId);
    const fallbackVisible = this.ordersForCurrentSymbol.find((o) => o.showOnChart);
    const targetOrder = selected?.showOnChart ? selected : fallbackVisible;

    if (!targetOrder) {
      this.showHamburgerMenu = false;
      return;
    }

    this.onToggleOrderChart(targetOrder, false);
    if (this.selectedFakeOrderId === targetOrder.id) {
      this.selectedFakeOrderId = null;
    }

    this.showHamburgerMenu = false;
  }

  closeTestOrdersPanel(): void {
    this.showTestOrdersPanel = false;
  }

  onUpsertOrder(draft: WebTestOrderDraft): void {
    const symbol = this.currentSymbol;
    if (!symbol) return;
    const orders = this.webTestOrdersSignal();

    if (draft.id == null) {
      const now = new Date();
      const id = Date.now();
      const created: WebTestOrder = {
        id,
        number: `T-${id}`,
        exchange: this.currentExchange,
        symbol,
        side: draft.side ?? 'long',
        datetime: now.toISOString(),
        startPrice: Number(draft.startPrice),
        stopPrice: Number(draft.stopPrice),
        leverage: Number(draft.leverage || 1),
        transactionCostPct: Number(draft.transactionCostPct ?? 0.1),
        stopLoss: Number(draft.stopLoss),
        startDate: draft.startDate,
        stopDate: draft.stopDate,
        expectedProfit: Number(draft.expectedProfit),
        currentProfit: Number(draft.currentProfit),
        status: draft.status,
        showOnChart: false,
      };
      this.updateWebTestOrders([created, ...orders]);
      this.renderFakeOrdersOnChart();
      return;
    }

    const updated = orders.map((o) =>
      o.id === draft.id
        ? {
            ...o,
          exchange: o.exchange || this.currentExchange,
            side: draft.side ?? o.side ?? 'long',
            startPrice: Number(draft.startPrice),
            stopPrice: Number(draft.stopPrice),
            leverage: Number(draft.leverage || 1),
            transactionCostPct: Number(draft.transactionCostPct ?? o.transactionCostPct ?? 0.1),
            stopLoss: Number(draft.stopLoss),
            startDate: draft.startDate,
            stopDate: draft.stopDate,
            expectedProfit: Number(draft.expectedProfit),
            currentProfit: Number(draft.currentProfit),
            status: draft.status,
          }
        : o,
    );
    this.updateWebTestOrders(updated);
    this.renderFakeOrdersOnChart();
  }

  onSelectOrder(order: WebTestOrder): void {
    this.selectedFakeOrderId = order.id;
    if (!order.showOnChart) {
      this.onToggleOrderChart(order, true);
    }
    this.showTestOrdersPanel = false;
    this.showHamburgerMenu = false;
  }

  onToggleOrderChart(order: WebTestOrder, forcedValue?: boolean): void {
    const nextValue = forcedValue ?? !order.showOnChart;
    const updated = this.webTestOrdersSignal().map((o) =>
      o.id === order.id ? { ...o, showOnChart: nextValue } : o,
    );
    this.updateWebTestOrders(updated);
    this.renderFakeOrdersOnChart();
  }

  get ordersForCurrentSymbol(): WebTestOrder[] {
    const symbol = this.currentSymbol.toUpperCase();
    const exchange = this.currentExchange.toUpperCase();
    return (this.webTestOrdersSignal() || []).filter(
      (o) =>
        (o.symbol || '').toUpperCase() === symbol
        && ((o.exchange || '').toUpperCase() === exchange || !o.exchange),
    );
  }

  get currentSymbol(): string {
    return (this.selectedSymbol?.SymbolName || this.selectedSymbolName || '').trim();
  }

  get currentExchange(): string {
    return (this.selectedExchange?.Name || '').trim();
  }

  get canHideSelectedOrder(): boolean {
    if (this.selectedFakeOrderId != null) {
      const selected = this.ordersForCurrentSymbol.find((o) => o.id === this.selectedFakeOrderId);
      if (selected?.showOnChart) return true;
    }
    return this.ordersForCurrentSymbol.some((o) => o.showOnChart);
  }

  private formatWebTimeTick(val: any): string | string[] {
    if (!val) return '';

    try {
      const candle = this.baseData?.find((c: any) => c.x === val);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const parseDate = (raw: any): Date | null => {
        const d = raw instanceof Date ? raw : new Date(raw);
        return d && !isNaN(d.getTime()) ? d : null;
      };

      const date = parseDate(candle?.timeStr) ?? parseDate(val);
      if (!date) return String(val);

      const timeframe = (this.selectedTimeframe || '1h').toLowerCase();
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const mon = months[date.getMonth()];

      if (timeframe.endsWith('m') || timeframe.endsWith('h')) {
        if (hh === '00' && min === '00') return [dd, mon];
        return [hh, min];
      }

      if (timeframe === '1w' || timeframe === '1m') {
        if (date.getDate() === 1) {
          return [mon, `'${String(date.getFullYear()).slice(-2)}`];
        }
        return [dd, mon];
      }

      return [dd, mon];
    } catch {
      return String(val);
    }
  }

  get selectedOrder(): WebTestOrder | null {
    if (this.selectedFakeOrderId != null) {
      const selected = this.ordersForCurrentSymbol.find((o) => o.id === this.selectedFakeOrderId);
      if (selected?.showOnChart) return selected;
    }
    return this.ordersForCurrentSymbol.find((o) => o.showOnChart) || null;
  }

  get selectedOrderLeverage(): number {
    return Number(this.selectedOrder?.leverage || 1);
  }

  get selectedOrderTpDiff(): number {
    const order = this.selectedOrder;
    if (!order) return 0;
    return this.signedMove(order.startPrice, order.stopPrice, order.side);
  }

  get selectedOrderSlDiff(): number {
    const order = this.selectedOrder;
    if (!order) return 0;
    return -Math.abs(this.signedMove(order.startPrice, order.stopLoss ?? order.startPrice, order.side));
  }

  get selectedOrderTpPct(): number {
    const order = this.selectedOrder;
    if (!order?.startPrice) return 0;
    return (this.selectedOrderTpDiff / Number(order.startPrice)) * 100;
  }

  get selectedOrderSlPct(): number {
    const order = this.selectedOrder;
    if (!order?.startPrice) return 0;
    return (this.selectedOrderSlDiff / Number(order.startPrice)) * 100;
  }

  get selectedOrderRrRatio(): number {
    const risk = Math.abs(this.selectedOrderSlDiff);
    if (!risk) return 0;
    return Math.abs(this.selectedOrderTpDiff) / risk;
  }

  get selectedOrderCurrentDiff(): number {
    const order = this.selectedOrder;
    if (!order) return 0;
    return this.signedMove(order.startPrice, this.currentPrice, order.side);
  }

  get selectedOrderCurrentPct(): number {
    const order = this.selectedOrder;
    if (!order?.startPrice) return 0;
    const denominator = Number(order.startPrice) * Number(order.leverage || 1);
    if (!denominator) return 0;
    return (this.selectedOrderCurrentLeveragedPnl / denominator) * 100;
  }

  get selectedOrderCurrentLeveragedPnl(): number {
    const order = this.selectedOrder;
    if (!order) return 0;
    const gross = this.selectedOrderCurrentDiff * this.selectedOrderLeverage;
    const fee = this.transactionCost(order.startPrice, this.currentPrice, order.leverage, order.transactionCostPct);
    return gross - fee;
  }

  get selectedOrderSide(): string {
    return this.selectedOrder?.side ?? 'long';
  }

  get selectedOrderTransactionCostPct(): number {
    return Number(this.selectedOrder?.transactionCostPct ?? 0.1);
  }

  get selectedOrderCurrentFeeCost(): number {
    const order = this.selectedOrder;
    if (!order) return 0;
    return this.transactionCost(order.startPrice, this.currentPrice, order.leverage, order.transactionCostPct);
  }

  private isWebOverlayTouch(event: TouchEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;

    return !!target.closest(
      '.web-header-menu, .toolbar-dropdown, .toolbar-dropdown-item, .test-orders-overlay',
    );
  }

  private rebuildElliottWaveScenarios(): void {
    const candles = (this.baseData || [])
      .map((c: any) => ({
        x: this.toMs(c?.x),
        y: Number(c?.c ?? c?.close ?? c?.y ?? c?.o ?? c?.open ?? 0),
      }))
      .filter((p: any) => Number.isFinite(p.x) && Number.isFinite(p.y));

    if (candles.length < 60) {
      this.waveScenarios = [];
      return;
    }

    const pivots = this.extractPivots(candles, 3, 0.008);
    const candidates = this.buildImpulseCandidates(pivots)
      .map((s) => ({ ...s, confidence: Math.max(0, Math.min(1, s.confidence)) }))
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map(({ points, ...rest }) => rest);

    this.waveScenarios = candidates;
  }

  private extractPivots(
    series: Array<{ x: number; y: number }>,
    window: number,
    minMovePct: number,
  ): WavePivot[] {
    const pivots: WavePivot[] = [];
    const n = series.length;
    if (n < (window * 2) + 1) return pivots;

    for (let i = window; i < n - window; i++) {
      const current = series[i];
      let isHigh = true;
      let isLow = true;

      for (let j = i - window; j <= i + window; j++) {
        if (j === i) continue;
        if (series[j].y >= current.y) isHigh = false;
        if (series[j].y <= current.y) isLow = false;
        if (!isHigh && !isLow) break;
      }

      if (!isHigh && !isLow) continue;
      const kind: 'high' | 'low' = isHigh ? 'high' : 'low';
      const pivot: WavePivot = { x: current.x, y: current.y, kind };
      const last = pivots[pivots.length - 1];

      if (!last) {
        pivots.push(pivot);
        continue;
      }

      if (last.kind === pivot.kind) {
        const replace = (kind === 'high' && pivot.y > last.y)
          || (kind === 'low' && pivot.y < last.y);
        if (replace) pivots[pivots.length - 1] = pivot;
        continue;
      }

      const movePct = Math.abs((pivot.y - last.y) / (last.y || 1));
      if (movePct >= minMovePct) {
        pivots.push(pivot);
      }
    }

    return pivots;
  }

  private buildImpulseCandidates(pivots: WavePivot[]): InternalWaveScenario[] {
    const out: InternalWaveScenario[] = [];
    if (pivots.length < 6) return out;

    for (let i = 0; i <= pivots.length - 6; i++) {
      const points = pivots.slice(i, i + 6);
      const p0 = points[0];
      const p1 = points[1];
      const p2 = points[2];
      const p3 = points[3];
      const p4 = points[4];
      const p5 = points[5];

      const direction: 'bull' | 'bear' = p1.y > p0.y ? 'bull' : 'bear';
      const impulse = (a: number, b: number) => direction === 'bull' ? b - a : a - b;
      const retrace = (a: number, b: number) => direction === 'bull' ? a - b : b - a;

      const w1 = impulse(p0.y, p1.y);
      const w2 = retrace(p1.y, p2.y);
      const w3 = impulse(p2.y, p3.y);
      const w4 = retrace(p3.y, p4.y);
      const w5 = impulse(p4.y, p5.y);

      if ([w1, w2, w3, w4, w5].some((v) => v <= 0)) continue;

      const wave2Invalid = direction === 'bull' ? p2.y <= p0.y : p2.y >= p0.y;
      if (wave2Invalid) continue;

      const wave4Overlap = direction === 'bull' ? p4.y <= p1.y : p4.y >= p1.y;
      if (wave4Overlap) continue;

      if (w3 <= Math.min(w1, w5)) continue;

      const r2 = w2 / w1;
      const r3 = w3 / w1;
      const r4 = w4 / w3;
      const r5 = w5 / w1;

      const near = (value: number, target: number, tolerance: number) =>
        Math.max(0, 1 - (Math.abs(value - target) / tolerance));

      const score2 = Math.max(near(r2, 0.5, 0.4), near(r2, 0.618, 0.4));
      const score3 = near(r3, 1.618, 1.0);
      const score4 = Math.max(near(r4, 0.236, 0.35), near(r4, 0.382, 0.35));
      const score5 = Math.max(near(r5, 0.618, 0.5), near(r5, 1.0, 0.6));

      const confidence = (score2 * 0.25) + (score3 * 0.35) + (score4 * 0.2) + (score5 * 0.2);
      out.push({
        label: `${direction === 'bull' ? 'Bullish' : 'Bearish'} impulse 1-5`,
        confidence,
        direction,
        invalidationPrice: direction === 'bull' ? p0.y : p0.y,
        points,
      });
    }

    return out;
  }

  private toMs(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value < 1e12 ? value * 1000 : value;
    }
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return asNum < 1e12 ? asNum * 1000 : asNum;
    const asDate = new Date(value as any).getTime();
    return Number.isFinite(asDate) ? asDate : Date.now();
  }

  private updateWebTestOrders(orders: WebTestOrder[]): void {
    this.webSettings.dispatchAppAction(
      SettingsActions.setWebTestOrders({ orders }),
    );
  }

  private signedMove(entry: number, target: number, side?: string): number {
    return side === 'short' ? Number(entry) - Number(target) : Number(target) - Number(entry);
  }

  private transactionCost(entry: number, exit: number, leverage?: number, transactionCostPct?: number): number {
    const lev = Number(leverage || 1);
    const feePct = Math.max(0, Number(transactionCostPct ?? 0.1));
    const feeRate = feePct / 100;
    return (Math.abs(Number(entry)) + Math.abs(Number(exit))) * lev * feeRate;
  }

  private hideVisibleWebOrders(): void {
    const orders = this.webTestOrdersSignal() || [];
    if (!orders.length) {
      this.selectedFakeOrderId = null;
      this.showTestOrdersPanel = false;
      this.showHamburgerMenu = false;
      return;
    }

    const hasVisible = orders.some((o) => o.showOnChart);
    if (hasVisible) {
      const updated = orders.map((o) => (o.showOnChart ? { ...o, showOnChart: false } : o));
      this.updateWebTestOrders(updated);
    }

    this.selectedFakeOrderId = null;
    this.showTestOrdersPanel = false;
    this.showHamburgerMenu = false;
  }

  private renderFakeOrdersOnChart(): void {
    const visible = this.ordersForCurrentSymbol.filter((o) => o.showOnChart);
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = (this.chartData.datasets || []).filter(
        (d: any) => !d.isFakeOrder,
      );

      if (!visible.length || !this.baseData?.length) return;

      const toMs = (value: unknown): number => {
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number' && Number.isFinite(value)) {
          // Heuristic: 10-digit unix seconds vs millisecond timestamps.
          return value < 1e12 ? value * 1000 : value;
        }
        const asNum = Number(value);
        if (Number.isFinite(asNum)) return asNum < 1e12 ? asNum * 1000 : asNum;
        const asDate = new Date(value as any).getTime();
        return Number.isFinite(asDate) ? asDate : Date.now();
      };

      const xStartData = this.baseData[0].x;
      const xEndData = this.baseData[this.baseData.length - 1].x;
      const xEndMs = toMs(xEndData);
      const fakeDatasets = visible.flatMap((order) => {
        const isRemoved = order.status === 'removed';
        const takeProfitColor =
          order.status === 'completed'
            ? '#4ade80'
            : isRemoved
              ? '#94a3b8'
              : '#f59e0b';
        const entryColor = isRemoved ? '#94a3b8' : '#f59e0b';
        const stopLossColor = isRemoved ? '#64748b' : '#ef4444';
        const takeProfitFill = isRemoved ? 'rgba(148,163,184,0.08)' : 'rgba(34,197,94,0.18)';
        const stopLossFill = isRemoved ? 'rgba(100,116,139,0.08)' : 'rgba(239,68,68,0.18)';
        const leverage = Number(order.leverage || 1);
        const stopLoss = Number(order.stopLoss ?? order.startPrice);
        const orderStartMs = new Date(order.startDate).getTime();
        const xStart = Number.isFinite(orderStartMs)
          ? (
              this.baseData.find((c: any) => toMs(c.x) >= orderStartMs)?.x
              ?? (orderStartMs > xEndMs ? xEndData : xStartData)
            )
          : xStartData;

        return [
          {
            type: 'line' as const,
            label: `${order.number} TP Zone (${leverage}x)`,
            data: [
              { x: xStart, y: order.startPrice },
              { x: xEndData, y: order.startPrice },
            ],
            borderColor: 'rgba(0,0,0,0)',
            backgroundColor: takeProfitFill,
            borderWidth: 0,
            fill: { target: { value: Number(order.stopPrice) } } as any,
            pointRadius: 0,
            isFakeOrder: true,
            order: 938,
          },
          {
            type: 'line' as const,
            label: `${order.number} SL Zone`,
            data: [
              { x: xStart, y: order.startPrice },
              { x: xEndData, y: order.startPrice },
            ],
            borderColor: 'rgba(0,0,0,0)',
            backgroundColor: stopLossFill,
            borderWidth: 0,
            fill: { target: { value: stopLoss } } as any,
            pointRadius: 0,
            isFakeOrder: true,
            order: 939,
          },
          {
            type: 'line' as const,
            label: `${order.number} Entry`,
            data: [
              { x: xStart, y: order.startPrice },
              { x: xEndData, y: order.startPrice },
            ],
            borderColor: entryColor,
            borderWidth: 1.2,
            borderDash: [],
            pointRadius: 0,
            isFakeOrder: true,
            order: 940,
          },
          {
            type: 'line' as const,
            label: `${order.number} Take Profit`,
            data: [
              { x: xStart, y: Number(order.stopPrice) },
              { x: xEndData, y: Number(order.stopPrice) },
            ],
            borderColor: takeProfitColor,
            borderWidth: 1,
            borderDash: [6, 4],
            pointRadius: 0,
            isFakeOrder: true,
            order: 941,
          },
          {
            type: 'line' as const,
            label: `${order.number} Stop Loss`,
            data: [
              { x: xStart, y: stopLoss },
              { x: xEndData, y: stopLoss },
            ],
            borderColor: stopLossColor,
            borderWidth: 1,
            borderDash: [5, 4],
            pointRadius: 0,
            isFakeOrder: true,
            order: 942,
          },
        ];
      });

      this.chartData.datasets = this.chartData.datasets.concat(fakeDatasets);
    });
  }
}
