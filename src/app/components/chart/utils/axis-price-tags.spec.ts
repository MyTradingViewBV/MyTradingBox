import {
  AxisPriceTag,
  axisPriceTagResetPlugin,
  axisPriceTagsOf,
  copyablePrice,
  displayPrice,
  PRICE_AXIS_MENU_MAX_ITEMS,
  priceAxisMenuItems,
  registerAxisPriceTag,
} from './axis-price-tags';

const tag = (y: number, text: string, label = '', h = 16): AxisPriceTag => ({
  price: Number(copyablePrice(text)), y, h, label, text, color: '#fff',
});

describe('axis price tags', () => {
  it('registers tags per chart and clears them at the start of every draw', () => {
    const chart = {};
    registerAxisPriceTag(chart, tag(10, '100.00'));
    registerAxisPriceTag(chart, { ...tag(20, '90.00'), y: Number.NaN });
    expect(axisPriceTagsOf(chart).length).toBe(1);
    axisPriceTagResetPlugin.beforeDraw(chart);
    expect(axisPriceTagsOf(chart)).toEqual([]);
  });

  it('copies prices without thousands separators and shows them with', () => {
    expect(copyablePrice('84,545.75')).toBe('84545.75');
    expect(displayPrice('84545.75')).toBe('84,545.75');
    expect(displayPrice('0.00012345')).toBe('0.00012345');
  });

  it('lists the tags under the press nearest first, then the price at the press', () => {
    const tags = [tag(100, '84545.75', '1D nPOC'), tag(112, '84467.56', '1H Fib 0.618'), tag(300, '84380.18', 'far')];
    const items = priceAxisMenuItems(tags, 110, 4, tag(110, '84,480.00', '', 0));
    expect(items.map((i) => i.label)).toEqual(['1H Fib 0.618', '1D nPOC', '']);
    expect(items[2].text).toBe('84480.00');
    expect(items[0].display).toBe('84,467.56');
  });

  it('reaches a label within the slop and skips a pointer price a tag already offers', () => {
    const items = priceAxisMenuItems([tag(100, '84545.75', 'Long Entry', 18)], 115, 8, tag(115, '84545.75'));
    expect(items.length).toBe(1);
    expect(priceAxisMenuItems([tag(100, '84545.75', 'x', 18)], 120, 8, null)).toEqual([]);
  });

  it('caps the list and keeps room for the price at the press', () => {
    const tags = Array.from({ length: 10 }, (_, i) => tag(100, `${100 + i}.00`, `L${i}`));
    const items = priceAxisMenuItems(tags, 100, 0, tag(100, '99.50'));
    expect(items.length).toBe(PRICE_AXIS_MENU_MAX_ITEMS);
    expect(items[items.length - 1].text).toBe('99.50');
  });
});
