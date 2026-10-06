import { Pipe, PipeTransform } from '@angular/core';
import { WebTestOrderSide } from 'src/app/modules/shared/models/orders/web-test-order.model';

/**
 * Profit as a signed percentage of the leveraged entry, e.g. "(+1.23%)".
 * Empty when there is no entry price. `leverage === undefined` falls back to
 * `fallbackLeverage` (the draft's leverage) — matching the panel's former
 * default parameter; any other value is used as given (min 1).
 */
export function profitPct(
  profit: number,
  startPrice: number,
  leverage: number | undefined,
  fallbackLeverage?: number,
): string {
  const lev = leverage === undefined ? Number(fallbackLeverage) || 1 : leverage;
  if (!startPrice) return '';
  const denominator = startPrice * Math.max(1, lev);
  const pct = denominator ? (profit / denominator) * 100 : 0;
  return `(${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
}

/** Price move in the trade's favour (positive) for the given side. */
export function directionalMove(entry: number, target: number, side: WebTestOrderSide): number {
  return side === 'short' ? entry - target : target - entry;
}

export function oppositeSide(side: WebTestOrderSide): WebTestOrderSide {
  return side === 'short' ? 'long' : 'short';
}

/**
 * Reward:risk of an order (take-profit distance / stop-loss distance, both
 * clamped at 0). A missing stop loss means no risk → 0; side defaults to long.
 */
export function rrRatio(
  startPrice: number,
  stopPrice: number,
  stopLoss: number | null | undefined,
  side: WebTestOrderSide | null | undefined,
): number {
  const s = side ?? 'long';
  const reward = Math.max(0, directionalMove(startPrice, stopPrice, s));
  const risk = Math.max(0, directionalMove(startPrice, stopLoss ?? startPrice, oppositeSide(s)));
  if (!risk) return 0;
  return reward / risk;
}

/** `{{ order.expectedProfit | profitPct: order.startPrice : order.leverage : draft.leverage }}` */
@Pipe({ name: 'profitPct', pure: true })
export class ProfitPctPipe implements PipeTransform {
  transform(
    profit: number,
    startPrice: number,
    leverage: number | undefined,
    fallbackLeverage?: number,
  ): string {
    return profitPct(profit, startPrice, leverage, fallbackLeverage);
  }
}

/**
 * `{{ order.startPrice | rrRatio: order.stopPrice : order.stopLoss : order.side }}` —
 * takes the primitive fields (not the order object) so in-place edits of an
 * order still recompute.
 */
@Pipe({ name: 'rrRatio', pure: true })
export class RrRatioPipe implements PipeTransform {
  transform(
    startPrice: number,
    stopPrice: number,
    stopLoss: number | null | undefined,
    side: WebTestOrderSide | null | undefined,
  ): number {
    return rrRatio(startPrice, stopPrice, stopLoss, side);
  }
}
