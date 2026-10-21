/* Service for fetching Capital Flow signals and transforming them into Chart.js datasets. */

import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ChartService } from '../../../modules/shared/services/http/chart.service';
import { CapitalFlowSignal } from '../models/capital-flow-signal';
import { MarketCipherSignal } from '../../../modules/shared/models/chart/market-cipher-signal.dto';
import { DivergenceSignal } from '../../../modules/shared/models/chart/divergence-signal.dto';
import { debugLog } from 'src/app/helpers/debug-log';

type CandlePoint = { x: number; h: number; l: number };
type IndicatorTierFilter = {
  bronze: boolean;
  silver: boolean;
  gold: boolean;
  platinum: boolean;
};
type ChartDataset = Record<string, unknown>;

/** Start→end pivot line, drawn by divergencePainterPlugin. */
export type DivergenceLineItem = { x1: number; y1: number; x2: number; y2: number; color: string };
/** Merged dot on the end candle, e.g. labels ['RSI', 'MACD']. */
export type DivergenceDotItem = { x: number; y: number; color: string; labels: string[] };

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
  StartTime?: string;
  EndTime?: string;
  LineColor?: string;
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
    /** First loaded candle (epoch ms); older divergences can't be drawn anyway. */
    from?: number;
  }): Observable<DivergenceSignalLike[]> {
    const { symbolName, timeframe, showDivergences, from } = params;
    if (!symbolName || !timeframe) return of([]);
    if (!showDivergences) return of([]);
    return this.marketService.getDivergences(symbolName, timeframe, from);
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
      const sym =
        legacySignal.symbol ??
        legacySignal.Symbol ??
        legacySignal.SymbolName ??
        '';
      const tf =
        legacySignal.timeframe ??
        legacySignal.Timeframe ??
        legacySignal.timeFrame ??
        '';
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
      const t = new Date(
        legacySignal.endTime ?? legacySignal.EndTime,
      ).getTime();
      return t >= firstTime && t <= lastTime;
    });
    const filteredByTier = signalsInRange.filter(tierAllowed);
    if (!filteredByTier.length) return [];
    if (!signalsInRange.length) return [];

    // Group the signals per candle and side: bullish under the low, bearish above the high.
    // Several signals on one side stack outward (highest priority nearest the candle); the same
    // glyph twice (e.g. from two exchanges) is drawn once.
    const groups = new Map<string, { ci: number; isBull: boolean; signals: CapitalFlowSignalLike[] }>();
    filteredByTier.forEach((sig) => {
      const legacySignal = sig as CapitalFlowSignalLike;
      const t = new Date(
        legacySignal.endTime ?? legacySignal.EndTime,
      ).getTime();
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
      const isBull = !!(legacySignal.isBullish ?? legacySignal.IsBullish);
      const key = `${bestIdx}_${isBull ? 'B' : 'S'}`;
      const group = groups.get(key) ?? { ci: bestIdx, isBull, signals: [] };
      group.signals.push(legacySignal);
      groups.set(key, group);
    });
    if (groups.size === 0) return [];

    const priorityOf = (sig: CapitalFlowSignalLike): number => sig.priority ?? sig.Priority ?? 0;
    const glyphOf = (sig: CapitalFlowSignalLike): string => (sig.glyph ?? sig.Glyph) || '';
    const isCompact = candles.length < 120;
    const glyphSize = isCompact ? 8 : 9;

    const newDatasets: ChartDataset[] = [];
    Array.from(groups.values())
      .sort((a, b) => a.ci - b.ci || Number(b.isBull) - Number(a.isBull))
      .forEach(({ ci, isBull, signals }) => {
        const candle = candles[ci];
        const seen = new Set<string>();
        const stack = signals
          .sort((a, b) => priorityOf(b) - priorityOf(a))
          .filter((sig) => {
            const glyph = glyphOf(sig);
            if (seen.has(glyph)) return false;
            seen.add(glyph);
            return true;
          });
        // Candle colours, slightly translucent: markers support the candles instead of competing with them.
        const color = isBull ? 'rgba(8,153,129,0.85)' : 'rgba(242,54,69,0.85)';
        stack.forEach((sig, slot) => {
          newDatasets.push({
            isIndicator: true,
            yAxisID: 'y',
            xAxisID: 'x',
            type: 'scatter',
            label: `CF_${isBull ? 'BULL' : 'BEAR'}_${ci}_${slot}_EX${sig.exchangeId ?? sig.ExchangeId}`,
            // Pinned to the candle's low/high; indicatorLabelPlugin adds a fixed pixel gap.
            data: [{ x: candle.x, y: isBull ? candle.l : candle.h }],
            glyph: glyphOf(sig), // use glyph exactly as provided
            glyphColor: color,
            glyphSize,
            glyphAnchor: isBull ? 'below' : 'above',
            glyphSlot: slot,
            pointRadius: 0,
            showLine: false,
            order: 1000 + priorityOf(sig),
          });
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

      // Start→end pivot line (same as WPF), only when the start is on the chart too
      if (!sig.StartTime || !sig.EndTime) return;
      const startT = new Date(sig.StartTime).getTime();
      if (!Number.isFinite(startT) || startT < firstTime || startT > lastTime)
        return;
      let startIdx = -1;
      let startDiff = Number.MAX_SAFE_INTEGER;
      for (let i = 0; i < candles.length; i++) {
        const diff = Math.abs(candles[i].x - startT);
        if (diff < startDiff) {
          startDiff = diff;
          startIdx = i;
        }
      }
      if (startIdx < 0 || startIdx >= bestIdx) return;
      const startCandle = candles[startIdx];
      const isBear =
        isBearlish || (sig.Label || '').toLowerCase().includes('bear');
      newDatasets.push({
        isIndicator: true,
        isMarketCipher: true,
        yAxisID: 'y',
        xAxisID: 'x',
        type: 'line',
        label: `MC_LINE_${sig.Label}_${startCandle.x}_${candle.x}`,
        data: [
          { x: startCandle.x, y: isBear ? startCandle.h : startCandle.l },
          { x: candle.x, y: isBear ? candle.h : candle.l },
        ],
        borderColor: sig.LineColor || (isBear ? '#FF1744' : '#00E676'),
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 0,
        fill: false,
        order: 901,
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
    const lastTime = candles[candles.length - 1].x;

    // Candles are ascending by x: binary search instead of a scan per divergence
    const findClosestCandle = (
      timeVal: string | number | Date | undefined,
    ): CandlePoint | null => {
      if (timeVal == null) return null;
      const t = new Date(timeVal).getTime();
      if (!Number.isFinite(t)) return null;
      let lo = 0;
      let hi = candles.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (candles[mid].x < t) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && t - candles[lo - 1].x <= Math.abs(candles[lo].x - t)) lo--;
      return candles[lo];
    };

    // Group dots by candle x + bullish/bearish so multiple indicators on the
    // same candle are merged into one circle showing "RSI/MACD" etc.
    // Key: `${candleX}_${bull|bear}`
    interface DotGroup {
      candle: CandlePoint;
      isBullish: boolean;
      color: string;
      labels: string[]; // indicator names e.g. ['RSI', 'MACD']
    }
    const dotMap = new Map<string, DotGroup>();

    // Start→end pivot lines (same as WPF): low→low for bullish, high→high for bearish.
    // Key: `${startX}_${endX}_${bull|bear}` so indicators sharing pivots draw one line.
    const lineMap = new Map<string, DivergenceLineItem>();

    divergences.forEach((div, i: number) => {
      // Debug: log first item so field names are visible in console
      if (i === 0) {
        debugLog(
          '[Divergence] First raw item keys:',
          Object.keys(div),
          '| value:',
          div,
        );
      }

      const endTime =
        div.EndTime ??
        div.endTime ??
        div.BarTime ??
        div.barTime ??
        div.StartTime ??
        div.startTime;
      if (!endTime) return;

      const endCandle = findClosestCandle(endTime);
      if (!endCandle) return;

      const endT = new Date(endTime).getTime();
      if (endT < firstTime || endT > lastTime) return;

      // Kind field: "PositiveRegular" / "PositiveHidden" = bullish, "NegativeRegular" / "NegativeHidden" = bearish
      const kind = (div.Kind ?? div.kind ?? '').toString().toLowerCase();
      const divType = (
        div.Type ??
        div.type ??
        div.DivergenceType ??
        div.divergenceType ??
        div.Direction ??
        div.direction ??
        div.TypeName ??
        div.typeName ??
        ''
      )
        .toString()
        .toLowerCase();

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
      const indicator =
        (div.Indicator ?? div.indicator ?? div.Source ?? div.source ?? '')
          .toString()
          .trim() || 'DIV';

      // Only accumulate dot for the END candle
      const key = `${endCandle.x}_${isBullish ? 'bull' : 'bear'}`;
      if (!dotMap.has(key)) {
        dotMap.set(key, { candle: endCandle, isBullish, color, labels: [] });
      }
      const group = dotMap.get(key)!;
      if (!group.labels.includes(indicator)) group.labels.push(indicator);

      // Line only when the start pivot is on the chart too; otherwise it would snap to candle 0
      const startTime = div.StartTime ?? div.startTime;
      const startT = startTime ? new Date(startTime).getTime() : NaN;
      if (!Number.isFinite(startT) || startT < firstTime || startT > lastTime)
        return;
      const startCandle = findClosestCandle(startTime);
      if (!startCandle || startCandle.x >= endCandle.x) return;

      const lineKey = `${startCandle.x}_${endCandle.x}_${isBullish ? 'bull' : 'bear'}`;
      if (lineMap.has(lineKey)) return;
      lineMap.set(lineKey, {
        x1: startCandle.x,
        y1: isBullish ? startCandle.l : startCandle.h,
        x2: endCandle.x,
        y2: isBullish ? endCandle.l : endCandle.h,
        color,
      });
    });

    const dots: DivergenceDotItem[] = [];
    dotMap.forEach((group) => {
      dots.push({
        x: group.candle.x,
        y: group.isBullish ? group.candle.l * 0.996 : group.candle.h * 1.004,
        color: group.color,
        labels: group.labels,
      });
    });

    const lines = [...lineMap.values()];
    if (!lines.length && !dots.length) return [];

    // One carrier dataset without points (like key zones): hundreds of
    // per-divergence datasets made every chart update and hover slow.
    // divergencePainterPlugin draws the lines at this dataset's order and the dots on top.
    return [
      {
        type: 'line',
        label: 'Divergences',
        data: [],
        pointRadius: 0,
        borderWidth: 0,
        isDivergence: true,
        divergenceLines: lines,
        divergenceDots: dots,
        order: 850,
      } as ChartDataset,
    ];
  }
}
