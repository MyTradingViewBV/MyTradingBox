import { parseChartPriceTickerMessage } from './chart-price-ticker.service';

describe('chart price ticker', () => {
  it('parses a Binance combined mini-ticker message', () => {
    expect(
      parseChartPriceTickerMessage(
        JSON.stringify({ data: { s: 'BTCUSDT', c: '104321.45' } }),
      ),
    ).toEqual({ symbol: 'BTCUSDT', price: 104321.45 });
  });

  it('rejects malformed or non-numeric ticker messages', () => {
    expect(parseChartPriceTickerMessage('{bad json')).toBeNull();
    expect(
      parseChartPriceTickerMessage(JSON.stringify({ s: 'BTCUSDT', c: 'NaN' })),
    ).toBeNull();
  });
});
