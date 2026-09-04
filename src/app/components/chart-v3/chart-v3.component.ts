import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import {
  BaseChartDirective,
  provideCharts,
  withDefaultRegisterables,
} from 'ng2-charts';
import { FooterComponent } from '../footer/footer-compenent';
import { WebChartBaseComponent } from '../web-chart/web-chart-base.component';

@Component({
  selector: 'app-chart-v3',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseChartDirective,
    TranslateModule,
    FooterComponent,
  ],
  providers: [provideCharts(withDefaultRegisterables())],
  templateUrl: './chart-v3.component.html',
  styleUrls: [
    '../web-chart/web-chart.component.scss',
    './chart-v3.component.scss',
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ChartV3Component extends WebChartBaseComponent {
  constructor(cdr: ChangeDetectorRef) {
    super(cdr);
    this.enforceSimpleChartDefaults();
  }

  override ngOnInit(): void {
    this.enforceSimpleChartDefaults();
    super.ngOnInit();
  }

  override loadChartStateForCurrentContext(): void {
    this.drawingTools.setDrawings([]);
    this.enforceSimpleChartDefaults();
  }

  private enforceSimpleChartDefaults(): void {
    this.showBoxes = true;
    this.boxMode = 'boxes';
    this.showOrders = false;
    this.showKeyZones = false;
    this.showIndicators = false;
    this.showMarketCipher = false;
    this.showDivergences = false;
    this.showSettings = false;
    this.drawingTools.toolboxOpen = false;
    this.drawingTools.cancelDrawing();
  }
}