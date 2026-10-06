import { Pipe, PipeTransform } from '@angular/core';

/** Symbols that can never be removed from the watchlist: BTCUSDT and any *DOMINANCE* symbol. */
export function isProtectedSymbol(name: string): boolean {
  const n = (name || '').toUpperCase();
  return n === 'BTCUSDT' || n.includes('DOMINANCE');
}

/** `@if (vm.name | isProtectedSymbol)` */
@Pipe({ name: 'isProtectedSymbol', pure: true })
export class IsProtectedSymbolPipe implements PipeTransform {
  transform(name: string): boolean {
    return isProtectedSymbol(name);
  }
}
