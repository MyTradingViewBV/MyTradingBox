import { KeyZonesModel } from 'src/app/modules/shared/models/chart/keyZones.dto';
import {
  DEFAULT_KEY_ZONE_LAYERS,
  KeyZoneBoxItem,
  KeyZoneLineItem,
  buildKeyZoneItems,
  keyZoneTimeframes,
  parseApiTime,
} from './key-zone-layers';

const all = (): boolean => true;

const payload: KeyZonesModel = {
  Symbol: 'BTCUSDT',
  Levels: [
    { Symbol: 'BTCUSDT', Timeframe: '4h', Price: 80000, Indicator: '4h', Naked: true, Time: null },
    { Symbol: 'BTCUSDT', Timeframe: '4h', Price: 80000, Indicator: '4h', Naked: true, Time: null },
    { Symbol: 'BTCUSDT', Timeframe: '1w', Price: 70000, Indicator: '1w', Naked: false, Time: null },
  ],
  NakedPocLevels: [
    {
      Id: 1, Symbol: 'BTCUSDT', Period: '1w', Name: 'Naked Weekly POC', Timeframe: '4h',
      PeriodStart: '2026-09-28T00:00:00', Poc: 84000, IsNaked: true, TestedAt: null,
    },
  ],
  FixedVolumeProfileLevels: [
    {
      ProfileId: 38, Symbol: 'BTCUSDT', Timeframe: '1d', StartTime: '2026-09-23T14:00:00Z',
      EndTime: '2026-10-01T00:00:00Z', PocPrice: 83912, ValueAreaHigh: 84500, ValueAreaLow: 82900,
      RangeHigh: 87000, RangeLow: 82000, TotalVolume: 1, Name: 'Current range outer',
    },
    {
      ProfileId: 38, Symbol: 'BTCUSDT', Timeframe: '4h', StartTime: '2026-09-23T14:00:00Z',
      EndTime: '2026-10-02T16:00:00Z', PocPrice: 83888, ValueAreaHigh: 84544, ValueAreaLow: 82897,
      RangeHigh: 87242, RangeLow: 82468, TotalVolume: 1, Name: 'Current range outer',
    },
  ],
  OrderBlocks: [
    {
      Id: 1, Symbol: 'BTCUSDT', Timeframe: '1d', Type: 'Bearish', Top: 87000, Bottom: 86000,
      Strength: 8, Session: null, CandleTime: '2026-09-23T00:00:00',
    },
  ],
  LiquidityLevels: [
    {
      Id: 1, Symbol: 'BTCUSDT', Timeframe: '4h', Side: 1, TopPrice: 90000, BottomPrice: 89900,
      Weight: 1, Touched: false, LeftTime: '2026-09-01T00:00:00',
    },
    {
      Id: 2, Symbol: 'BTCUSDT', Timeframe: '4h', Side: -1, TopPrice: 76291, BottomPrice: 76211,
      Weight: 1, Touched: true, LeftTime: '2026-04-19T12:00:00',
    },
  ],
  FibLevels: [
    {
      Symbol: 'BTCUSDT', Timeframe: '1d', Time: '2026-10-01T00:00:00', Type: 'retracement',
      Level: 0.618, Price: 93981, ExchangeId: 1,
    },
  ],
};

const lines = (items: ReturnType<typeof buildKeyZoneItems>): KeyZoneLineItem[] =>
  items.filter((i): i is KeyZoneLineItem => i.kind === 'line');
const boxes = (items: ReturnType<typeof buildKeyZoneItems>): KeyZoneBoxItem[] =>
  items.filter((i): i is KeyZoneBoxItem => i.kind === 'box');

