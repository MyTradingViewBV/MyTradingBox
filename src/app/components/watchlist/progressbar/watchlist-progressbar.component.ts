import { Component, Input, OnInit, ChangeDetectionStrategy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Box {
  ZoneMin: number;
  ZoneMax: number;
  Reason?: number;
  Strength?: number;
  Color?: string;
  PositionType?: string;
  Type?: string;
}

interface ProgressBarSegment {
  type: 'box' | 'gap';
  label: string;
  width: number; // flex weight
  tone?: 'support' | 'resistance' | 'neutral';
}

@Component({
  selector: 'app-watchlist-progressbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './watchlist-progressbar.component.html',
  styleUrls: ['./watchlist-progressbar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WatchlistProgressbarComponent implements OnInit, OnChanges {
  @Input() currentPrice: number = 0;
  @Input() boxes: Box[] = [];
  @Input() symbol: string = '';

  segments: ProgressBarSegment[] = [];
  hasBoxes = false;
  markerOffsetPercent = 50;
  neutralStartPercent = 49;
  neutralEndPercent = 51;
  neutralFadePercent = 1.2;
  markerPulseClass: 'pulse-a' | 'pulse-b' = 'pulse-a';
  markerMoveClass: 'move-right' | 'move-left' | '' = '';
  markerTrailSize = 0;

  private lastPrice: number | null = null;
  private markerInitialized = false;

  ngOnInit(): void {
    this.buildProgressBar();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentPrice'] || changes['boxes']) {
      this.buildProgressBar();
    }
  }

  private buildProgressBar(): void {
    if (!this.boxes || this.boxes.length === 0 || !this.currentPrice) {
      this.segments = [];
      this.hasBoxes = false;
      this.markerInitialized = false;
      this.markerMoveClass = '';
      this.markerTrailSize = 0;
      this.lastPrice = this.currentPrice || null;
      return;
    }

    const supportBoxes = this.boxes
      .filter(b => b.ZoneMax <= this.currentPrice)
      .sort((a, b) => b.ZoneMax - a.ZoneMax)
      .slice(0, 2)
      .sort((a, b) => a.ZoneMin - b.ZoneMin);

    const resistanceBoxes = this.boxes
      .filter(b => b.ZoneMax > this.currentPrice)
      .sort((a, b) => a.ZoneMin - b.ZoneMin)
      .slice(0, 2);

    const visibleBoxes = [...supportBoxes, ...resistanceBoxes].sort((a, b) => a.ZoneMin - b.ZoneMin);

    if (visibleBoxes.length === 0) {
      this.segments = [];
      this.hasBoxes = false;
      return;
    }

    this.hasBoxes = true;

    const allPrices = visibleBoxes.flatMap(b => [b.ZoneMin, b.ZoneMax]);
    const minPrice = Math.min(...allPrices, this.currentPrice);
    const maxPrice = Math.max(...allPrices, this.currentPrice);
    const range = maxPrice - minPrice || 1;

    const nearestSupport = supportBoxes.length > 0
      ? Math.max(...supportBoxes.map(b => b.ZoneMax))
      : this.currentPrice;
    const nearestResistance = resistanceBoxes.length > 0
      ? Math.min(...resistanceBoxes.map(b => b.ZoneMin))
      : this.currentPrice;

    let neutralStart = ((nearestSupport - minPrice) / range) * 100;
    let neutralEnd = ((nearestResistance - minPrice) / range) * 100;

    if (neutralEnd < neutralStart) {
      const tmp = neutralStart;
      neutralStart = neutralEnd;
      neutralEnd = tmp;
    }

    neutralStart = Math.max(0, Math.min(100, neutralStart));
    neutralEnd = Math.max(0, Math.min(100, neutralEnd));

    if (Math.abs(neutralEnd - neutralStart) < 0.8) {
      const center = ((this.currentPrice - minPrice) / range) * 100;
      neutralStart = Math.max(0, center - 0.8);
      neutralEnd = Math.min(100, center + 0.8);
    }

    const neutralWidth = Math.max(0.8, neutralEnd - neutralStart);
    this.neutralFadePercent = Math.max(0.4, Math.min(1.6, neutralWidth / 3));

    this.neutralStartPercent = neutralStart;
    this.neutralEndPercent = neutralEnd;

    const nextOffsetPercent = ((this.currentPrice - minPrice) / range) * 100;
    const previousOffsetPercent = this.markerOffsetPercent;
    const priceChanged = this.lastPrice !== null && this.currentPrice !== this.lastPrice;

    this.markerOffsetPercent = nextOffsetPercent;

    if (!this.markerInitialized) {
      this.markerInitialized = true;
      this.markerMoveClass = '';
      this.markerTrailSize = 0;
    } else if (priceChanged) {
      this.updateMarkerMotion(nextOffsetPercent - previousOffsetPercent);
    }

    this.lastPrice = this.currentPrice;
    this.segments = [];

    let cursor = minPrice;
    for (const box of visibleBoxes) {
      const gapStart = cursor;
      const gapEnd = Math.max(gapStart, box.ZoneMin);
      const gapRaw = ((gapEnd - gapStart) / range) * 100;
      if (gapRaw > 0) {
        this.segments.push({
          type: 'gap',
          label: 'Gap',
          width: Math.max(gapRaw, 0.5),
        });
      }

      const boxRaw = ((box.ZoneMax - box.ZoneMin) / range) * 100;
      this.segments.push({
        type: 'box',
        label: `${box.ZoneMin.toFixed(2)} - ${box.ZoneMax.toFixed(2)}`,
        width: Math.max(boxRaw, 1.4),
        tone: this.resolveBoxTone(box),
      });

      cursor = Math.max(cursor, box.ZoneMax);
    }

    const tailRaw = ((maxPrice - cursor) / range) * 100;
    if (tailRaw > 0) {
      this.segments.push({
        type: 'gap',
        label: 'Gap',
        width: Math.max(tailRaw, 0.5),
      });
    }
  }

  private updateMarkerMotion(deltaPercent: number): void {
    this.markerPulseClass = this.markerPulseClass === 'pulse-a' ? 'pulse-b' : 'pulse-a';

    if (deltaPercent > 0) {
      this.markerMoveClass = 'move-right';
    } else if (deltaPercent < 0) {
      this.markerMoveClass = 'move-left';
    } else {
      this.markerMoveClass = '';
    }

    const magnitude = Math.abs(deltaPercent);
    this.markerTrailSize = this.markerMoveClass ? Math.min(24, Math.max(6, magnitude * 0.9)) : 0;
  }

  private resolveBoxTone(box: Box): 'support' | 'resistance' | 'neutral' {
    const sideRaw = (
      box.PositionType ||
      box.Type ||
      box.Color ||
      ''
    ).toString().toLowerCase();

    if (/short|sell|resistance|red|bear/i.test(sideRaw)) {
      return 'resistance';
    }

    if (/long|buy|support|green|bull/i.test(sideRaw)) {
      return 'support';
    }

    return 'neutral';
  }
}
