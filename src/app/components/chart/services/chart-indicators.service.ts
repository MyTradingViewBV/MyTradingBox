/* Service for fetching Capital Flow signals and transforming them into Chart.js datasets. */
 
import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import { CapitalFlowSignal } from '../models/capital-flow-signal';
import { MarketCipherSignal } from '../../../modules/shared/models/chart/market-cipher-signal.dto';
import { DivergenceSignal } from '../../../modules/shared/models/chart/divergence-signal.dto';

type CandlePoint = { x: number; h: number; l: number };
type IndicatorTierFilter = { bronze: boolean; silver: boolean; gold: boolean; platinum: boolean };
type ChartDataset = Record<string, unknown>;

type CapitalFlowSignalLike = CapitalFlowSignal & {
  Symbol?: string;
  SymbolName?: string;
  Timeframe?: string;
  timeFrame?: string;
  SignalType?: string;
  IsBullish?: boolean;
  EndTime?: string;
  Glyph?: string;
  Priority?: number;
  ExchangeId?: number;
};

type MarketCipherSignalLike = MarketCipherSignal & {
  EndTime?: string;
  BarTime?: string;
  Type?: string;
  Label?: string;
  Timeframe?: string;
  Color?: string;
  Value?: unknown;
};

type DivergenceSignalLike = DivergenceSignal & {
  EndTime?: string;
  endTime?: string;
  BarTime?: string;
  barTime?: string;
  StartTime?: string;
  startTime?: string;
  Kind?: string;
  kind?: string;
  Type?: string;
  type?: string;
  DivergenceType?: string;
  Direction?: string | number;
  direction?: string | number;
  TypeName?: string;
  typeName?: string;
  Bullish?: boolean;
  bullish?: boolean;
  IsBullish?: boolean;
  Indicator?: string;
  indicator?: string;
  Source?: string;
  source?: string;
};

@Injectable({ providedIn: 'root' })
export class ChartIndicatorsService {
  private readonly marketService = inject(ChartService);

  fetchCapitalFlowSignals(params: {
    symbolName: string;
    timeframe: string;
    baseData: CandlePoint[];
    showIndicators: boolean;
  }): Observable<CapitalFlowSignal[]> {
    const { symbolName, timeframe, showIndicators } = params;
    if (!symbolName) return of([]);
    if (!showIndicators) return of([]);
    return this.marketService.getCapitalFlowSignals(symbolName, timeframe);
  }

  fetchMarketCipherSignals(params: {
    symbolName: string;
    timeframe: string;
    showMarketCipher: boolean;
  }): Observable<MarketCipherSignalLike[]> {
    const { symbolName, timeframe, showMarketCipher } = params;
    if (!symbolName || !timeframe) return of([]);
    if (!showMarketCipher) return of([]);
    return this.marketService.getMarketCipherSignals(symbolName, timeframe);
  }

  fetchDivergences(params: {
    symbolName: string;
    timeframe: string;
    showDivergences: boolean;
  }): Observable<DivergenceSignalLike[]> {
    const { symbolName, timeframe, showDivergences } = params;
    if (!symbolName || !timeframe) return of([]);
    if (!showDivergences) return of([]);
    return this.marketService.getDivergences(symbolName, timeframe);
  }

