// import { Injectable } from '@angular/core';

// export interface LiveCandle {
//   x: number;
//   o: number;
//   h: number;
//   l: number;
//   c: number;
//   v: number;
// }

// @Injectable({ providedIn: 'root' })
// export class ChartLiveCandleService {
//   timeframeToPeriodMs(timeframe: string): number {
//     const map: Record<string, number> = {
//       '12m': 12 * 60 * 1000,
//       '24m': 24 * 60 * 1000,
//       '1h': 60 * 60 * 1000,
//       '4h': 4 * 60 * 60 * 1000,
//       '1d': 24 * 60 * 60 * 1000,
//       '1w': 7 * 24 * 60 * 60 * 1000,
//       '1M': 30 * 24 * 60 * 60 * 1000,
//     };
//     return map[timeframe] ?? 0;
//   }

//   aggregateToLiveCandle(candles: LiveCandle[], periodStart: number): LiveCandle {
//     const first = candles[0];
//     const last = candles[candles.length - 1];
//     return {
//       x: periodStart,
//       o: first.o,
//       h: Math.max(...candles.map((c) => c.h)),
//       l: Math.min(...candles.map((c) => c.l)),
//       c: last.c,
//       v: candles.reduce((sum, c) => sum + c.v, 0),
//     };
//   }

//   applyLiveCandleToBaseData(baseData: any[], liveCandle: LiveCandle): any[] {
//     if (!baseData?.length) return baseData;
//     const last = baseData[baseData.length - 1];
//     if ((last as any)?.x === liveCandle.x) {
//       return [...baseData.slice(0, -1), { ...(last as any), ...liveCandle }];
//     }
//     if (liveCandle.x > ((last as any)?.x ?? 0)) {
//       return [...baseData, liveCandle];
//     }
//     return baseData;
//   }
// }
