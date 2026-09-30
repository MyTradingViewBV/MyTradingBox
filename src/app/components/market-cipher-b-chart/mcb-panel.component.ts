import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  input,
} from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { McbSideValue } from './mcb-indicator';

/**
 * Market Cipher B oscillator panel rendered below the main candlestick chart
 * (via ChartBaseComponent.auxPanel). Purely presentational: the page component
 * computes the datasets and keeps the x-range linked to the main chart.
 */
@Component({
  selector: 'app-mcb-panel',
  standalone: true,
  imports: [BaseChartDirective, DecimalPipe],
  template: `
    <div class="mcb-panel" [style.--linked-axis-width.px]="axisWidthPx()">
      <div class="mcb-panel__title">Market Cipher B</div>
      <div class="mcb-panel__body">
        <div class="mcb-plot">
          <canvas baseChart [data]="chartData()" [options]="chartOptions()" [type]="'line'" #mcbCanvas data-linked-panel="mcb"></canvas>
        </div>
        <div class="mcb-axis-gutter">
          <div class="mcb-side-values">
            @for (row of sideValues(); track row.key) {
              <div class="mcb-side-value" [style.background]="row.color">
                {{ row.value | number:'1.1-1' }}
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./mcb-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McbPanelComponent {
  readonly chartData = input.required<any>();
  readonly chartOptions = input.required<any>();
  readonly sideValues = input<McbSideValue[]>([]);
  readonly axisWidthPx = input(72);

  @ViewChild('mcbCanvas', { read: BaseChartDirective }) chart?: BaseChartDirective;
  @ViewChild('mcbCanvas', { read: ElementRef }) canvasEl?: ElementRef<HTMLCanvasElement>;
}
