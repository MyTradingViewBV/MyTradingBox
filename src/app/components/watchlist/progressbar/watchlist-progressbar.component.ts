import { Component, Input, OnInit, ChangeDetectionStrategy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Box {
  ZoneMin: number;
  ZoneMax: number;
  Reason?: number;
  Strength?: number;
  Color?: string;
  Type?: string;
}

interface ProgressBarSegment {
  type: 'box' | 'price' | 'gap';
  label: string;
  width: number; // percentage
  isSupport?: boolean; // true for green (below price), false for red (above price)
  isPrice?: boolean;
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
      return;
    }

    this.hasBoxes = true;

    // Separate boxes into support (below price) and resistance (above price)
    const supportBoxes = this.boxes
      .filter(b => b.ZoneMax <= this.currentPrice)
      .sort((a, b) => b.ZoneMax - a.ZoneMax); // highest support first

    const resistanceBoxes = this.boxes
      .filter(b => b.ZoneMin >= this.currentPrice)
      .sort((a, b) => a.ZoneMin - b.ZoneMin); // lowest resistance first

    // Calculate overall range
    const allPrices = this.boxes.flatMap(b => [b.ZoneMin, b.ZoneMax]);
    const minPrice = Math.min(...allPrices, this.currentPrice);
    const maxPrice = Math.max(...allPrices, this.currentPrice);
    const range = maxPrice - minPrice || 1;

    this.segments = [];

    // Add support boxes (green, below price)
    for (const box of supportBoxes.slice(-2)) { // Show max 2 support boxes
      this.segments.push({
        type: 'box',
        label: `${box.ZoneMin.toFixed(2)}-${box.ZoneMax.toFixed(2)}`,
        width: ((box.ZoneMax - box.ZoneMin) / range) * 100,
        isSupport: true,
      });
    }

    // Add current price marker
    this.segments.push({
      type: 'price',
      label: this.currentPrice.toFixed(2),
      width: 0, // Just a marker
      isPrice: true,
    });

    // Add resistance boxes (red, above price)
    for (const box of resistanceBoxes.slice(0, 2)) { // Show max 2 resistance boxes
      this.segments.push({
        type: 'box',
        label: `${box.ZoneMin.toFixed(2)}-${box.ZoneMax.toFixed(2)}`,
        width: ((box.ZoneMax - box.ZoneMin) / range) * 100,
        isSupport: false,
      });
    }
  }
}
