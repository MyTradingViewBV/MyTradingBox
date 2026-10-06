import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';

const PREFERRED_DEFAULT_SYMBOLS = ['BTCUSDT', 'BTC-EUR', 'BTCUSD'];

const symbolName = (s: SymbolModel | null | undefined) => (s?.SymbolName || '').toString().toUpperCase();

/**
 * Symbol a chart opens on when nothing is selected yet: BTC, never the first
 * entry of the (alphabetical) list, which would be e.g. ALTCOINDOMINANCE.
 */
export function pickDefaultSymbol(symbols: SymbolModel[]): SymbolModel | undefined {
  for (const preferred of PREFERRED_DEFAULT_SYMBOLS) {
    const found = symbols.find((s) => symbolName(s) === preferred);
    if (found) return found;
  }
  return symbols.find((s) => symbolName(s).startsWith('BTC')) ?? symbols[0];
}

/**
 * Symbol to show for an exchange's symbol list: the stored selection when this exchange
 * lists it, otherwise BTC. A symbol of the previous exchange (e.g. BTC-EUR on Bitvavo)
 * is not carried over to an exchange that does not have it (e.g. Bybit → BTCUSDT).
 * With an empty list (fetch failed) the stored selection is kept.
 */
export function resolveSelectedSymbol(
  symbols: SymbolModel[],
  stored: SymbolModel | null | undefined,
): { symbol: SymbolModel | undefined; isStoredMatch: boolean } {
  const storedName = symbolName(stored);
  const match = storedName ? symbols.find((s) => symbolName(s) === storedName) : undefined;
  if (match) return { symbol: match, isStoredMatch: true };
  if (!symbols.length) return { symbol: stored ?? undefined, isStoredMatch: false };
  return { symbol: pickDefaultSymbol(symbols), isStoredMatch: false };
}
