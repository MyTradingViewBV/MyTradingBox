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
import { Chart } from 'chart.js';
import { Observable, Subscription, take } from 'rxjs';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { FooterComponent } from '../footer/footer.component';
import {
  ChartAuxPanel,
  ChartAuxPanelSettings,
  ChartBaseComponent,
} from '../chart/chart-base.component';
import { DrawingToolboxComponent } from '../chart/drawing-toolbox.component';
import { ChartLinkedScaleService } from '../chart/services/chart-linked-scale.service';
import { ChartPriceTickerService } from '../chart/services/chart-price-ticker.service';
import { formatPriceChange } from '../chart/utils/chart-utils';
import { InternalCandle } from '../chart/utils/custom-timeframe-live';
import { timeframeToMilliseconds } from '../chart/utils/timeframe-bucketing';
import { applyTimeTicks, formatTimeAxisLabel } from '../chart/utils/axis-ticks';
import { ChartSettingsSnapshot } from 'src/app/modules/shared/models/chart/chart-state.dto';
import {
  buildMcbPanelData,
  MCB_DEFAULT_VISIBILITY,
  MCB_VISIBILITY_OPTIONS,
  McbSideValue,
  McbVisibility,
  normalizeMcbVisibility,
} from './mcb-indicator';
import { McbPanelComponent, McbPlotHost } from './mcb-panel.component';
import {
  buildPredictionDatasets,
  findTimeframePrediction,
  mapPredictionLines,
  McbOscSeries,
  mcbPredictionLabelPlugin,
  parseTimeframeResults,
  TimeframePrediction,
} from './mcb-prediction-lines';

/** The bot recomputes on every live tick; refresh the lines this often. */
const PREDICTIONS_REFRESH_MS = 30_000;

