/* Service for fetching Capital Flow signals and transforming them into Chart.js datasets. */
 
import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import { CapitalFlowSignal } from '../models/capital-flow-signal';

@Injectable({ providedIn: 'root' })
export class ChartIndicatorsService {
  constructor(private marketService: ChartService) {}

  fetchCapitalFlowSignals(params: {
    symbolName: string;
    timeframe: string;
    baseData: any[];
    showIndicators: boolean;
  }): Observable<CapitalFlowSignal[]> {
    const { symbolName, timeframe, showIndicators } = params;
    if (!symbolName) return of([]);
    if (!showIndicators) return of([]);
    return this.marketService
      .getCapitalFlowSignals(symbolName, timeframe)
      .pipe(
        tap(() => {})
      );
  }

  buildCapitalFlowDatasets(params: {
    rawSignals: CapitalFlowSignal[];
    timeframe: string;
    baseData: any[];
    filter?: { bronze: boolean; silver: boolean; gold: boolean; platinum: boolean };
  }): any[] {
    const { rawSignals, timeframe, baseData, filter } = params;
    if (!rawSignals?.length || !baseData?.length) return [];
    const candles = baseData;
    const firstTime = candles[0].x;
    const lastTime = candles[candles.length - 1].x;
    const relevant = rawSignals.filter((s) => {
      const sym = (s as any).symbol ?? (s as any).Symbol ?? (s as any).SymbolName ?? '';
      const tf = (s as any).timeframe ?? (s as any).Timeframe ?? (s as any).timeFrame ?? '';
      return !!sym && tf.toString() === timeframe;
    });
    // Tier filtering based on signalType prefix; do not infer from priority
    const tierAllowed = (sig: any): boolean => {
      const st = (sig.signalType ?? sig.SignalType ?? '').toString();
      const isBronze = st.startsWith('Bronze');
      const isSilver = st.startsWith('Silver');
      const isGold = st.startsWith('Golden');
      const isPlatinum = st.startsWith('Platinum');
      if (!filter) return true; // no filter provided → allow all
      if (isBronze && !filter.bronze) return false;
      if (isSilver && !filter.silver) return false;
      if (isGold && !filter.gold) return false;
      if (isPlatinum && !filter.platinum) return false;
      // If none matched prefixes, allow by default
      return true;
    };
    if (!relevant.length) return [];
    const signalsInRange = relevant.filter((s) => {
      const t = new Date((s as any).endTime ?? (s as any).EndTime).getTime();
      return t >= firstTime && t <= lastTime;
    });
    const filteredByTier = signalsInRange.filter(tierAllowed);
    if (!filteredByTier.length) return [];
    if (!signalsInRange.length) return [];

    // Map each signal to nearest candle index, resolving overlap by highest priority
    const byIndex: Map<number, CapitalFlowSignal> = new Map();
    filteredByTier.forEach((sig) => {
      const t = new Date((sig as any).endTime ?? (sig as any).EndTime).getTime();
      let bestIdx = -1;
      let bestDiff = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < candles.length; i++) {
        const diff = Math.abs(candles[i].x - t);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      if (bestIdx < 0) return;
      const existing = byIndex.get(bestIdx);
      const pri = (sig as any).priority ?? (sig as any).Priority ?? 0;
      const epri = (existing as any)?.priority ?? (existing as any)?.Priority ?? 0;
      if (!existing || pri > epri) {
        byIndex.set(bestIdx, sig);
      }
    });
    if (byIndex.size === 0) return [];

    // Median candle range for sizing heuristics
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

    // Position glyphs close to candles; reuse prior layout constants but do NOT derive glyph
    const UnitFactor = 0.12;
    const FirstOffsetUnits = 2.0;
    const MinPct = 0.00003;
    const MaxPct = 0.004;
    const FallbackPct = 0.00004;
    const isCompact = candles.length < 120;

    const newDatasets: any[] = [];
    Array.from(byIndex.keys())
      .sort((a, b) => a - b)
      .forEach((ci) => {
        const sig = byIndex.get(ci)!;
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

        const isBull = !!((sig as any).isBullish ?? (sig as any).IsBullish);
        const y = isBull
          ? candle.l - unit * FirstOffsetUnits
          : candle.h + unit * FirstOffsetUnits;
        const tTime = new Date((sig as any).endTime ?? (sig as any).EndTime).getTime();
        const color = isBull ? '#00C853' : '#D50000';

        newDatasets.push({
          isIndicator: true,
          yAxisID: 'y',
          xAxisID: 'x',
          type: 'scatter',
          label: `CF_${isBull ? 'BULL' : 'BEAR'}_${ci}_EX${(sig as any).exchangeId ?? (sig as any).ExchangeId}`,
          data: [{ x: tTime, y }],
          glyph: ((sig as any).glyph ?? (sig as any).Glyph) || '', // use glyph exactly as provided
          glyphColor: color,
          glyphSize: medianRange > 5 ? (isCompact ? 9 : 10) : (isCompact ? 8 : 9),
          pointRadius: 0,
          showLine: false,
          order: 1000 + (((sig as any).priority ?? (sig as any).Priority ?? 0) as number),
        });
      });

    return newDatasets;
  }
}
