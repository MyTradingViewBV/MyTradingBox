import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WebTestOrder, WebTestOrderDraft, WebTestOrderSide } from 'src/app/modules/shared/models/orders/web-test-order.model';

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
  @Input() priceHistory: Array<{ x: number; c: number }> = [];
  @Input() mode: 'add' | 'table' = 'table';
  @Output() close = new EventEmitter<void>();
  @Output() upsert = new EventEmitter<WebTestOrderDraft>();
  @Output() selectOrder = new EventEmitter<WebTestOrder>();
  @Output() toggleVisibility = new EventEmitter<WebTestOrder>();

  editingOrderId: number | null = null;
  viewMode: 'add' | 'table' = 'table';
  draft: WebTestOrderDraft = this.newDraft();
  useStartDatePrice = false;
  useStopDatePrice = false;
  useStopLossPct = false;
  stopLossPct = 0;

  get priceDiff(): number {
    const start = Number(this.draft.startPrice) || 0;
    const stop = Number(this.draft.stopPrice) || 0;
    return this.directionalMove(start, stop, this.draft.side);
  }

  get leveragedDiff(): number {
    const leverage = Number(this.draft.leverage) || 1;
    return this.priceDiff * leverage;
  }

  get expectedFeeCost(): number {
    return this.transactionCost(Number(this.draft.startPrice), Number(this.draft.stopPrice));
  }

  get expectedNetPnl(): number {
    return this.leveragedDiff - this.expectedFeeCost;
  }

  get currentGrossPnl(): number {
    const start = Number(this.draft.startPrice) || 0;
    return this.directionalMove(start, this.effectiveCurrentExitPrice, this.draft.side) * (Number(this.draft.leverage) || 1);
  }

  get currentFeeCost(): number {
    return this.transactionCost(Number(this.draft.startPrice), this.effectiveCurrentExitPrice);
  }

  get currentNetPnl(): number {
    return this.currentGrossPnl - this.currentFeeCost;
  }

  get effectiveCurrentExitPrice(): number {
    const stopDateMs = new Date(this.draft.stopDate).getTime();
    const stopPrice = Number(this.draft.stopPrice);
    const stopDateReached = Number.isFinite(stopDateMs) && stopDateMs <= Date.now();
    if (stopDateReached && Number.isFinite(stopPrice)) {
      return stopPrice;
    }
    return Number(this.currentPrice) || 0;
  }

  get isHistoricalEvaluation(): boolean {
    const stopDateMs = new Date(this.draft.stopDate).getTime();
    return Number.isFinite(stopDateMs) && stopDateMs <= Date.now();
  }

  get riskReward(): { risk: number; reward: number } {
    const start = Number(this.draft.startPrice) || 0;
    const stop = Number(this.draft.stopPrice) || 0;
    const stopLoss = Number(this.draft.stopLoss) || start;
    const reward = Math.max(0, this.directionalMove(start, stop, this.draft.side));
    const risk = Math.max(0, this.directionalMove(start, stopLoss, this.oppositeSide(this.draft.side)));
    return { reward, risk };
  }

  get riskRewardRatio(): number {
    const { reward, risk } = this.riskReward;
    return risk > 0 ? reward / risk : 0;
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
    if (changes['currentPrice']) {
      this.onPriceChange();
    }
    if (changes['priceHistory'] && (this.useStartDatePrice || this.useStopDatePrice)) {
      this.onPriceChange();
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
    this.useStartDatePrice = false;
    this.useStopDatePrice = false;
    this.useStopLossPct = false;
    this.stopLossPct = 0;
    this.draft = this.newDraft();
    if (this.currentPrice > 0) {
      this.draft.startPrice = this.currentPrice;
      this.draft.stopPrice = this.currentPrice;
      this.draft.stopLoss = this.currentPrice;
    }
    this.onPriceChange();
  }

  profitPct(profit: number, startPrice: number, leverage: number = Number(this.draft.leverage) || 1): string {
    if (!startPrice) return '';
    const denominator = startPrice * Math.max(1, leverage);
    const pct = denominator ? (profit / denominator) * 100 : 0;
    return `(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
  }

  onPriceChange(): void {
    this.syncDateBasedPrices();
    if (this.useStopLossPct) {
      this.syncStopLossFromPct();
    } else {
      this.syncPctFromStopLoss();
    }
    this.draft.expectedProfit = this.expectedNetPnl;
    this.draft.currentProfit = this.currentNetPnl;
  }

  onStopLossPriceInput(): void {
    this.useStopLossPct = false;
    this.onPriceChange();
  }

  onStopLossPctToggle(): void {
    if (this.useStopLossPct) {
      this.syncStopLossFromPct();
    } else {
      this.syncPctFromStopLoss();
    }
    this.onPriceChange();
  }

  onStopLossPctInput(): void {
    this.useStopLossPct = true;
    this.syncStopLossFromPct();
    this.onPriceChange();
  }

  onDatePriceToggle(kind: 'start' | 'stop'): void {
    if (kind === 'start' && this.useStartDatePrice) {
      const byDate = this.resolvePriceFromDate(this.draft.startDate);
      if (byDate != null) this.draft.startPrice = byDate;
    }
    if (kind === 'stop' && this.useStopDatePrice) {
      const byDate = this.resolvePriceFromDate(this.draft.stopDate);
      if (byDate != null) this.draft.stopPrice = byDate;
    }
    this.onPriceChange();
  }

  onDateChange(kind: 'start' | 'stop'): void {
    if ((kind === 'start' && this.useStartDatePrice) || (kind === 'stop' && this.useStopDatePrice)) {
      this.onPriceChange();
    }
  }

  startEdit(order: WebTestOrder): void {
    this.editingOrderId = order.id;
    this.draft = {
      id: order.id,
      side: order.side ?? 'long',
      startPrice: order.startPrice,
      stopPrice: order.stopPrice,
      leverage: order.leverage ?? 1,
      transactionCostPct: Number(order.transactionCostPct ?? 0.1),
      stopLoss: order.stopLoss ?? order.startPrice,
      startDate: order.startDate,
      stopDate: order.stopDate,
      expectedProfit: order.expectedProfit,
      currentProfit: order.currentProfit,
      status: order.status,
    };
    this.useStartDatePrice = false;
    this.useStopDatePrice = false;
    this.useStopLossPct = false;
    this.syncPctFromStopLoss();
    this.onPriceChange();
  }

  save(): void {
    if (!Number.isFinite(Number(this.draft.startPrice))) return;
    if (!Number.isFinite(Number(this.draft.stopPrice))) return;
    if (!Number.isFinite(Number(this.draft.stopLoss))) return;
    if (!Number.isFinite(Number(this.draft.leverage))) return;
    if (!Number.isFinite(Number(this.draft.transactionCostPct))) return;
    if (!Number.isFinite(Number(this.draft.expectedProfit))) return;
    if (!Number.isFinite(Number(this.draft.currentProfit))) return;
    this.upsert.emit({
      ...this.draft,
      id: this.editingOrderId ?? undefined,
      side: this.draft.side,
      startPrice: Number(this.draft.startPrice),
      stopPrice: Number(this.draft.stopPrice),
      leverage: Number(this.draft.leverage),
      transactionCostPct: Number(this.draft.transactionCostPct),
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
      side: 'long',
      startPrice: this.currentPrice > 0 ? this.currentPrice : 0,
      stopPrice: this.currentPrice > 0 ? this.currentPrice : 0,
      leverage: 1,
      transactionCostPct: 0.1,
      stopLoss: this.currentPrice > 0 ? this.currentPrice : 0,
      startDate: now,
      stopDate: now,
      expectedProfit: 0,
      currentProfit: 0,
      status: 'actief',
    };
  }

  rrRatioForOrder(order: WebTestOrder): number {
    const side = order.side ?? 'long';
    const reward = Math.max(0, this.directionalMove(order.startPrice, order.stopPrice, side));
    const risk = Math.max(0, this.directionalMove(order.startPrice, order.stopLoss ?? order.startPrice, this.oppositeSide(side)));
    if (!risk) return 0;
    return reward / risk;
  }

  private directionalMove(entry: number, target: number, side: WebTestOrderSide): number {
    return side === 'short' ? entry - target : target - entry;
  }

  private oppositeSide(side: WebTestOrderSide): WebTestOrderSide {
    return side === 'short' ? 'long' : 'short';
  }

  private transactionCost(entry: number, exit: number): number {
    const leverage = Number(this.draft.leverage) || 1;
    const feePct = Math.max(0, Number(this.draft.transactionCostPct) || 0.1);
    const feeRate = feePct / 100;
    return (Math.abs(entry) + Math.abs(exit)) * leverage * feeRate;
  }

  private syncStopLossFromPct(): void {
    const entry = Number(this.draft.startPrice);
    const pct = Math.max(0, Number(this.stopLossPct) || 0);
    if (!Number.isFinite(entry) || entry <= 0) return;
    const ratio = pct / 100;
    this.draft.stopLoss = this.draft.side === 'short'
      ? entry * (1 + ratio)
      : entry * (1 - ratio);
  }

  private syncPctFromStopLoss(): void {
    const entry = Number(this.draft.startPrice);
    const stopLoss = Number(this.draft.stopLoss);
    if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(stopLoss)) {
      this.stopLossPct = 0;
      return;
    }
    const move = this.draft.side === 'short'
      ? (stopLoss - entry)
      : (entry - stopLoss);
    this.stopLossPct = Math.max(0, (move / entry) * 100);
  }

  private syncDateBasedPrices(): void {
    if (this.useStartDatePrice) {
      const byDate = this.resolvePriceFromDate(this.draft.startDate);
      if (byDate != null) this.draft.startPrice = byDate;
    }
    if (this.useStopDatePrice) {
      const byDate = this.resolvePriceFromDate(this.draft.stopDate);
      if (byDate != null) this.draft.stopPrice = byDate;
    }
  }

  private resolvePriceFromDate(dateValue: string): number | null {
    if (!dateValue || !this.priceHistory?.length) return null;
    const target = new Date(dateValue).getTime();
    if (!Number.isFinite(target)) return null;

    let best: { x: number; c: number } | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candle of this.priceHistory) {
      const ts = Number(candle?.x);
      const close = Number(candle?.c);
      if (!Number.isFinite(ts) || !Number.isFinite(close)) continue;
      const distance = Math.abs(ts - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x: ts, c: close };
      }
    }

    return best ? Number(best.c) : null;
  }
}
