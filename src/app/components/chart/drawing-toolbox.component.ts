import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DrawingToolsService, DrawingToolType } from './services/drawing-tools.service';

@Component({
  selector: 'app-drawing-toolbox',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toolbox-section-title">Lijnen</div>

    <button class="tool-btn" [class.selected]="service.activeToolValue === 'horizontal-line'"
      (click)="selectTool('horizontal-line')" title="Horizontale lijn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="12" x2="21" y2="12"/>
      </svg>
      <span>Horizontaal</span>
    </button>

    <button class="tool-btn" [class.selected]="service.activeToolValue === 'vertical-line'"
      (click)="selectTool('vertical-line')" title="Verticale lijn">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="3" x2="12" y2="21"/>
      </svg>
      <span>Verticaal</span>
    </button>

    <div class="toolbox-divider"></div>
    <div class="toolbox-section-title">Fibonacci</div>

    <button class="tool-btn" [class.selected]="service.activeToolValue === 'fib-retracement'"
      (click)="selectTool('fib-retracement')" title="Fibonacci Retracement">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <line x1="2" y1="5" x2="22" y2="5" stroke-opacity="0.5"/>
        <line x1="2" y1="9" x2="22" y2="9" stroke-opacity="0.7"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="2" y1="15" x2="22" y2="15" stroke-opacity="0.7"/>
        <line x1="2" y1="19" x2="22" y2="19" stroke-opacity="0.5"/>
      </svg>
      <span>Fib Retracement</span>
    </button>

    <button class="tool-btn" [class.selected]="service.activeToolValue === 'fib-extension'"
      (click)="selectTool('fib-extension')" title="Fibonacci Extension">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <polyline points="4,18 10,6 16,14" stroke-dasharray="3,2"/>
        <line x1="2" y1="4" x2="22" y2="4" stroke-opacity="0.5"/>
        <line x1="2" y1="10" x2="22" y2="10" stroke-opacity="0.7"/>
        <line x1="2" y1="16" x2="22" y2="16" stroke-opacity="0.7"/>
        <line x1="2" y1="21" x2="22" y2="21" stroke-opacity="0.5"/>
      </svg>
      <span>Fib Extension</span>
    </button>

    @if (service.drawingsValue.length) {
      <div class="toolbox-divider"></div>
      <button class="tool-btn danger" (click)="clearAll()" title="Verwijder alle tekeningen">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        <span>Alles wissen</span>
      </button>
    }
  `,
  styles: [`
    :host {
      position: absolute;
      right: 16px;
      bottom: calc(38px + 8px);
      z-index: 25;
      min-width: 200px;
      border-radius: 10px;
      padding: 10px 8px;
      box-shadow: 0 4px 24px 0 rgba(0, 0, 0, 0.45);
      border: 1px solid #222;
      background: #181a20;
      color: #eee;
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 13px;
      animation: fadeInPanel 0.18s ease;
    }

    @keyframes fadeInPanel {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .toolbox-section-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      padding: 4px 8px 2px;
    }

    .toolbox-divider {
      height: 1px;
      background: rgba(255,255,255,0.08);
      margin: 4px 6px;
    }

    .tool-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      color: #d1d5db;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .tool-btn:hover {
      background: rgba(255,255,255,0.06);
      color: #fff;
    }
    .tool-btn.selected {
      background: rgba(41, 98, 255, 0.2);
      border-color: rgba(41, 98, 255, 0.4);
      color: #60a5fa;
    }
    .tool-btn.danger {
      color: #f87171;
    }
    .tool-btn.danger:hover {
      background: rgba(248,113,113,0.12);
    }
    .tool-btn svg {
      flex-shrink: 0;
    }

    @media (max-width: 480px) {
      :host {
        left: 8px;
        right: 8px;
        min-width: auto;
      }
    }
  `],
})
export class DrawingToolboxComponent {
  readonly service = inject(DrawingToolsService);

  selectTool(tool: DrawingToolType): void {
    if (this.service.activeToolValue === tool) {
      this.service.cancelDrawing();
    } else {
      this.service.selectTool(tool);
    }
  }

  clearAll(): void {
    this.service.clearAllDrawings();
  }
}
