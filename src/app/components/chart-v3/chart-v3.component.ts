import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  BaseChartDirective,
  provideCharts,
  withDefaultRegisterables,
} from 'ng2-charts';
import { FooterComponent } from '../footer/footer.component';
import { ChartBaseComponent } from '../chart/chart-base.component';
import { ChartPriceTickerService } from '../chart/services/chart-price-ticker.service';
import { AppService } from '../../modules/shared/services/services/appService';
import { SymbolIconSrcPipe } from '../chart/pipes/symbol-icon-src.pipe';

const DIVERGENCES_STORAGE_KEY = 'chartV3.showDivergences';

@Component({
  selector: 'app-chart-v3',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseChartDirective,
    TranslateModule,
    FooterComponent,
    SymbolIconSrcPipe,
  ],
  providers: [
    provideCharts(withDefaultRegisterables()),
    ChartPriceTickerService,
  ],
  templateUrl: './chart-v3.component.html',
  styleUrls: [
    '../chart/chart-base.toolbar.scss',
    '../chart/chart-base.panels.scss',
    '../web-chart/web-chart.component.scss',
    './chart-v3.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ChartV3Component extends ChartBaseComponent {
  /** First visit (no exchange stored yet) defaults to Bybit on this page. */
  protected override readonly defaultExchangeName = 'Bybit';

  /** Fixed simple defaults; never reads or overwrites the /chart selections on this device. */
  protected override readonly usesDeviceChartSettings = false;

  /** /Divergences is admin-only, so the toggle is only offered to admins. */
  canShowDivergences = false;
  private divergencesPreferred = readDivergencesPreference();
  private readonly appService = inject(AppService);

  constructor(cdr: ChangeDetectorRef) {
    super(cdr);
    this.enforceSimpleChartDefaults();
  }

  override ngOnInit(): void {
    this.enforceSimpleChartDefaults();
    super.ngOnInit();
    this.appService.isAdmin().subscribe((isAdmin) => {
      this.canShowDivergences = isAdmin;
      const show = isAdmin && this.divergencesPreferred;
      if (show === this.showDivergences) return;
      this.showDivergences = show;
      this.reloadSignalOverlays();
      this.cdr.markForCheck();
    });
  }

  /** Local toggle: does not persist into the shared /chart state. */
  onToggleDivergencesV3(): void {
    this.showDivergences = this.canShowDivergences && !this.showDivergences;
    this.divergencesPreferred = this.showDivergences;
    try {
      localStorage.setItem(DIVERGENCES_STORAGE_KEY, String(this.showDivergences));
    } catch {}
    if (this.showDivergences) {
      this.showDivergencesFromCacheOrLoad();
    } else {
      this.safeUpdateDatasets(() => this.applyDivergenceDatasets());
    }
  }

  override loadChartStateForCurrentContext(): void {
    this.drawingTools.setDrawings([]);
    this.enforceSimpleChartDefaults();
  }

  private enforceSimpleChartDefaults(): void {
    this.showBoxes = true;
    this.boxMode = 'all';
    this.showOrders = false;
    this.showKeyZones = false;
    this.showIndicators = false;
    this.showMarketCipher = false;
    this.showDivergences = this.canShowDivergences && this.divergencesPreferred;
    this.showSettings = false;
    this.drawingTools.toolboxOpen = false;
    this.drawingTools.cancelDrawing();
  }
}

function readDivergencesPreference(): boolean {
  try {
    return localStorage.getItem(DIVERGENCES_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}
