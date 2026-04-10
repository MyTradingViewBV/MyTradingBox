import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BaseChartDirective, provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { tap } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { FooterComponent } from '../footer/footer-compenent';
import { ChartComponent } from '../chart/chart-component';
import { DrawingToolboxComponent } from '../chart/drawing-toolbox.component';
import { WebOrdersPanelComponent } from './web-orders-panel.component';
import {
  WebTestOrder,
  WebTestOrderDraft,
} from 'src/app/modules/shared/models/orders/web-test-order.model';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { SettingsActions } from 'src/app/store/settings/settings.actions';

@Component({
  selector: 'app-web-chart',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseChartDirective,
    DrawingToolboxComponent,
    WebOrdersPanelComponent,
    TranslateModule,
    FooterComponent,
  ],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './web-chart.component.html',
  styleUrls: ['./web-chart.component.scss'],
})
export class WebChartComponent extends ChartComponent {
  private readonly webSettings = inject(SettingsService);
  private readonly webTestOrdersSignal = toSignal(
    this.webSettings.getWebTestOrders(),
    { initialValue: [] as WebTestOrder[] },
  );

  showHamburgerMenu = false;
  showTestOrdersPanel = false;
  ordersPanelMode: 'add' | 'table' = 'table';
  selectedFakeOrderId: number | null = null;

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
    return super.loadCandles(symbol).pipe(tap(() => this.renderFakeOrdersOnChart()));
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
        symbol,
        datetime: now.toISOString(),
        startPrice: Number(draft.startPrice),
        stopPrice: Number(draft.stopPrice),
        leverage: Number(draft.leverage || 1),
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
            startPrice: Number(draft.startPrice),
            stopPrice: Number(draft.stopPrice),
            leverage: Number(draft.leverage || 1),
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
    return (this.webTestOrdersSignal() || []).filter(
      (o) => (o.symbol || '').toUpperCase() === symbol,
    );
  }

  get currentSymbol(): string {
    return (this.selectedSymbol?.SymbolName || this.selectedSymbolName || '').trim();
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
    if (this.selectedFakeOrderId == null) return null;
    return this.ordersForCurrentSymbol.find((o) => o.id === this.selectedFakeOrderId) || null;
  }

  get selectedOrderLeverage(): number {
    return Number(this.selectedOrder?.leverage || 1);
  }

  get selectedOrderTpDiff(): number {
    const order = this.selectedOrder;
    if (!order) return 0;
    return Number(order.stopPrice) - Number(order.startPrice);
  }

  get selectedOrderSlDiff(): number {
    const order = this.selectedOrder;
    if (!order) return 0;
    return Number(order.startPrice) - Number(order.stopLoss ?? order.startPrice);
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
    return Number(this.currentPrice) - Number(order.startPrice);
  }

  get selectedOrderCurrentPct(): number {
    const order = this.selectedOrder;
    if (!order?.startPrice) return 0;
    return (this.selectedOrderCurrentDiff / Number(order.startPrice)) * 100;
  }

  get selectedOrderCurrentLeveragedPnl(): number {
    return this.selectedOrderCurrentDiff * this.selectedOrderLeverage;
  }

  private isWebOverlayTouch(event: TouchEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;

    return !!target.closest(
      '.web-header-menu, .toolbar-dropdown, .toolbar-dropdown-item, .test-orders-overlay',
    );
  }

  private updateWebTestOrders(orders: WebTestOrder[]): void {
    this.webSettings.dispatchAppAction(
      SettingsActions.setWebTestOrders({ orders }),
    );
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
