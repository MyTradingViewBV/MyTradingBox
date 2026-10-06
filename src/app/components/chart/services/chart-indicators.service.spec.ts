import { TestBed } from '@angular/core/testing';
import { ChartIndicatorsService } from './chart-indicators.service';
import { ChartService } from '../../../modules/shared/services/http/chart.service';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 1);

const candles = Array.from({ length: 10 }, (_, i) => ({
  x: T0 + i * HOUR,
  h: 110 + i,
  l: 90 + i,
}));
const iso = (i: number) => new Date(T0 + i * HOUR).toISOString();

type Ds = Record<string, any>;

describe('ChartIndicatorsService', () => {
  let service: ChartIndicatorsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ChartService, useValue: {} }],
    });
    service = TestBed.inject(ChartIndicatorsService);
  });

  describe('buildDivergenceDatasets', () => {
    it('draws a start→end line on lows for bullish and highs for bearish (like WPF)', () => {
      const ds = service.buildDivergenceDatasets({
        divergences: [
          { Indicator: 'RSI', Kind: 'PositiveRegular', StartTime: iso(2), EndTime: iso(6) },
          { Indicator: 'MACD', Kind: 'NegativeHidden', StartTime: iso(1), EndTime: iso(8) },
        ] as any,
        baseData: candles,
      }) as Ds[];

      expect(ds.length).toBe(1);
      expect(ds[0]['isDivergence']).toBe(true);
      expect(ds[0]['data']).toEqual([]);
      expect(ds[0]['divergenceLines']).toEqual([
        { x1: candles[2].x, y1: candles[2].l, x2: candles[6].x, y2: candles[6].l, color: '#00E676' },
        { x1: candles[1].x, y1: candles[1].h, x2: candles[8].x, y2: candles[8].h, color: '#FF1744' },
      ]);
      expect(ds[0]['divergenceDots'].length).toBe(2);
    });

    it('snaps to the closest candle', () => {
      const ds = service.buildDivergenceDatasets({
        divergences: [
          {
            Indicator: 'RSI',
            Kind: 'PositiveRegular',
            StartTime: new Date(T0 + 2 * HOUR + 20 * 60_000).toISOString(),
            EndTime: new Date(T0 + 5 * HOUR + 40 * 60_000).toISOString(),
          },
        ] as any,
        baseData: candles,
      }) as Ds[];

      expect(ds[0]['divergenceLines'][0]).toEqual(
        expect.objectContaining({ x1: candles[2].x, x2: candles[6].x }),
      );
      expect(ds[0]['divergenceDots'][0].x).toBe(candles[6].x);
    });

    it('merges indicators sharing the same pivots into one line and one dot', () => {
      const ds = service.buildDivergenceDatasets({
        divergences: [
          { Indicator: 'RSI', Kind: 'PositiveRegular', StartTime: iso(2), EndTime: iso(6) },
          { Indicator: 'MACD', Kind: 'PositiveRegular', StartTime: iso(2), EndTime: iso(6) },
        ] as any,
        baseData: candles,
      }) as Ds[];

      expect(ds[0]['divergenceLines'].length).toBe(1);
      const dots = ds[0]['divergenceDots'];
      expect(dots.length).toBe(1);
      expect(dots[0].labels).toEqual(['RSI', 'MACD']);
    });

    it('keeps the dot but skips the line when the start pivot is off-chart', () => {
      const ds = service.buildDivergenceDatasets({
        divergences: [
          {
            Indicator: 'RSI',
            Kind: 'PositiveRegular',
            StartTime: new Date(T0 - 5 * HOUR).toISOString(),
            EndTime: iso(4),
          },
        ] as any,
        baseData: candles,
      }) as Ds[];

      expect(ds[0]['divergenceLines'].length).toBe(0);
      expect(ds[0]['divergenceDots'].length).toBe(1);
    });
  });

  describe('buildMarketCipherDatasets', () => {
    it('adds a start→end line in LineColor next to the marker', () => {
      const ds = service.buildMarketCipherDatasets({
        rawSignals: [
          {
            Type: 'Bearish',
            Label: 'Bear Div',
            StartTime: iso(3),
            EndTime: iso(7),
            LineColor: '#123456',
          },
        ] as any,
        baseData: candles,
      }) as Ds[];

      const line = ds.find((d) => d['type'] === 'line')!;
      expect(line['isMarketCipher']).toBe(true);
      expect(line['borderColor']).toBe('#123456');
      expect(line['data']).toEqual([
        { x: candles[3].x, y: candles[3].h },
        { x: candles[7].x, y: candles[7].h },
      ]);
    });
  });
});
