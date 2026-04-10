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
  selectedFakeOrderId: number | null = null;

  constructor(cdr: ChangeDetectorRef) {
    super(cdr);
  }

  override ngOnInit(): void {
    super.ngOnInit();
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

  openTestOrdersPanel(): void {
    this.showTestOrdersPanel = true;
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

      const xMin = this.baseData[0].x;
      const xMax = this.baseData[this.baseData.length - 1].x;
      const fakeDatasets = visible.flatMap((order) => {
        const isRemoved = order.status === 'removed';
        const baseColor =
          order.status === 'completed'
            ? '#4ade80'
            : isRemoved
              ? '#94a3b8'
              : '#f59e0b';

        return [
          {
            type: 'line' as const,
            label: `${order.number} Start`,
            data: [
              { x: xMin, y: order.startPrice },
              { x: xMax, y: order.startPrice },
            ],
            borderColor: baseColor,
            borderWidth: 1.3,
            borderDash: [],
            pointRadius: 0,
            isFakeOrder: true,
            order: 940,
          },
          {
            type: 'line' as const,
            label: `${order.number} Stop`,
            data: [
              { x: xMin, y: order.stopPrice },
              { x: xMax, y: order.stopPrice },
            ],
            borderColor: '#ef4444',
            borderWidth: 1,
            borderDash: [5, 4],
            pointRadius: 0,
            isFakeOrder: true,
            order: 940,
          },
        ];
      });

      this.chartData.datasets = this.chartData.datasets.concat(fakeDatasets);
    });
  }
}
