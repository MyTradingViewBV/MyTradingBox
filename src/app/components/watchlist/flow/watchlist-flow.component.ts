import {
  ChangeDetectionStrategy,
  Component,
  Input,
  OnChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
  BoxTone,
  FlowBox,
  FlowForecast,
  FlowProjection,
  FlowState,
  projectFlow,
  resolveBoxTone,
  selectVisibleBoxes,
} from './flow-forecast';

interface BoxBand {
  y: number;
  height: number;
  tone: BoxTone;
  label: string;
  /** Box is the one the projection runs into. */
  hit: boolean;
}

interface EdgeHint {
  tone: BoxTone;
  price: number;
  pct: number;
}

const VIEW_W = 100;
const VIEW_H = 60;
/** Horizontal position of "now": history left of it, projection right. */
const NOW_X = 62;
const HOURS_AHEAD = 6;

const STATE_KEYS: Record<FlowState, string> = {
  'trend-up': 'WATCHLIST.FLOW.TREND_UP',
  'trend-down': 'WATCHLIST.FLOW.TREND_DOWN',
  'reversal-up': 'WATCHLIST.FLOW.REVERSAL_UP',
  'collapse-risk': 'WATCHLIST.FLOW.COLLAPSE_RISK',
  sideways: 'WATCHLIST.FLOW.SIDEWAYS',
};

@Component({
  selector: 'app-watchlist-flow',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './watchlist-flow.component.html',
  styleUrls: ['./watchlist-flow.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistFlowComponent implements OnChanges {
  @Input() price = 0;
  @Input() forecast?: FlowForecast;
  @Input() boxes: FlowBox[] = [];
  @Input() loading = false;
  @Input() markerTier = 'unknown';

  readonly viewBox = `0 0 ${VIEW_W} ${VIEW_H}`;
  readonly nowX = NOW_X;
  readonly hoursAhead = HOURS_AHEAD;

  projection?: FlowProjection;
  historyPath = '';
  projectionPath = '';
  conePath = '';
  bands: BoxBand[] = [];
  edgeAbove?: EdgeHint;
  edgeBelow?: EdgeHint;
  targetLabel = '';
  dotTopPct = 50;
  targetTopPct = 50;
  stateKey = STATE_KEYS.sideways;
  direction: 'up' | 'down' | 'flat' = 'flat';

  ngOnChanges(): void {
    this.build();
  }

  private build(): void {
    const f = this.forecast;
    if (!f || !this.price) {
      this.projection = undefined;
      return;
    }
    this.stateKey = STATE_KEYS[f.state];
    this.direction = f.score > 0.2 ? 'up' : f.score < -0.2 ? 'down' : 'flat';

    const projection = projectFlow(this.price, f, this.boxes, HOURS_AHEAD);
    this.projection = projection;
    if (!projection) return;

    // History ends at the live price so the wave connects to "now".
    const history = [...f.history.slice(0, -1), this.price];
    const values = [
      ...history,
      ...projection.points.flatMap((p) => [p.low, p.high]),
    ];
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    const baseSpan = hi - lo || this.price * 0.01;

    // Pull the nearest boxes into view when they are reasonably close,
    // otherwise show them as an arrow hint at the chart edge.
    const { below, above } = selectVisibleBoxes(this.boxes, this.price);
    const reach = baseSpan * 2.5;
    const nearAbove = above[0];
    const nearBelow = below[0];
    if (nearAbove && nearAbove.ZoneMin - hi < reach) {
      hi = Math.max(hi, Math.min(nearAbove.ZoneMax, hi + reach));
    }
    if (nearBelow && lo - nearBelow.ZoneMax < reach) {
      lo = Math.min(lo, Math.max(nearBelow.ZoneMin, lo - reach));
    }
    const pad = (hi - lo) * 0.08 || this.price * 0.002;
    lo -= pad;
    hi += pad;
    const y = (p: number) => VIEW_H - ((p - lo) / (hi - lo)) * VIEW_H;

    const hitBox = projection.blockedBy?.box;
    this.bands = [...below, ...above]
      .filter((b) => b.ZoneMax > lo && b.ZoneMin < hi)
      .map((b) => {
        const top = y(Math.min(b.ZoneMax, hi));
        const bottom = y(Math.max(b.ZoneMin, lo));
        return {
          y: top,
          height: Math.max(0.8, bottom - top),
          tone: resolveBoxTone(b),
          label: `${this.fmt(b.ZoneMin)} – ${this.fmt(b.ZoneMax)}`,
          hit: b === hitBox,
        };
      });
    this.edgeAbove =
      nearAbove && nearAbove.ZoneMin >= hi
        ? this.edgeHint(nearAbove, nearAbove.ZoneMin)
        : undefined;
    this.edgeBelow =
      nearBelow && nearBelow.ZoneMax <= lo
        ? this.edgeHint(nearBelow, nearBelow.ZoneMax)
        : undefined;

    const histStep = NOW_X / Math.max(1, history.length - 1);
    const histPts = history.map((p, i) => [i * histStep, y(p)] as const);
    const projStep = (VIEW_W - NOW_X - 1) / HOURS_AHEAD;
    const projX = (h: number) => NOW_X + h * projStep;
    const projPts = projection.points.map((p) => [projX(p.h), y(p.price)] as const);

    this.historyPath = smoothPath(histPts);
    this.projectionPath = smoothPath(projPts);
    const upper = projection.points.map((p) => [projX(p.h), y(p.high)] as const);
    const lower = projection.points
      .map((p) => [projX(p.h), y(p.low)] as const)
      .reverse();
    this.conePath = `${smoothPath(upper)} L ${lower
      .map(([px, py]) => `${px.toFixed(2)} ${py.toFixed(2)}`)
      .join(' L ')} Z`;

    this.targetLabel = this.fmt(projection.target, true);
    this.dotTopPct = (y(this.price) / VIEW_H) * 100;
    this.targetTopPct = (y(projection.target) / VIEW_H) * 100;
  }

  private edgeHint(box: FlowBox, price: number): EdgeHint {
    return {
      tone: resolveBoxTone(box),
      price,
      pct: ((price - this.price) / this.price) * 100,
    };
  }

  private fmt(v: number, precise = false): string {
    const abs = Math.abs(v);
    const decimals = abs >= 1000 ? (precise ? 1 : 0) : abs >= 1 ? (precise ? 3 : 2) : 5;
    return v.toLocaleString(undefined, {
      maximumFractionDigits: decimals,
      minimumFractionDigits: 0,
    });
  }
}

/** Catmull-Rom spline through the points, as SVG cubic beziers. */
function smoothPath(pts: ReadonlyArray<readonly [number, number]>): string {
  if (!pts.length) return '';
  const f = (n: number) => n.toFixed(2);
  let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
