import { CommonModule, NgComponentOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  BaseChartDirective,
  provideCharts,
  withDefaultRegisterables,
} from 'ng2-charts';
import { Observable } from 'rxjs';
import { FooterComponent } from '../footer/footer.component';
import {
  ChartAuxPanel,
  ChartBaseComponent,
} from '../chart/chart-base.component';
import { DrawingToolboxComponent } from '../chart/drawing-toolbox.component';
import { ChartLinkedScaleService } from '../chart/services/chart-linked-scale.service';
import { ChartPriceTickerService } from '../chart/services/chart-price-ticker.service';
import { formatPriceChange } from '../chart/utils/chart-utils';
import { InternalCandle } from '../chart/utils/custom-timeframe-live';
import { normalizeTimeframe } from '../chart/utils/timeframe-bucketing';
import { buildMcbPanelData, McbSideValue } from './mcb-indicator';
import { McbPanelComponent } from './mcb-panel.component';

/**
 * Candlestick chart with a linked Market Cipher B oscillator panel below it
 * (/market-cipher-b-chart). The main chart hides its x-axis; the MCB panel
 * shows the time axis and follows the main chart's x-range.
 */
@Component({
  selector: 'app-market-cipher-b-chart',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseChartDirective,
    DrawingToolboxComponent,
    TranslateModule,
    FooterComponent,
  ],
  providers: [
    provideCharts(withDefaultRegisterables()),
    ChartPriceTickerService,
  ],
  templateUrl: '../chart/chart-base.component.html',
  styleUrls: [
    '../chart/chart-base.toolbar.scss',
    '../chart/chart-base.panels.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketCipherBChartComponent extends ChartBaseComponent {
  /** Viewport is fitted by applyViewportAfterCandleLoad / the load subscribers instead. */
  protected override readonly initializeChartOnCandleLoad = false;
  /** End key-zone lines at the last candle (overscroll extension leaves a stray segment next to the MCB axis). */
  protected override readonly keyZonesExtendIntoOverscroll = false;

  @ViewChild(NgComponentOutlet) private auxPanelOutlet?: NgComponentOutlet;

  mcbChartData: any = { datasets: [] };
  mcbSideValues: McbSideValue[] = [];
  mcbChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      drawingTools: false,
    },
    elements: {
      line: { tension: 0.25 },
      point: { radius: 0 },
    },
    scales: {
      x: {
        type: 'time',
        display: true,
        grid: {
          color: 'rgba(42,46,57,0.35)',
          drawBorder: false,
        },
        ticks: {
          source: 'auto',
          callback: (val: any) => this.formatMcbTimeTick(val),
          color: '#787b86',
          maxTicksLimit: 10,
          maxRotation: 0,
          autoSkip: true,
          autoSkipPadding: 14,
          font: { size: 11 },
          padding: 6,
        },
      },
      y: {
        display: false,
        min: -110,
        max: 110,
        grid: {
          color: 'rgba(42,46,57,0.45)',
          drawBorder: false,
        },
      },
    },
    layout: {
      padding: { top: 4, right: 0, bottom: 24, left: 10 },
    },
  };

  private readonly linkedScale = inject(ChartLinkedScaleService);
  private _syncMcbTries = 0;
  private _viewportTries = 0;
  private _mcbRebuildRaf: number | null = null;
  /** Pending requestAnimationFrame ids (viewport/sync retries), cancelled on destroy. */
  private readonly _pendingRafs = new Set<number>();
  linkedRightAxisWidthPx = 72;

  constructor(cdr: ChangeDetectorRef) {
    super(cdr);
    // The MCB panel carries the time axis; hide it on the main chart.
    const x = this.chartOptions.scales.x;
    this.chartOptions.scales.x = {
      ...x,
      display: false,
      ticks: { display: false },
    };
    this.chartOptions.layout.padding = {
      ...this.chartOptions.layout.padding,
      bottom: 4,
    };
  }

  override get auxPanel(): ChartAuxPanel | null {
    if (!this.mcbChartData.datasets?.length) return null;
    return {
      component: McbPanelComponent,
      inputs: {
        chartData: this.mcbChartData,
        chartOptions: this.mcbChartOptions,
        sideValues: this.mcbSideValues,
        axisWidthPx: this.linkedRightAxisWidthPx,
      },
    };
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this._mcbRebuildRaf != null) {
      cancelAnimationFrame(this._mcbRebuildRaf);
      this._mcbRebuildRaf = null;
    }
    this._pendingRafs.forEach((id) => cancelAnimationFrame(id));
    this._pendingRafs.clear();
    try {
      this.linkedScale.clearMcbChart();
    } catch {}
  }

  /** requestAnimationFrame that is tracked for cancellation and skipped after destroy. */
  private raf(callback: () => void): void {
    if (this.destroyed) return;
    const id = requestAnimationFrame(() => {
      this._pendingRafs.delete(id);
      if (this.destroyed) return;
      callback();
    });
    this._pendingRafs.add(id);
  }

  // ── Base hooks ───────────────────────────────────────────────────────────

  override loadCandles(symbol: string): Observable<any[]> {
    this._viewportTries = 0;
    return super.loadCandles(symbol);
  }

  protected override onCandlesLoaded(candles: InternalCandle[]): void {
    this.scheduleRebuildMcbPanelDatasets(candles);
  }

  protected override afterTimeframeCandlesLoaded(then: () => void): void {
    this.applyViewportAfterCandleLoad(then);
  }

  protected override onViewportChanged(): void {
    this.scheduleSyncMcbPanel();
  }

  protected override onChartResized(): void {
    if (!this.interaction.isInteracting) {
      try {
        this.syncMcbPanelFromMainChart();
      } catch {}
    }
  }

  override safeUpdateDatasets(
    modifier: () => void,
    preserveScales = true,
  ): void {
    this.syncLiveCandlesToChartData();
    super.safeUpdateDatasets(modifier, preserveScales);
  }

  override addKeyZoneDatasets(): void {
    this.syncLiveCandlesToChartData();
    super.addKeyZoneDatasets();
  }

  protected override keyZoneCandles(): Array<{ x: number }> | undefined {
    return this.baseData as Array<{ x: number }>;
  }

  override clearScaleRanges(): void {
    try {
      this.linkedScale.clearLinkedRange();
      this.linkedScale.resetMcbXRange(this.getMcbChartJsRef());
    } catch {}
    super.clearScaleRanges();
  }

  override fitToData(): void {
    const chartRef = this.chart?.chart as any;
    if (!chartRef?.scales?.x?.options || !chartRef?.scales?.y?.options) return;
    super.fitToData();
  }

  /**
   * Adaptive y-axis tick density (ChartLayoutService). Lays the chart out first
   * so chartArea reflects the new range before the step is computed.
   */
  protected override setYAxisStep(
    chartRef: any,
    yMin?: number,
    yMax?: number,
  ): void {
    try {
      chartRef?.update?.('none');
    } catch {}
    try {
      if (!chartRef?.scales?.y) return;
      const yScale = chartRef.scales.y;
      const min =
        typeof yMin === 'number'
          ? yMin
          : typeof yScale.min === 'number'
            ? yScale.min
            : (yScale.options?.min ?? 0);
      const max =
        typeof yMax === 'number'
          ? yMax
          : typeof yScale.max === 'number'
            ? yScale.max
            : (yScale.options?.max ?? min + 1);

      const chartArea = chartRef.chartArea;
      const chartHeight = chartArea
        ? chartArea.bottom - chartArea.top
        : chartRef.height || 400;
      const chartWidth = chartArea
        ? chartArea.right - chartArea.left
        : chartRef.width || 800;

      const { stepSize, maxTicksLimit } =
        this.layout.calculateAdaptiveYAxisStep(
          min,
          max,
          chartHeight,
          chartWidth,
        );

      chartRef.config = chartRef.config || { options: { scales: {} } };
      chartRef.config.options = chartRef.config.options || { scales: {} };
      chartRef.config.options.scales = chartRef.config.options.scales || {};
      chartRef.config.options.scales.y = chartRef.config.options.scales.y || {};
      chartRef.config.options.scales.y.ticks =
        chartRef.config.options.scales.y.ticks || {};
      chartRef.config.options.scales.y.ticks.stepSize = stepSize;
      chartRef.config.options.scales.y.ticks.autoSkip = true;
      chartRef.config.options.scales.y.ticks.maxTicksLimit = maxTicksLimit;
    } catch {}
  }

  protected override applyLivePriceFromLastCandle(): void {
    this.syncLiveCandlesToChartData();
    const last = this.baseData[this.baseData.length - 1] as any;
    const prev = this.baseData[this.baseData.length - 2] as any;
    if (!last || !Number.isFinite(Number(last.c))) return;
    this.setCandleDisplayPrice(Number(last.c));
    this.priceChange = prev ? this.currentPrice - Number(prev.c ?? 0) : 0;
    this.priceChangeFormatted = formatPriceChange(
      this.priceChange,
      Number(prev?.c ?? 0),
    );
  }

  protected override flushLiveRenderAux(): boolean {
    try {
      this.rebuildMcbPanelDatasets(this.baseData);
    } catch (err) {
      console.warn('[MCB] rebuild failed', err);
      this.mcbChartData = { datasets: [] };
      this.mcbSideValues = [];
    }
    this.scheduleMcbTimeRangeSync();
    return true;
  }

  // ── MCB panel ────────────────────────────────────────────────────────────

  /** Keep ng2-charts bound candle dataset aligned with live-updated baseData. */
  private syncLiveCandlesToChartData(): void {
    if (!this.baseData?.length || !this.chartData?.datasets?.length) return;
    const main = this.chartData.datasets[0] as any;
    if (!main) return;
    main.data = this.baseData;
  }

  private rebuildMcbPanelDatasets(candles: any[]): void {
    const panel = buildMcbPanelData(candles);
    this.mcbChartData = panel?.chartData ?? { datasets: [] };
    this.mcbSideValues = panel?.sideValues ?? [];
    this.cdr.markForCheck();
  }

  private scheduleRebuildMcbPanelDatasets(candles: any[]): void {
    if (this._mcbRebuildRaf != null) {
      cancelAnimationFrame(this._mcbRebuildRaf);
    }
    if (this.destroyed) return;
    this._mcbRebuildRaf = requestAnimationFrame(() => {
      this._mcbRebuildRaf = null;
      if (this.destroyed) return;
      try {
        this.rebuildMcbPanelDatasets(candles);
      } catch (err) {
        console.warn('[MCB] rebuild failed', err);
        this.mcbChartData = { datasets: [] };
        this.mcbSideValues = [];
        this.cdr.markForCheck();
      }
    });
  }

  /** Wait for Chart.js scales after a candle reload (needed for 12m/24m). */
  private applyViewportAfterCandleLoad(after?: () => void): void {
    this.raf(() => {
      this.raf(() => {
        if (!this.baseData?.length) {
          after?.();
          return;
        }

        const chartRef = this.chart?.chart as any;
        if (!chartRef?.scales?.x || !chartRef?.scales?.y) {
          if (this._viewportTries++ < 25) {
            this.applyViewportAfterCandleLoad(after);
            return;
          }
          this._viewportTries = 0;
          after?.();
          return;
        }

        this._viewportTries = 0;
        try {
          this.fitToData();
        } catch (err) {
          console.warn('[Chart] fitToData failed after candle load', err);
        }
        after?.();
      });
    });
  }

  private hasMainChartXRange(mainRef: any): boolean {
    const x = mainRef?.scales?.x;
    return (
      typeof x?.options?.min === 'number' &&
      typeof x?.options?.max === 'number' &&
      Number.isFinite(x.options.min) &&
      Number.isFinite(x.options.max)
    );
  }

  private get mcbPanel(): McbPanelComponent | null {
    const instance = this.auxPanelOutlet?.componentInstance;
    return instance instanceof McbPanelComponent ? instance : null;
  }

  private formatMcbTimeTick(val: any): string | string[] {
    if (!val) return '';
    try {
      const candle = this.baseData?.find((c: any) => c.x === val);
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const parseDate = (raw: any): Date | null => {
        const d = raw instanceof Date ? raw : new Date(raw);
        return d && !isNaN(d.getTime()) ? d : null;
      };
      const date = parseDate(candle?.timeStr) ?? parseDate(val);
      if (!date) return String(val);
      // normalizeTimeframe keeps '1M' (month) distinct from '1m' (minute).
      const timeframe = normalizeTimeframe(this.selectedTimeframe || '1h');
      const hh = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const mon = months[date.getMonth()];
      if (timeframe.endsWith('m') || timeframe.endsWith('h')) {
        if (hh === '00' && min === '00') return [dd, mon];
        return [hh, min];
      }
      if (timeframe === '1w' || timeframe === '1M') {
        if (date.getDate() === 1)
          return [mon, `'${String(date.getFullYear()).slice(-2)}`];
        return [dd, mon];
      }
      return [dd, mon];
    } catch {
      return String(val);
    }
  }

  private getMcbCanvasElement(): HTMLCanvasElement | null {
    const fromViewChild = this.mcbPanel?.canvasEl?.nativeElement ?? null;
    if (fromViewChild) return fromViewChild;

    const fromChart = (this.mcbPanel?.chart?.chart as any)?.canvas as
      HTMLCanvasElement | undefined;
    if (fromChart) return fromChart;

    return document.querySelector(
      '.mcb-plot canvas[data-linked-panel="mcb"]',
    ) as HTMLCanvasElement | null;
  }

  private getMcbChartJsRef(): any {
    const canvas = this.getMcbCanvasElement();
    const fromRegistry = canvas
      ? this.linkedScale.resolveMcbChartFromCanvas(canvas)
      : null;
    if (fromRegistry) return fromRegistry;
    const fromViewChild = this.mcbPanel?.chart?.chart as any;
    if (fromViewChild?.scales?.x) {
      this.linkedScale.registerMcbChart(fromViewChild);
      return fromViewChild;
    }
    return this.linkedScale.ensureMcbChartRef();
  }

  private scheduleSyncMcbPanel(): void {
    if (!this.mcbChartData?.datasets?.length) return;
    this.raf(() => {
      this.raf(() => this.syncMcbPanelFromMainChart());
    });
  }

  /** Runtime-only x-range sync after live data refresh (not on fresh load). */
  private scheduleMcbTimeRangeSync(): void {
    if (!this.mcbChartData?.datasets?.length) return;
    this.raf(() => {
      const mainRef = this.chart?.chart as any;
      if (!this.hasMainChartXRange(mainRef)) return;
      this.linkedScale.syncMcbFromMain(mainRef, this.getMcbChartJsRef());
    });
  }

  private syncMcbPanelFromMainChart(): void {
    if (this.destroyed) return;
    const mainRef = this.chart?.chart as any;
    const mcbRef = this.getMcbChartJsRef();
    if (!mainRef?.scales?.x || !mcbRef?.scales?.x || !mainRef.chartArea) {
      if (this._syncMcbTries++ < 30)
        this.raf(() => this.syncMcbPanelFromMainChart());
      return;
    }
    this._syncMcbTries = 0;
    if (mcbRef) this.linkedScale.registerMcbChart(mcbRef);
    const synced = this.linkedScale.syncLinkedCharts(mainRef, mcbRef);
    if (!synced) return;

    this.linkedRightAxisWidthPx = synced.rightAxisWidthPx;
    this.cdr.markForCheck();
  }
}
