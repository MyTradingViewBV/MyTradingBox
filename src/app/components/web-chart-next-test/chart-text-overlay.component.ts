import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

export type ElliottWaveScenario = {
  label: string;
  confidence: number;
  direction: 'bull' | 'bear';
  invalidationPrice: number | null;
};

@Component({
  selector: 'app-chart-text-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (scenarios.length) {
      <div class="wave-text-overlay">
        <div class="wave-title">Elliott Wave</div>
        <div class="wave-sub">{{ symbol || '-' }} · {{ timeframe || '-' }}</div>

        @for (scenario of scenarios; track $index) {
          <div class="wave-row">
            <span class="wave-rank">#{{ $index + 1 }}</span>
            <span class="wave-label">{{ scenario.label }}</span>
            <span
              class="wave-conf"
              [class.high]="scenario.confidence >= 0.75"
              [class.mid]="scenario.confidence >= 0.5 && scenario.confidence < 0.75"
              [class.low]="scenario.confidence < 0.5"
            >
              {{ scenario.confidence * 100 | number: '1.0-0' }}%
            </span>
          </div>
        }

        @if (scenarios[0].invalidationPrice != null) {
          <div class="wave-invalid">
            Invalidation: {{ scenarios[0].invalidationPrice | number: '1.2-8' }}
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .wave-text-overlay {
        position: absolute;
        top: 56px;
        left: 10px;
        z-index: 7;
        min-width: 220px;
        max-width: 320px;
        background: rgba(16, 18, 24, 0.84);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px;
        padding: 8px 10px;
        color: #e5e7eb;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      .wave-title {
        font-weight: 700;
        font-size: 12px;
      }

      .wave-sub {
        font-size: 11px;
        opacity: 0.78;
        margin-bottom: 6px;
      }

      .wave-row {
        display: flex;
        gap: 8px;
        align-items: center;
        margin: 3px 0;
        font-size: 12px;
      }

      .wave-rank {
        opacity: 0.75;
        width: 22px;
      }

      .wave-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .wave-conf.high {
        color: #22c55e;
      }

      .wave-conf.mid {
        color: #f59e0b;
      }

      .wave-conf.low {
        color: #ef4444;
      }

      .wave-invalid {
        margin-top: 6px;
        font-size: 11px;
        opacity: 0.85;
      }
    `,
  ],
})
export class ChartTextOverlayComponent {
  @Input() symbol = '';
  @Input() timeframe = '';
  @Input() scenarios: ElliottWaveScenario[] = [];
}
