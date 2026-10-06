/*
  Turns the /KeyZones payload into drawable items for keyZonePainterPlugin.
  Styling follows TradingView: horizontal rays from their origin to the right
  edge, zones as translucent boxes, a short text label at the right end of each
  line and a coloured price tag on the price axis.
*/
import { KeyZonesModel } from 'src/app/modules/shared/models/chart/keyZones.dto';
import { normalizeTimeframe } from './timeframe-bucketing';

export type KeyZoneLayer =
  | 'levels'
  | 'testedLevels'
  | 'npoc'
  | 'volumeProfile'
  | 'orderBlocks'
  | 'liquidity'
  | 'fib';

export type KeyZoneLayerFlags = Record<KeyZoneLayer, boolean>;

/** Settings-panel order + i18n keys. */
export const KEY_ZONE_LAYERS: ReadonlyArray<{ key: KeyZoneLayer; label: string }> = [
  { key: 'levels', label: 'CHART.KZ_LEVELS' },
  { key: 'testedLevels', label: 'CHART.KZ_TESTED_LEVELS' },
  { key: 'npoc', label: 'CHART.KZ_NPOC' },
  { key: 'volumeProfile', label: 'CHART.KZ_VOLUME_PROFILE' },
  { key: 'orderBlocks', label: 'CHART.KZ_ORDER_BLOCKS' },
  { key: 'liquidity', label: 'CHART.KZ_LIQUIDITY' },
  { key: 'fib', label: 'CHART.KZ_FIB' },
];

export const DEFAULT_KEY_ZONE_LAYERS: KeyZoneLayerFlags = {
  levels: true,
  testedLevels: false,
  npoc: true,
  volumeProfile: true,
  orderBlocks: true,
  liquidity: true,
  fib: true,
};

/** Horizontal line; startX/endX in ms, null = runs to that edge of the plot. */
export interface KeyZoneLineItem {
  kind: 'line';
  price: number;
  startX: number | null;
  endX: number | null;
  color: string;
  width: number;
  dash: number[];
  label: string;
  /** Show a price tag on the price axis. */
  axisTag: boolean;
  /** Higher wins when tags or labels collide. */
  priority: number;
}

/** Price zone; startX/endX in ms, null = runs to that edge of the plot. */
export interface KeyZoneBoxItem {
  kind: 'box';
  top: number;
  bottom: number;
  startX: number | null;
  endX: number | null;
  fill: string;
  border: string;
  label: string;
  labelColor: string;
  priority: number;
}

export type KeyZoneItem = KeyZoneLineItem | KeyZoneBoxItem;

const TF_RANK: Record<string, number> = { '1h': 1, '4h': 2, '1d': 3, '1w': 4, '1M': 5, '1j': 6 };

// Per-timeframe colours (same families as the WPF naked level colours).
const TF_COLORS: Record<string, string> = {
  '30m': '#5c6bc0',
  '1h': '#2196f3',
  '4h': '#00bfa5',
  '1d': '#ff9800',
  '1w': '#f23645',
  '1M': '#ab47bc',
  '1j': '#4caf50',
};

const BULL = '8,153,129';
const BEAR = '242,54,69';
const BSL = '236,64,122';
const SSL = '38,198,218';
const VP_POC = '#ffd54f';
const VP_VA = '41,98,255';

export function timeframeColor(tf: string): string {
  return TF_COLORS[normalizeTimeframe(tf)] ?? '#9598a1';
}

/** Short display form: '4H', '1D', '1W', '1M', '15m'. */
export function timeframeTag(tf: string): string {
  const key = normalizeTimeframe(tf);
  if (key === '1M' || key.endsWith('m')) return key;
  return key.toUpperCase();
}

