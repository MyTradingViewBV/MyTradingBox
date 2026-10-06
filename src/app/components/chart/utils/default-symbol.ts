import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';

const PREFERRED_DEFAULT_SYMBOLS = ['BTCUSDT', 'BTC-EUR', 'BTCUSD'];

/**
 * Symbol a chart opens on when nothing is selected yet: BTC, never the first
 * entry of the (alphabetical) list, which would be e.g. ALTCOINDOMINANCE.
 */
export function pickDefaultSymbol(symbols: SymbolModel[]): SymbolModel | undefined {
  const name = (s: SymbolModel) => (s?.SymbolName || '').toString().toUpperCase();
  for (const preferred of PREFERRED_DEFAULT_SYMBOLS) {
    const found = symbols.find((s) => name(s) === preferred);
    if (found) return found;
  }
  return symbols.find((s) => name(s).startsWith('BTC')) ?? symbols[0];
}
