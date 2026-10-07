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
import { FooterComponent } from '../footer/footer.component';
import { ChartBaseComponent } from './chart-base.component';
import { DrawingToolboxComponent } from './drawing-toolbox.component';
import { ChartPriceTickerService } from './services/chart-price-ticker.service';
import { SymbolIconSrcPipe } from './pipes/symbol-icon-src.pipe';
import { ChartSettingsPanelComponent } from './settings-panel/chart-settings-panel.component';

/**
 * Test-only host for ChartBaseComponent specs: the full shared template with
 * timeframe-scoped boxes, without the MCB panel of /mcb-chart.
 */
@Component({
  selector: 'app-chart-base-test-host',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BaseChartDirective,
    DrawingToolboxComponent,
    TranslateModule,
    FooterComponent,
    SymbolIconSrcPipe,
    ChartSettingsPanelComponent,
  ],
  providers: [
    provideCharts(withDefaultRegisterables()),
    ChartPriceTickerService,
  ],
  templateUrl: './chart-base.component.html',
  styleUrls: ['./chart-base.toolbar.scss', './chart-base.panels.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartBaseTestHostComponent extends ChartBaseComponent {
  protected override readonly boxesUseSelectedTimeframe = true;

  constructor(cdr: ChangeDetectorRef) {
    super(cdr);
  }
}
