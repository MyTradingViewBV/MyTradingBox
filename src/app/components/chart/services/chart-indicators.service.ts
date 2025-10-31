/* Service for fetching indicator signals and transforming them into Chart.js datasets. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import { isBtcSymbol } from '../utils/chart-utils';

@Injectable({ providedIn: 'root' })
export class ChartIndicatorsService {
  constructor(private marketService: ChartService) {}

  fetchIndicatorSignals(params: {
    symbolName: string;
    timeframe: string;
    baseData: any[];
    showIndicators: boolean;
  }): Observable<any[]> {
    // don't destructure baseData as it's unused here (kept in params for future validation if needed)
    const { symbolName, timeframe, showIndicators } = params;
    if (!symbolName) return of([]);
    if (!showIndicators) return of([]);
    return this.marketService
      .getIndicatorSignals(symbolName, timeframe)
      .pipe(
        tap((arr: any[]) => {
          // side-effect only; downstream subscriber handles building datasets
          if (!arr?.length) {
            console.log('[ChartIndicatorsService] no signals returned');
          }
        })
      );
  }

  buildIndicatorDatasets(params: {
    rawSignals: any[];
    timeframe: string;
    baseData: any[];
  }): any[] {
    const { rawSignals, timeframe, baseData } = params;
    if (!rawSignals?.length || !baseData?.length) return [];
    const relevant = rawSignals.filter(
      (s: any) => (s.Symbol || '').toString() && (s.Timeframe || '').toString() === timeframe,
    );
    if (!relevant.length) return [];
    const candles = baseData;
    const firstTime = candles[0].x;
    const lastTime = candles[candles.length - 1].x;
    const signalsInRange = relevant.filter((s: any) => {
      const t = new Date(s.EndTime).getTime();
      return t >= firstTime && t <= lastTime;
    });
    if (!signalsInRange.length) return [];
    const grouped: Record<number, any[]> = {};
    signalsInRange.forEach((sig: any) => {
      const t = new Date(sig.EndTime).getTime();
      let bestIdx = -1;
      let bestDiff = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < candles.length; i++) {
        const diff = Math.abs(candles[i].x - t);
        if (diff < bestDiff) {
          bestDiff = diff;
            bestIdx = i;
        }
      }
      if (bestIdx < 0) return;
      if (!grouped[bestIdx]) grouped[bestIdx] = [];
      grouped[bestIdx].push(sig);
    });
    if (Object.keys(grouped).length === 0) return [];
    const ranges = candles
      .map((c: any) => Math.max(0, c.h - c.l))
      .filter((r: number) => r > 0)
      .sort((a: number, b: number) => a - b);
    let medianRange = 1.0;
    if (ranges.length === 1) medianRange = ranges[0];
    else if (ranges.length > 1) {
      const mid = Math.floor(ranges.length / 2);
      medianRange = ranges.length % 2 === 1 ? ranges[mid] : 0.5 * (ranges[mid - 1] + ranges[mid]);
    }
    if (medianRange <= 0) medianRange = 1.0;
    const UnitFactor = 0.18;
    const FirstOffsetUnits = 4.0;
    const BetweenUnits = 0.8;
    const MinPct = 0.00003;
    const MaxPct = 0.004;
    const FallbackPct = 0.00004;
    const newDatasets: any[] = [];
    Object.keys(grouped)
      .map((k) => Number(k))
      .sort((a, b) => a - b)
      .forEach((ci) => {
        const list = grouped[ci];
        const candle = candles[ci];
        let rawRange = candle.h - candle.l;
        if (rawRange <= 0)
          rawRange = Math.max((candle.h + candle.l) * 0.5, 1e-9) * FallbackPct;
        const unit = Math.max(
          Math.min(
            medianRange * UnitFactor,
            Math.max((candle.h + candle.l) * MaxPct, 1e-9),
          ),
          Math.max((candle.h + candle.l) * MinPct, 1e-9),
        );
        const bulls = list.filter(
          (s: any) => (s.Kind || '').toString().toLowerCase() === 'bullish',
        );
        const bears = list.filter(
          (s: any) => (s.Kind || '').toString().toLowerCase() === 'bearish',
        );
        for (let i = 0; i < bulls.length; i++) {
          const s = bulls[i];
          const y = candle.l - unit * (FirstOffsetUnits + i * BetweenUnits);
          const glyph = isBtcSymbol((s.Symbol || '') as string) ? '₿' : '▽';
          const color = s.HasMcb ? '#00C853' : '#00A040';
          newDatasets.push({
            isIndicator: true,
            yAxisID: 'indicator',
            label: `IND_BULL_${ci}_${i}_EX${s.ExchangeId}`,
            data: [{ x: candle.x, y }],
            glyph,
            glyphColor: color,
            glyphSize: 18,
            pointRadius: 0,
            order: 1000,
          });
        }
        for (let i = 0; i < bears.length; i++) {
          const s = bears[i];
          const y = candle.h + unit * (FirstOffsetUnits + i * BetweenUnits);
          const glyph = isBtcSymbol((s.Symbol || '') as string) ? '₿' : '▽';
          const color = s.HasMcb ? '#D50000' : '#B00000';
          newDatasets.push({
            isIndicator: true,
            yAxisID: 'indicator',
            label: `IND_BEAR_${ci}_${i}_EX${s.ExchangeId}`,
            data: [{ x: candle.x, y }],
            glyph,
            glyphColor: color,
            glyphSize: 18,
            pointRadius: 0,
            order: 1000,
          });
        }
      });
    return newDatasets;
  }
}