function rank(tf: string): number {
  return TF_RANK[normalizeTimeframe(tf)] ?? 0;
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** API timestamps without an offset are UTC. */
export function parseApiTime(value: unknown): number | null {
  if (value == null || value === '') return null;
  let s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(s)) s += 'Z';
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Every timeframe present in the payload (drives the per-timeframe toggles). */
export function keyZoneTimeframes(kz: KeyZonesModel | null | undefined): string[] {
  if (!kz) return [];
  const set = new Set<string>();
  const add = (tf: unknown): void => {
    const key = normalizeTimeframe(String(tf ?? ''));
    if (key) set.add(key);
  };
  kz.Levels?.forEach((l) => add(l.Timeframe));
  kz.NakedPocLevels?.forEach((n) => add(n.Period));
  kz.FixedVolumeProfileLevels?.forEach((f) => add(f.Timeframe));
  kz.OrderBlocks?.forEach((o) => add(o.Timeframe));
  kz.LiquidityLevels?.forEach((l) => add(l.Timeframe));
  kz.FibLevels?.forEach((f) => add(f.Timeframe));
  kz.VolumeProfiles?.forEach((v) => add(v.Timeframe));
  return Array.from(set).sort((a, b) => rank(a) - rank(b));
}

export function buildKeyZoneItems(
  kz: KeyZonesModel | null | undefined,
  layers: KeyZoneLayerFlags,
  isTimeframeVisible: (tf: string) => boolean,
): KeyZoneItem[] {
  if (!kz) return [];
  const items: KeyZoneItem[] = [];

  // Support / resistance levels
  if (layers.levels || layers.testedLevels) {
    const seen = new Set<string>();
    kz.Levels?.forEach((l) => {
      const price = num(l.Price);
      if (price == null || !isTimeframeVisible(l.Timeframe)) return;
      const naked = l.Naked !== false;
      if (naked ? !layers.levels : !layers.testedLevels) return;
      const key = `${normalizeTimeframe(l.Timeframe)}|${price}|${naked}`;
      if (seen.has(key)) return;
      seen.add(key);
      const color = timeframeColor(l.Timeframe);
      const tf = timeframeTag(l.Timeframe);
      items.push({
        kind: 'line',
        price,
        startX: null,
        endX: null,
        color: naked ? color : withAlpha(color, 0.45),
        width: 1,
        dash: naked ? [] : [2, 3],
        label: naked ? `${tf} Level` : `${tf} Tested`,
        axisTag: naked,
        priority: rank(l.Timeframe) * 10 + (naked ? 2 : 0),
      });
    });
  }

  // Naked POCs: dashed rays from the start of their period
  if (layers.npoc) {
    kz.NakedPocLevels?.forEach((n) => {
      const price = num(n.Poc);
      if (price == null || n.IsNaked === false || !isTimeframeVisible(n.Period)) return;
      const color = timeframeColor(n.Period);
      items.push({
        kind: 'line',
        price,
        startX: parseApiTime(n.PeriodStart),
        endX: null,
        color,
        width: 1.5,
        dash: [6, 4],
        label: `${timeframeTag(n.Period)} nPOC`,
        axisTag: true,
        priority: rank(n.Period) * 10 + 5,
      });
    });
  }

  // Fixed range volume profiles: POC/VAH/VAL lines extended to the right
  if (layers.volumeProfile) {
    // The API returns each profile per timeframe with near-identical values;
    // draw the finest visible one only.
    const byProfile = new Map<string, NonNullable<KeyZonesModel['FixedVolumeProfileLevels']>[number]>();
    kz.FixedVolumeProfileLevels?.forEach((f) => {
      if (!isTimeframeVisible(f.Timeframe)) return;
      const key = `${f.ProfileId}|${f.Name ?? ''}`;
      const prev = byProfile.get(key);
      if (!prev || rank(f.Timeframe) < rank(prev.Timeframe)) byProfile.set(key, f);
    });
    byProfile.forEach((f) => {
      const start = parseApiTime(f.StartTime);
      const poc = num(f.PocPrice);
      const vah = num(f.ValueAreaHigh);
      const val = num(f.ValueAreaLow);
      const name = (f.Name || 'Volume profile').trim();
      for (const [price, tag] of [[vah, 'VAH'], [val, 'VAL']] as const) {
        if (price == null) continue;
        items.push({
          kind: 'line',
          price,
          startX: start,
          endX: null,
          color: `rgb(${VP_VA})`,
          width: 1,
          dash: [3, 3],
          label: `${name} ${tag}`,
          axisTag: true,
          priority: 41,
        });
      }
      if (poc != null) {
        items.push({
          kind: 'line',
          price: poc,
          startX: start,
          endX: null,
          color: VP_POC,
          width: 2,
          dash: [],
          label: `${name} POC`,
          axisTag: true,
          priority: 45,
        });
      }
    });
  }

  // Order blocks: zones from the origin candle to the right edge
  if (layers.orderBlocks) {
    kz.OrderBlocks?.forEach((o) => {
      const top = num(o.Top);
      const bottom = num(o.Bottom);
      if (top == null || bottom == null || !isTimeframeVisible(o.Timeframe)) return;
      const bull = String(o.Type || '').toLowerCase().startsWith('bull');
      const rgb = bull ? BULL : BEAR;
      items.push({
        kind: 'box',
        top: Math.max(top, bottom),
        bottom: Math.min(top, bottom),
        startX: parseApiTime(o.CandleTime),
        endX: null,
        fill: `rgba(${rgb},0.14)`,
        border: `rgba(${rgb},0.55)`,
        label: `${timeframeTag(o.Timeframe)} ${bull ? 'Bull' : 'Bear'} OB`,
        labelColor: `rgb(${rgb})`,
        priority: rank(o.Timeframe) * 10 + 4,
      });
    });
  }

  // Liquidity pools that have not been swept yet
  if (layers.liquidity) {
    kz.LiquidityLevels?.forEach((l) => {
      const top = num(l.TopPrice);
      const bottom = num(l.BottomPrice);
      if (top == null || bottom == null || l.Touched || !isTimeframeVisible(l.Timeframe)) return;
      const buySide = Number(l.Side) > 0;
      const rgb = buySide ? BSL : SSL;
      items.push({
        kind: 'box',
        top: Math.max(top, bottom),
        bottom: Math.min(top, bottom),
        startX: parseApiTime(l.LeftTime),
        endX: null,
        fill: `rgba(${rgb},0.16)`,
        border: `rgba(${rgb},0.6)`,
        label: `${timeframeTag(l.Timeframe)} ${buySide ? 'BSL' : 'SSL'}`,
        labelColor: `rgb(${rgb})`,
        priority: rank(l.Timeframe) * 10 + 3,
      });
    });
  }

  // Fibonacci retracements (0.618 golden pocket, 0.786)
  if (layers.fib) {
    kz.FibLevels?.forEach((f) => {
      const price = num(f.Price);
      if (price == null || !isTimeframeVisible(f.Timeframe)) return;
      const level = Number(f.Level);
      const golden = Math.abs(level - 0.618) < 1e-6;
      // Kept subtle: the payload has many fib levels across timeframes.
      const color = golden ? 'rgba(255,215,0,0.75)' : 'rgba(255,167,38,0.55)';
      const levelText = Number.isFinite(level) ? `${level}` : '';
      items.push({
        kind: 'line',
        price,
        startX: null,
        endX: null,
        color,
        width: 1,
        dash: [2, 3],
        label: `${timeframeTag(f.Timeframe)} Fib ${levelText}`.trim(),
        axisTag: golden,
        priority: rank(f.Timeframe) * 10 + 1,
      });
    });
  }

  // Legacy payload: plain POC/VAH/VAL per timeframe
  if (layers.volumeProfile) {
    kz.VolumeProfiles?.forEach((vp) => {
      if (!isTimeframeVisible(vp.Timeframe)) return;
      const tf = timeframeTag(vp.Timeframe);
      for (const [value, tag, color] of [
        [vp.Poc, 'POC', VP_POC],
        [vp.Vah, 'VAH', `rgb(${VP_VA})`],
        [vp.Val, 'VAL', `rgb(${VP_VA})`],
      ] as const) {
        const price = num(value);
        if (price == null) continue;
        items.push({
          kind: 'line',
          price,
          startX: null,
          endX: null,
          color,
          width: tag === 'POC' ? 2 : 1,
          dash: tag === 'POC' ? [] : [3, 3],
          label: `${tf} ${tag}`,
          axisTag: true,
          priority: rank(vp.Timeframe) * 10 + (tag === 'POC' ? 5 : 1),
        });
      }
    });
  }

  return items;
}