Chart.register(mcbPredictionLabelPlugin);

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

  @ViewChild(NgComponentOutlet) private auxPanelOutlet?: NgComponentOutlet;

  mcbChartData: any = { datasets: [] };
  mcbSideValues: McbSideValue[] = [];
  /** Which MCB parts are drawn; persisted with the chart state (settings.mcb). */
  mcbVisibility: McbVisibility = { ...MCB_DEFAULT_VISIBILITY };
  private _mcbSettings: ChartAuxPanelSettings = this.buildMcbSettings();
  mcbChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    // Live ticks redraw in place (TradingView-like) instead of animating the lines in again.
    animation: false,
    // Pointer gestures are handled by the panel (shared crosshair); no Chart.js hover points.
    events: [],
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
      drawingTools: false,
      // The logo watermark belongs to the main chart only.
      watermark: false,
    },
    elements: {
      line: { tension: 0.25 },
      point: { radius: 0 },
    },
    scales: {
      x: {
        type: 'time',
        display: true,
        // Edge tick labels must not shrink the plot area, or it no longer
        // lines up with the main chart (alignment comes from layout padding).
        afterFit: (scale: any) => {
          scale.paddingLeft = 0;
          scale.paddingRight = 0;
        },
        grid: {
          color: 'rgba(42,46,57,0.35)',
          drawBorder: false,
        },
        // Same round-boundary ticks as the main chart's time axis.
        afterBuildTicks: (scale: any) =>
          applyTimeTicks(scale, timeframeToMilliseconds(this.selectedTimeframe || '1h')),
        ticks: {
          source: 'auto',
          callback: (val: any) => this.formatMcbTimeTick(val),
          color: '#787b86',
          maxRotation: 0,
          autoSkip: false,
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
      padding: { top: 4, right: 0, bottom: 2, left: 10 },
    },
  };

  private readonly linkedScale = inject(ChartLinkedScaleService);
  private readonly chartService = inject(ChartService);
  /** DivPredictionBot results for `_predictionsKey` (symbol|timeframe). */
  private _predictions: TimeframePrediction | null = null;
  private _predictionsKey = '';
  private _predictionsSub?: Subscription;
  private _predictionsTimer: ReturnType<typeof setInterval> | null = null;
  /** Signature of the prediction lines on the main chart, to skip redundant updates. */
  private _pricePredictionSig = '';
  private _syncMcbTries = 0;
  private _viewportTries = 0;
  private _mcbRebuildRaf: number | null = null;
  /** Pending requestAnimationFrame ids (viewport/sync retries), cancelled on destroy. */
  private readonly _pendingRafs = new Set<number>();
  linkedRightAxisWidthPx = 72;
  /**
   * Gestures on the MCB plot act on the main chart (the panel follows via the
   * linked x-range), so both panes pan, zoom and share one crosshair like
   * TradingView panes.
   */
  private readonly mcbPlotHost: McbPlotHost = {
    wheel: (event) =>
      this.onWheel(event, this.interaction.xValueAtClientX(this.getMcbChartJsRef(), event.clientX)),
    crosshair: (clientX, clientY) => {
      const main = this.chart?.chart as any;
      if (!main) return;
      if (clientX == null || clientY == null) {
        if (!this.interaction.isCrosshairPinned) this.interaction.hideCrosshair(main);
        return;
      }
      this.interaction.showCrosshairAt(main, clientX, clientY);
    },
    dismissCrosshair: () => this.interaction.hideCrosshair(this.chart?.chart as any),
    isCrosshairPinned: () => this.interaction.isCrosshairPinned,
    pinCrosshair: () => this.interaction.pinCrosshair(),
    panStart: () => this.interaction.beginLinkedPan(this.chart?.chart as any),
    panBy: (deltaXPx) => this.interaction.linkedPanBy(deltaXPx, this.chart?.chart as any),
    panEnd: () => {
      this.interaction.endLinkedPan(this.chart?.chart as any);
      this.onViewportChanged();
    },
    zoomBy: (factor, clientX) => {
      const main = this.chart?.chart as any;
      if (!main || this.interaction.isCrosshairPinned) return;
      const anchor = clientX == null ? null : this.interaction.xValueAtClientX(main, clientX);
      this.interaction.zoomHorizontal(factor, main, anchor);
    },
    zoomToLatest: () => this.zoomToLatestCandle(),
  };
  /** Main-chart crosshair moves are mirrored into the MCB pane. */
  private readonly onCrosshairChanged = (time: number | null, clientY: number | null) =>
    this.mcbPanel?.setCrosshair(time, clientY);

  constructor(cdr: ChangeDetectorRef) {
    super(cdr);
    // TradingView panes: the crosshair follows the mouse and spans both charts.
    this.interaction.hoverCrosshair = true;
    this.interaction.onCrosshairChanged = this.onCrosshairChanged;
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
        host: this.mcbPlotHost,
      },
    };
  }

  override get auxPanelSettings(): ChartAuxPanelSettings {
    return this._mcbSettings;
  }

  protected override applyAuxPanelSetting(key: string, enabled: boolean): void {
    if (!(key in this.mcbVisibility)) return;
    this.setMcbVisibility({ ...this.mcbVisibility, [key]: enabled });
  }

  protected override auxPanelSettingsSnapshot(): Partial<ChartSettingsSnapshot> {
    return { mcb: { ...this.mcbVisibility } };
  }

  protected override restoreAuxPanelSettings(settings: Partial<ChartSettingsSnapshot>): void {
    this.setMcbVisibility(normalizeMcbVisibility(settings.mcb));
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    // ChartInteractionService is app-wide; don't leave this page's crosshair mode behind.
    if (this.interaction.onCrosshairChanged === this.onCrosshairChanged) {
      this.interaction.onCrosshairChanged = undefined;
      this.interaction.hoverCrosshair = false;
    }
    if (this._mcbRebuildRaf != null) {
      cancelAnimationFrame(this._mcbRebuildRaf);
      this._mcbRebuildRaf = null;
    }
    this._pendingRafs.forEach((id) => cancelAnimationFrame(id));
    this._pendingRafs.clear();
    this._predictionsSub?.unsubscribe();
    if (this._predictionsTimer != null) clearInterval(this._predictionsTimer);
    this._predictionsTimer = null;
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
    this.loadPredictions();
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

  private buildMcbSettings(): ChartAuxPanelSettings {
    return {
      titleKey: 'CHART.MARKET_CIPHER_B',
      items: MCB_VISIBILITY_OPTIONS.map((o) => ({ ...o, enabled: this.mcbVisibility[o.key] })),
    };
  }

  private setMcbVisibility(visibility: McbVisibility): void {
    const changed = (Object.keys(visibility) as Array<keyof McbVisibility>).some(
      (k) => visibility[k] !== this.mcbVisibility[k],
    );
    if (!changed) return;
    const loadPredictions = visibility.predictionLines && !this.mcbVisibility.predictionLines;
    this.mcbVisibility = visibility;
    this._mcbSettings = this.buildMcbSettings();
    if (loadPredictions) this.loadPredictions();
    // Rebuild + re-sync the linked x-range (same path as a live candle update).
    if (this.baseData?.length) this.flushLiveRenderAux();
    this.cdr.markForCheck();
  }

  private rebuildMcbPanelDatasets(candles: any[]): void {
    const panel = buildMcbPanelData(candles, this.mcbVisibility);
    const lines = this.currentPredictionLines(candles, panel?.series);
    if (panel && lines.length) {
      panel.chartData.datasets.push(...buildPredictionDatasets(lines, 'osc'));
    }
    this.mcbChartData = panel?.chartData ?? { datasets: [] };
    this.mcbSideValues = panel?.sideValues ?? [];
    this.updatePricePredictionDatasets(buildPredictionDatasets(lines, 'price'));
    this.cdr.markForCheck();
  }

  // ── DivPredictionBot divergence lines ────────────────────────────────────

  private predictionsContextKey(): string {
    return `${this.selectedSymbol?.SymbolName ?? ''}|${this.selectedTimeframe}`;
  }

  /** Lines for the current symbol/timeframe, or none (hidden, other context, no data). */
  private currentPredictionLines(candles: any[], osc?: McbOscSeries | null) {
    if (!this.mcbVisibility.predictionLines) return [];
    if (this._predictionsKey !== this.predictionsContextKey()) return [];
    return mapPredictionLines(this._predictions, candles, osc);
  }

  /** Fetch the bot's lines for the current selection and keep them refreshed. */
  private loadPredictions(): void {
    const symbol = this.selectedSymbol?.SymbolName;
    const key = this.predictionsContextKey();
    if (key !== this._predictionsKey) {
      this._predictions = null;
      this._predictionsKey = '';
    }
    if (this._predictionsTimer == null && !this.destroyed) {
      this._predictionsTimer = setInterval(() => this.loadPredictions(), PREDICTIONS_REFRESH_MS);
    }
    this._predictionsSub?.unsubscribe();
    if (!symbol || !this.mcbVisibility.predictionLines) return;
    this._predictionsSub = this.chartService
      .getSymbolPredictions(symbol)
      .pipe(take(1))
      .subscribe((response) => {
        if (this.destroyed || key !== this.predictionsContextKey()) return;
        this._predictions = findTimeframePrediction(
          parseTimeframeResults(response),
          this.selectedTimeframe,
        );
        this._predictionsKey = key;
        if (this.baseData?.length) this.rebuildMcbPanelDatasets(this.baseData);
      });
  }

  /** Replace the prediction lines on the main chart (redraws only when they changed). */
  private updatePricePredictionDatasets(datasets: any[]): void {
    const sig = JSON.stringify(datasets.map((d) => [d.data, d.borderColor, d.mcbPredLabel]));
    const present = !!this.chartData?.datasets?.some((d: any) => d.isMcbPrediction);
    if (sig === this._pricePredictionSig && present === datasets.length > 0) return;
    if (!this.chartData?.datasets?.length) return;
    this._pricePredictionSig = sig;
    this.safeUpdateDatasets(() => {
      this.chartData.datasets = this.chartData.datasets
        .filter((d: any) => !d.isMcbPrediction)
        .concat(datasets);
    });
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
          this.zoomToRecent();
        } catch (err) {
          console.warn('[Chart] zoomToRecent failed after candle load', err);
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

  private formatMcbTimeTick(val: any): string {
    const ms = Number(val);
    if (!val || !Number.isFinite(ms)) return '';
    const dateOnly = timeframeToMilliseconds(this.selectedTimeframe || '1h') >= 86_400_000;
    return formatTimeAxisLabel(ms, dateOnly);
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
