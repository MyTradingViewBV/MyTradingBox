import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { pickDefaultSymbol, resolveSelectedSymbol } from './default-symbol';

const sym = (SymbolName: string) => ({ SymbolName }) as SymbolModel;

describe('default symbol', () => {
  const bybit = [sym('ALTCOINDOMINANCE'), sym('BTCUSDT'), sym('ETHUSDT')];

  it('picks BTC over the first alphabetical symbol', () => {
    expect(pickDefaultSymbol(bybit)?.SymbolName).toBe('BTCUSDT');
  });

  it('keeps the stored symbol when the exchange lists it (case-insensitive)', () => {
    const r = resolveSelectedSymbol(bybit, sym('ethusdt'));
    expect(r).toEqual({ symbol: bybit[2], isStoredMatch: true });
  });

  it('falls back to BTC when the stored symbol belongs to another exchange', () => {
    const r = resolveSelectedSymbol(bybit, sym('BTC-EUR'));
    expect(r).toEqual({ symbol: bybit[1], isStoredMatch: false });
  });

  it('falls back to BTC when nothing is stored', () => {
    expect(resolveSelectedSymbol(bybit, null).symbol?.SymbolName).toBe('BTCUSDT');
  });

  it('keeps the stored symbol when the symbol list is empty', () => {
    const stored = sym('BTC-EUR');
    expect(resolveSelectedSymbol([], stored)).toEqual({ symbol: stored, isStoredMatch: false });
  });
});