  buildCapitalFlowDatasets(params: {
    rawSignals: CapitalFlowSignal[];
    timeframe: string;
    baseData: CandlePoint[];
    filter?: IndicatorTierFilter;
  }): ChartDataset[] {
    const { rawSignals, timeframe, baseData, filter } = params;
    if (!rawSignals?.length || !baseData?.length) return [];
    const candles = baseData;
    const firstTime = candles[0].x;
    const lastTime = candles[candles.length - 1].x;
    const relevant = rawSignals.filter((signal) => {
      const legacySignal = signal as CapitalFlowSignalLike;
      const sym = legacySignal.symbol ?? legacySignal.Symbol ?? legacySignal.SymbolName ?? '';
      const tf = legacySignal.timeframe ?? legacySignal.Timeframe ?? legacySignal.timeFrame ?? '';
      return !!sym && tf.toString() === timeframe;
    });
    // Tier filtering based on signalType prefix; do not infer from priority
    const tierAllowed = (signal: CapitalFlowSignalLike): boolean => {
      const st = (signal.signalType ?? signal.SignalType ?? '').toString();
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
    const signalsInRange = relevant.filter((signal) => {
      const legacySignal = signal as CapitalFlowSignalLike;
      const t = new Date(legacySignal.endTime ?? legacySignal.EndTime).getTime();
      return t >= firstTime && t <= lastTime;
    });
    const filteredByTier = signalsInRange.filter(tierAllowed);
    if (!filteredByTier.length) return [];
    if (!signalsInRange.length) return [];

    // Map each signal to nearest candle index, resolving overlap by highest priority
    const byIndex: Map<number, CapitalFlowSignal> = new Map();
    filteredByTier.forEach((sig) => {
      const legacySignal = sig as CapitalFlowSignalLike;
      const t = new Date(legacySignal.endTime ?? legacySignal.EndTime).getTime();
      let bestIdx = -1;
      let bestDiff = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < candles.length; i++) {
        const diff = Math.abs(candles[i].x - t);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      if (bestIdx < 0) return;
      const existing = byIndex.get(bestIdx);
      const pri = legacySignal.priority ?? legacySignal.Priority ?? 0;
      const existingSignal = existing as CapitalFlowSignalLike | undefined;
      const epri = existingSignal?.priority ?? existingSignal?.Priority ?? 0;
      if (!existing || pri > epri) {
        byIndex.set(bestIdx, sig);
      }
    });
    if (byIndex.size === 0) return [];

    // Median candle range for sizing heuristics
    const ranges = candles
      .map((candle) => Math.max(0, candle.h - candle.l))
      .filter((r: number) => r > 0)
      .sort((a: number, b: number) => a - b);
    let medianRange = 1.0;
    if (ranges.length === 1) medianRange = ranges[0];
    else if (ranges.length > 1) {
      medianRange = ranges.length % 2 === 1
        ? ranges[Math.floor(ranges.length / 2)]
        : 0.5 * (ranges[ranges.length / 2 - 1] + ranges[ranges.length / 2]);
    }
    if (medianRange <= 0) medianRange = 1.0;

    // Position glyphs close to candles; reuse prior layout constants but do NOT derive glyph
    const UnitFactor = 0.12;
    const FirstOffsetUnits = 2.0;
    const MinPct = 0.00003;
    const MaxPct = 0.004;
    const FallbackPct = 0.00004;
    const isCompact = candles.length < 120;

    const newDatasets: ChartDataset[] = [];
    Array.from(byIndex.keys())
      .sort((a, b) => a - b)
      .forEach((ci) => {
        const sig = byIndex.get(ci)!;
        const legacySignal = sig as CapitalFlowSignalLike;
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

        const isBull = !!(legacySignal.isBullish ?? legacySignal.IsBullish);
        const y = isBull
          ? candle.l - unit * FirstOffsetUnits
          : candle.h + unit * FirstOffsetUnits;
        const tTime = new Date(legacySignal.endTime ?? legacySignal.EndTime).getTime();
        const color = isBull ? '#00C853' : '#D50000';

        newDatasets.push({
          isIndicator: true,
          yAxisID: 'y',
          xAxisID: 'x',
          type: 'scatter',
          label: `CF_${isBull ? 'BULL' : 'BEAR'}_${ci}_EX${legacySignal.exchangeId ?? legacySignal.ExchangeId}`,
          data: [{ x: tTime, y }],
          glyph: (legacySignal.glyph ?? legacySignal.Glyph) || '', // use glyph exactly as provided
          glyphColor: color,
          glyphSize: medianRange > 5 ? (isCompact ? 9 : 10) : (isCompact ? 8 : 9),
          pointRadius: 0,
          showLine: false,
          order: 1000 + (legacySignal.priority ?? legacySignal.Priority ?? 0),
        });
      });

    return newDatasets;
  }

  buildMarketCipherDatasets(params: {
    rawSignals: MarketCipherSignalLike[];
    baseData: CandlePoint[];
  }): ChartDataset[] {
    const { rawSignals, baseData } = params;
    if (!rawSignals?.length || !baseData?.length) return [];

    const candles = baseData;
    const firstTime = candles[0].x;
    const lastTime = candles[candles.length - 1].x;

    // Filter signals within chart range
    const signalsInRange = rawSignals.filter((sig) => {
      const signalTime = sig.EndTime || sig.BarTime;
      if (!signalTime) return false;
      const t = new Date(signalTime).getTime();
      return t >= firstTime && t <= lastTime;
    });

    if (!signalsInRange.length) return [];

    const newDatasets: ChartDataset[] = [];

    signalsInRange.forEach((sig) => {
      const signalTimestamp = sig.EndTime || sig.BarTime;
      if (!signalTimestamp) return;
      const signalTime = new Date(signalTimestamp).getTime();
      
      // Find closest candle
      let bestIdx = -1;
      let bestDiff = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < candles.length; i++) {
        const diff = Math.abs(candles[i].x - signalTime);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) return;

      const candle = candles[bestIdx];
      
      // Position above/below depending on type
      const isBearlish = (sig.Type || '').toLowerCase().includes('bearish');
      const yOffset = isBearlish ? candle.h * 1.01 : candle.l * 0.99;

      newDatasets.push({
        isIndicator: true,
        isMarketCipher: true,
        yAxisID: 'y',
        xAxisID: 'x',
        type: 'scatter',
        label: `MC_${sig.Label}_${sig.Timeframe}`,
        data: [{ x: candle.x, y: yOffset }],
        glyphColor: sig.Color || '#999999',
        glyphSize: 8,
        pointRadius: 8,
        pointStyle: 'rect',
        pointBackgroundColor: sig.Color || '#999999',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
        showLine: false,
        tooltip: {
          label: `${sig.Label} (${sig.Type})`,
          value: sig.Value,
        },
        order: 900,
      });
    });

    return newDatasets;
  }

