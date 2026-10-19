import { KeyZonesModel } from 'src/app/modules/shared/models/chart/keyZones.dto';
import { buildBoxDatasets, resolveBoxColors } from './chart-utils';
import { DEFAULT_KEY_ZONE_LAYERS, KeyZoneBoxItem, KeyZoneLineItem, buildKeyZoneItems } from './key-zone-layers';

const alphaOf = (rgba: string): number => Number(/,\s*([\d.]+)\)$/.exec(rgba)?.[1] ?? 1);

/** TradingView parity: zones and levels must stay quieter than the candles (docs/CHART_TRADINGVIEW_PARITY.md). */
describe('chart tone (zones and levels stay subtle)', () => {
  it('trade boxes use the candle colours with a soft fill and a half-strength border', () => {
    const long = resolveBoxColors({ PositionType: 'Long' }, 'boxes');
    const short = resolveBoxColors({ PositionType: 'Short' }, 'boxes');
    expect(long.bg).toContain('8,153,129');
    expect(short.bg).toContain('242,54,69');
    for (const c of [long, short, resolveBoxColors({}, 'boxes'), resolveBoxColors({ Color: '#ff9800' }, 'all'), resolveBoxColors({}, 'all')]) {
      expect(alphaOf(c.bg)).toBeLessThanOrEqual(0.16);
      expect(alphaOf(c.br)).toBeLessThanOrEqual(0.55);
    }
  });

  it('box datasets get a thin border in the zone colour', () => {
    const [ds] = buildBoxDatasets({
      boxes: [{ Id: 1, ZoneMin: 100, ZoneMax: 110, PositionType: 'Long' }],
      baseData: [{ x: 1000, o: 1, h: 1, l: 1, c: 1 }, { x: 2000, o: 1, h: 1, l: 1, c: 1 }],
      mainData: [{ x: 1000 }, { x: 2000 }],
      boxMode: 'boxes',
    } as unknown as Parameters<typeof buildBoxDatasets>[0]);
    expect(ds?.borderWidth).toBe(1);
    expect(ds?.borderColor).toBe(resolveBoxColors({ PositionType: 'Long' }, 'boxes').br);
  });

  it('key-zone lines are translucent, zones have a light fill', () => {
    const kz: KeyZonesModel = {
      Symbol: 'BTCUSDT',
      Levels: [{ Symbol: 'BTCUSDT', Timeframe: '4h', Price: 80000, Indicator: '4h', Naked: true, Time: null }],
      NakedPocLevels: [
        {
          Id: 1, Symbol: 'BTCUSDT', Period: '1w', Name: 'Naked Weekly POC', Timeframe: '4h',
          PeriodStart: '2026-09-28T00:00:00', Poc: 84000, IsNaked: true, TestedAt: null,
        },
      ],
      OrderBlocks: [
        {
          Id: 1, Symbol: 'BTCUSDT', Timeframe: '1d', Type: 'Bullish', Top: 87000, Bottom: 86000,
          CandleTime: '2026-09-28T00:00:00Z',
        },
      ],
    } as unknown as KeyZonesModel;
    const items = buildKeyZoneItems(kz, { ...DEFAULT_KEY_ZONE_LAYERS, levels: true, npoc: true, orderBlocks: true }, () => true);
    const lines = items.filter((i): i is KeyZoneLineItem => i.kind === 'line');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    for (const l of lines) {
      expect(l.color.startsWith('rgba(')).toBe(true);
      expect(alphaOf(l.color)).toBeLessThan(1);
      expect(l.width).toBeLessThanOrEqual(1.5);
    }
    const ob = items.find((i): i is KeyZoneBoxItem => i.kind === 'box');
    expect(alphaOf(ob!.fill)).toBeLessThanOrEqual(0.1);
  });
});
