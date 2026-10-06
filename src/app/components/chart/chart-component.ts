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

/** Mobile-first candlestick chart page (/chart, /chart/:symbol[/:timeframe]). */
@Component({
  selector: 'app-chart',
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
export class ChartComponent extends ChartBaseComponent {
  /** /chart loads the boxes of the selected timeframe (other pages use the 1d boxes). */
  protected override readonly boxesUseSelectedTimeframe = true;

  constructor(cdr: ChangeDetectorRef) {
    super(cdr);
  }
}
