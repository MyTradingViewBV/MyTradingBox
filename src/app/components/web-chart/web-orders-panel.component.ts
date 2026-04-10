import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WebTestOrder, WebTestOrderDraft } from 'src/app/modules/shared/models/orders/web-test-order.model';

@Component({
  selector: 'app-web-orders-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './web-orders-panel.component.html',
  styleUrls: ['./web-orders-panel.component.scss'],
})
export class WebOrdersPanelComponent implements OnInit, OnChanges {
  @Input() orders: WebTestOrder[] = [];
  @Input() symbol = '';
  @Input() currentPrice: number = 0;
  @Input() mode: 'add' | 'table' = 'table';
  @Output() close = new EventEmitter<void>();
  @Output() upsert = new EventEmitter<WebTestOrderDraft>();
  @Output() selectOrder = new EventEmitter<WebTestOrder>();
  @Output() toggleVisibility = new EventEmitter<WebTestOrder>();

  editingOrderId: number | null = null;
  viewMode: 'add' | 'table' = 'table';
  draft: WebTestOrderDraft = this.newDraft();

  get priceDiff(): number {
    const start = Number(this.draft.startPrice) || 0;
    const stop = Number(this.draft.stopPrice) || 0;
    return stop - start;
  }

  get leveragedDiff(): number {
    const leverage = Number(this.draft.leverage) || 1;
    return this.priceDiff * leverage;
  }

  ngOnInit(): void {
    this.viewMode = this.mode;
    if (this.currentPrice > 0) {
      this.draft.startPrice = this.currentPrice;
      this.draft.stopPrice = this.currentPrice;
      this.draft.stopLoss = this.currentPrice;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode']) {
      this.viewMode = this.mode;
      if (this.viewMode === 'add' && this.editingOrderId == null) {
        this.startAdd();
      }
    }
  }

  showAddMode(): void {
    this.viewMode = 'add';
    if (this.editingOrderId == null) {
      this.startAdd();
    }
  }

  showTableMode(): void {
    this.viewMode = 'table';
  }

  startAdd(): void {
    this.editingOrderId = null;
    this.draft = this.newDraft();
    if (this.currentPrice > 0) {
      this.draft.startPrice = this.currentPrice;
      this.draft.stopPrice = this.currentPrice;
      this.draft.stopLoss = this.currentPrice;
    }
    this.onPriceChange();
  }

  profitPct(profit: number, startPrice: number): string {
    if (!startPrice) return '';
    const pct = (profit / startPrice) * 100;
    return `(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
  }

  onPriceChange(): void {
    const diff = this.leveragedDiff;
    if (diff !== Number(this.draft.expectedProfit)) {
      this.draft.expectedProfit = diff;
    }
  }

  startEdit(order: WebTestOrder): void {
    this.editingOrderId = order.id;
    this.draft = {
      id: order.id,
      startPrice: order.startPrice,
      stopPrice: order.stopPrice,
      leverage: order.leverage ?? 1,
      stopLoss: order.stopLoss ?? order.startPrice,
      startDate: order.startDate,
      stopDate: order.stopDate,
      expectedProfit: order.expectedProfit,
      currentProfit: order.currentProfit,
      status: order.status,
    };
  }

  save(): void {
    if (!Number.isFinite(Number(this.draft.startPrice))) return;
    if (!Number.isFinite(Number(this.draft.stopPrice))) return;
    if (!Number.isFinite(Number(this.draft.stopLoss))) return;
    if (!Number.isFinite(Number(this.draft.leverage))) return;
    if (!Number.isFinite(Number(this.draft.expectedProfit))) return;
    if (!Number.isFinite(Number(this.draft.currentProfit))) return;
    this.upsert.emit({
      ...this.draft,
      id: this.editingOrderId ?? undefined,
      startPrice: Number(this.draft.startPrice),
      stopPrice: Number(this.draft.stopPrice),
      leverage: Number(this.draft.leverage),
      stopLoss: Number(this.draft.stopLoss),
      expectedProfit: Number(this.draft.expectedProfit),
      currentProfit: Number(this.draft.currentProfit),
    });
    this.startAdd();
    this.viewMode = 'table';
  }

  private newDraft(): WebTestOrderDraft {
    const now = new Date().toISOString().slice(0, 16);
    return {
      startPrice: this.currentPrice > 0 ? this.currentPrice : 0,
      stopPrice: this.currentPrice > 0 ? this.currentPrice : 0,
      leverage: 1,
      stopLoss: this.currentPrice > 0 ? this.currentPrice : 0,
      startDate: now,
      stopDate: now,
      expectedProfit: 0,
      currentProfit: 0,
      status: 'actief',
    };
  }
}