  buildDivergenceDatasets(params: {
    divergences: DivergenceSignalLike[];
    baseData: CandlePoint[];
  }): ChartDataset[] {
    const { divergences, baseData } = params;
    if (!divergences?.length || !baseData?.length) return [];

    const candles = baseData;
    const firstTime = candles[0].x;
    const lastTime  = candles[candles.length - 1].x;

    const findClosestCandle = (timeVal: string | number | Date | undefined): CandlePoint | null => {
      if (timeVal == null) return null;
      const t = new Date(timeVal).getTime();
      if (!Number.isFinite(t)) return null;
      let bestIdx = -1;
      let bestDiff = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < candles.length; i++) {
        const diff = Math.abs(candles[i].x - t);
        if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
      }
      return bestIdx >= 0 ? candles[bestIdx] : null;
    };

    // Group dots by candle x + bullish/bearish so multiple indicators on the
    // same candle are merged into one circle showing "RSI/MACD" etc.
    // Key: `${candleX}_${bull|bear}`
    interface DotGroup {
      candle: CandlePoint;
      isBullish: boolean;
      color: string;
      labels: string[];   // indicator names e.g. ['RSI', 'MACD']
    }
    const dotMap = new Map<string, DotGroup>();

    divergences.forEach((div, i: number) => {
      // Debug: log first item so field names are visible in console
      if (i === 0) {
        console.log('[Divergence] First raw item keys:', Object.keys(div), '| value:', div);
      }

      const endTime = div.EndTime ?? div.endTime ?? div.BarTime ?? div.barTime ?? div.StartTime ?? div.startTime;
      if (!endTime) return;

      const endCandle = findClosestCandle(endTime);
      if (!endCandle) return;

      const endT = new Date(endTime).getTime();
      if (endT < firstTime || endT > lastTime) return;

      // Kind field: "PositiveRegular" / "PositiveHidden" = bullish, "NegativeRegular" / "NegativeHidden" = bearish
      const kind = (div.Kind ?? div.kind ?? '').toString().toLowerCase();
      const divType = (
        div.Type ?? div.type ??
        div.DivergenceType ?? div.divergenceType ??
        div.Direction ?? div.direction ??
        div.TypeName ?? div.typeName ?? ''
      ).toString().toLowerCase();

      const isBullish =
        kind.startsWith('positive') ||
        /bull|long/.test(divType) ||
        /bull|long/.test(kind) ||
        div.Bullish === true ||
        div.bullish === true ||
        div.IsBullish === true ||
        div.isBullish === true ||
        (typeof div.Direction === 'number' && div.Direction > 0) ||
        (typeof div.direction === 'number' && div.direction > 0);

      const color = isBullish ? '#00E676' : '#FF1744';
      const indicator = (div.Indicator ?? div.indicator ?? div.Source ?? div.source ?? '').toString().trim() || 'DIV';

      // Only accumulate dot for the END candle
      const key = `${endCandle.x}_${isBullish ? 'bull' : 'bear'}`;
      if (!dotMap.has(key)) {
        dotMap.set(key, { candle: endCandle, isBullish, color, labels: [] });
      }
      const group = dotMap.get(key)!;
      if (!group.labels.includes(indicator)) group.labels.push(indicator);
    });

    // One scatter dataset per merged dot group (plugin renders the circle + text)
    const dotDatasets: ChartDataset[] = [];
    dotMap.forEach((group) => {
      const y = group.isBullish ? group.candle.l * 0.996 : group.candle.h * 1.004;
      dotDatasets.push({
        isDivergence: true,
        type: 'scatter',
        label: `DIV_DOT_${group.candle.x}_${group.isBullish ? 'bull' : 'bear'}`,
        data: [{ x: group.candle.x, y }],
        divLabels: group.labels,
        divColor: group.color,
        pointRadius: 0,    // drawn entirely by divergenceDotPlugin
        showLine: false,
        yAxisID: 'y',
        xAxisID: 'x',
        order: 849,
      });
    });

    return dotDatasets;
  }
}
