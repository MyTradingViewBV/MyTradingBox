import { IsProtectedSymbolPipe } from './is-protected-symbol.pipe';

describe('IsProtectedSymbolPipe', () => {
  const pipe = new IsProtectedSymbolPipe();

  it('protects BTCUSDT (case-insensitive)', () => {
    expect(pipe.transform('BTCUSDT')).toBe(true);
    expect(pipe.transform('btcusdt')).toBe(true);
  });

  it('protects any dominance symbol', () => {
    expect(pipe.transform('BTC.DOMINANCE')).toBe(true);
    expect(pipe.transform('usdtdominance')).toBe(true);
  });

  it('does not protect other symbols, including BTCUSDT look-alikes', () => {
    expect(pipe.transform('ETHUSDT')).toBe(false);
    expect(pipe.transform('BTCUSDT.P')).toBe(false);
  });

  it('treats empty/missing names as unprotected', () => {
    expect(pipe.transform('')).toBe(false);
    expect(pipe.transform(undefined as unknown as string)).toBe(false);
  });
});
