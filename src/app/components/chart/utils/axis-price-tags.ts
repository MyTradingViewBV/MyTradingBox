/**
 * Price labels drawn in the price-axis column, per chart, as of its last draw. The copy-price menu
 * (long-press on the price axis on touch, right-click with a mouse) hit-tests these, so every label
 * that shows a price on the axis can be copied: key-zone levels, the crosshair, drawings and positions.
 */
export interface AxisPriceTag {
  price: number;
  /** Canvas y of the label's centre (CSS px). */
  y: number;
  /** Label height (CSS px). */
  h: number;
  /** What the price belongs to, as shown on the chart ("1D nPOC", "Long Entry"); '' for a bare level. */
  label: string;
  /** i18n key used instead of `label` (generic tags: crosshair, last price, price at the press). */
  labelKey?: string;
  /** Price text as drawn, without thousands separators: the text that is copied. */
  text: string;
  color: string;
}

export interface PriceAxisMenuItem {
  /** Copied text, e.g. "84545.75". */
  text: string;
  /** Shown price, e.g. "84,545.75". */
  display: string;
  label: string;
  labelKey?: string;
  color: string;
}

/** Most entries in the menu; the price at the press is always the last one. */
export const PRICE_AXIS_MENU_MAX_ITEMS = 6;

interface ChartWithAxisTags {
  _axisPriceTags?: AxisPriceTag[];
}

/** Record a price label drawn on `chart`'s price axis during the current draw. */
export function registerAxisPriceTag(chart: object | null | undefined, tag: AxisPriceTag): void {
  if (!chart || !Number.isFinite(tag.price) || !Number.isFinite(tag.y)) return;
  const c = chart as ChartWithAxisTags;
  (c._axisPriceTags ??= []).push(tag);
}

export function axisPriceTagsOf(chart: object | null | undefined): AxisPriceTag[] {
  return (chart as ChartWithAxisTags | null | undefined)?._axisPriceTags ?? [];
}

/** Starts every draw with an empty tag list, so only the labels on screen are known. */
export const axisPriceTagResetPlugin = {
  id: 'axisPriceTagReset',
  beforeDraw(chart: object): void {
    (chart as ChartWithAxisTags)._axisPriceTags = [];
  },
};

/** Price text to copy: no thousands separators ("84,545.75" -> "84545.75"). */
export function copyablePrice(text: string): string {
  return text.replace(/,/g, '').trim();
}

/** "84545.75" -> "84,545.75", keeping the decimals of the text. */
export function displayPrice(text: string): string {
  const value = Number(text);
  if (!Number.isFinite(value)) return text;
  const decimals = text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Menu entries for a press at canvas y `y`: the tags under it (nearest first, `slop` px extra reach for a
 * finger), then `pointer` (the price at the press) unless a tag already offers that exact text.
 */
export function priceAxisMenuItems(
  tags: readonly AxisPriceTag[],
  y: number,
  slop: number,
  pointer: AxisPriceTag | null,
): PriceAxisMenuItem[] {
  const hits = tags
    .filter((t) => Math.abs(t.y - y) <= t.h / 2 + slop)
    .sort((a, b) => Math.abs(a.y - y) - Math.abs(b.y - y));
  const items: PriceAxisMenuItem[] = [];
  const seen = new Set<string>();
  const add = (t: AxisPriceTag): void => {
    const text = copyablePrice(t.text);
    const key = `${text}|${t.labelKey ?? t.label}`;
    if (!text || seen.has(key)) return;
    seen.add(key);
    items.push({ text, display: displayPrice(text), label: t.label, labelKey: t.labelKey, color: t.color });
  };
  for (const t of hits) {
    if (items.length >= PRICE_AXIS_MENU_MAX_ITEMS - 1) break;
    add(t);
  }
  if (pointer && !items.some((i) => i.text === copyablePrice(pointer.text))) add(pointer);
  return items;
}