describe('key-zone-layers', () => {
  it('treats API timestamps without offset as UTC', () => {
    expect(parseApiTime('2026-09-28T00:00:00')).toBe(Date.UTC(2026, 8, 28));
    expect(parseApiTime('2026-09-23T14:00:00Z')).toBe(Date.UTC(2026, 8, 23, 14));
    expect(parseApiTime(null)).toBeNull();
  });

  it('collects timeframes from every category, nPOCs by period', () => {
    expect(keyZoneTimeframes(payload)).toEqual(['4h', '1d', '1w']);
  });

  it('builds every default layer', () => {
    const items = buildKeyZoneItems(payload, DEFAULT_KEY_ZONE_LAYERS, all);
    const labels = items.map((i) => i.label);
    expect(labels).toContain('4H Level');
    expect(labels).toContain('1W nPOC');
    expect(labels).toContain('Current range outer POC');
    expect(labels).toContain('1D Bear OB');
    expect(labels).toContain('4H BSL');
    expect(labels).toContain('1D Fib 0.618');
  });

  it('dedupes levels and hides tested levels by default', () => {
    const levelLines = lines(buildKeyZoneItems(payload, DEFAULT_KEY_ZONE_LAYERS, all)).filter((l) =>
      l.label.endsWith('Level') || l.label.endsWith('Tested'),
    );
    expect(levelLines.map((l) => l.price)).toEqual([80000]);

    const withTested = lines(
      buildKeyZoneItems(payload, { ...DEFAULT_KEY_ZONE_LAYERS, testedLevels: true }, all),
    );
    const tested = withTested.find((l) => l.label === '1W Tested');
    expect(tested?.dash.length).toBeGreaterThan(0);
    expect(tested?.axisTag).toBe(false);
  });

  it('starts nPOC rays at their period start', () => {
    const npoc = lines(buildKeyZoneItems(payload, DEFAULT_KEY_ZONE_LAYERS, all)).find(
      (l) => l.label === '1W nPOC',
    );
    expect(npoc?.startX).toBe(Date.UTC(2026, 8, 28));
    expect(npoc?.endX).toBeNull();
  });

  it('draws one volume profile per range using the finest visible timeframe', () => {
    const items = buildKeyZoneItems(payload, DEFAULT_KEY_ZONE_LAYERS, all);
    const pocs = lines(items).filter((l) => l.label === 'Current range outer POC');
    expect(pocs.map((p) => p.price)).toEqual([83888]);
    expect(boxes(items).some((b) => b.top === 84544)).toBe(false);
    const vah = lines(items).find((l) => l.label === 'Current range outer VAH');
    const val = lines(items).find((l) => l.label === 'Current range outer VAL');
    expect(vah?.price).toBe(84544);
    expect(val?.price).toBe(82897);
    for (const l of [vah, val]) {
      expect(l?.startX).toBe(Date.UTC(2026, 8, 23, 14));
      expect(l?.endX).toBeNull();
      expect(l?.axisTag).toBe(true);
    }

    const only1d = buildKeyZoneItems(payload, DEFAULT_KEY_ZONE_LAYERS, (tf) => tf === '1d');
    expect(lines(only1d).find((l) => l.label === 'Current range outer POC')?.price).toBe(83912);
  });

  it('skips swept liquidity and colours order blocks by direction', () => {
    const items = boxes(buildKeyZoneItems(payload, DEFAULT_KEY_ZONE_LAYERS, all));
    expect(items.filter((b) => b.label.endsWith('SSL'))).toHaveLength(0);
    const ob = items.find((b) => b.label === '1D Bear OB');
    expect(ob?.fill).toContain('242,54,69');
    expect(ob?.startX).toBe(Date.UTC(2026, 8, 23));
  });

  it('respects layer and timeframe toggles', () => {
    const none = Object.fromEntries(
      Object.keys(DEFAULT_KEY_ZONE_LAYERS).map((k) => [k, false]),
    ) as typeof DEFAULT_KEY_ZONE_LAYERS;
    expect(buildKeyZoneItems(payload, none, all)).toHaveLength(0);
    const only4h = buildKeyZoneItems(payload, DEFAULT_KEY_ZONE_LAYERS, (tf) => tf === '4h');
    expect(only4h.map((i) => i.label)).not.toContain('1D Bear OB');
    expect(only4h.map((i) => i.label)).toContain('4H BSL');
  });
});
