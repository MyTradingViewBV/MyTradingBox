import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import type { CapitalFlowTier } from 'src/app/modules/shared/models/chart/chart-state.dto';
import type { ChartBaseComponent } from '../chart-base.component';
import { KeyZoneTimeframeEnabledPipe, KeyZoneTimeframeLabelPipe } from '../pipes/key-zone-timeframe.pipes';

/**
 * Chart settings panel shared by every chart page. All state and handlers live
 * on the host chart; this component only renders them. The host element is the
 * overlay (`class="settings-panel-overlay"`), positioned by the page styles.
 */
@Component({
  selector: 'app-chart-settings-panel',
  standalone: true,
  imports: [FormsModule, TranslateModule, KeyZoneTimeframeLabelPipe, KeyZoneTimeframeEnabledPipe],
  templateUrl: './chart-settings-panel.component.html',
  styleUrls: ['./chart-settings-panel.component.scss'],
  // Reads the host chart's mutable fields, so it is checked with its host.
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class ChartSettingsPanelComponent {
  @Input({ required: true }) chart!: ChartBaseComponent;
  /** Web layout: permanently docked left of the chart (TradingView style), so it cannot be closed. */
  @Input() docked = false;

  readonly tiers: ReadonlyArray<{ key: CapitalFlowTier; labelKey: string; color: string }> = [
    { key: 'bronze', labelKey: 'CHART.BRONZE', color: '#cd7f32' },
    { key: 'silver', labelKey: 'CHART.SILVER', color: '#c0c0c0' },
    { key: 'gold', labelKey: 'CHART.GOLD', color: '#f6ad55' },
    { key: 'platinum', labelKey: 'CHART.PLATINUM', color: '#e5e4e2' },
  ];

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }
}
