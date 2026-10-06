import { Pipe, PipeTransform } from '@angular/core';

export type SignalTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'unknown';

/** Tier name contained in a capital-flow signal string (case-insensitive). */
export function signalTier(signalType: string | undefined): SignalTier {
  const s = (signalType || '').toLowerCase();
  if (s.includes('bronze')) return 'bronze';
  if (s.includes('silver')) return 'silver';
  if (s.includes('gold')) return 'gold';
  if (s.includes('platinum')) return 'platinum';
  if (s.includes('diamond')) return 'diamond';
  return 'unknown';
}

export function signalIsBullish(signalType: string | undefined): boolean {
  return (signalType || '').toLowerCase().includes('bull');
}

export function signalIsBearish(signalType: string | undefined): boolean {
  return (signalType || '').toLowerCase().includes('bear');
}

/** Full class list for a watchlist signal chip. */
export function signalChipClass(signalType: string | undefined): string {
  const base = 'tv-signal-chip';
  if (signalIsBullish(signalType)) return `${base} tier-${signalTier(signalType)} dir-bull`;
  if (signalIsBearish(signalType)) return `${base} tier-${signalTier(signalType)} dir-bear`;
  return `${base} inactive`;
}

/** Compact display name: 'DOMINANCE' (any case) becomes '-D'. */
export function shortSymbolName(name: string): string {
  return name.replace(/DOMINANCE/gi, '-D');
}

/** `[class]="us.capitalFlow1hSignal | signalChipClass"` */
@Pipe({ name: 'signalChipClass', pure: true })
export class SignalChipClassPipe implements PipeTransform {
  transform(signalType: string | undefined): string {
    return signalChipClass(signalType);
  }
}

/** `[markerTier]="(us.capitalFlow12mTier || us.capitalFlow12mSignal) | signalTier"` */
@Pipe({ name: 'signalTier', pure: true })
export class SignalTierPipe implements PipeTransform {
  transform(signalType: string | undefined): SignalTier {
    return signalTier(signalType);
  }
}

/**
 * `{{ (us.SymbolName || (us.SymbolId ?? '')) | shortSymbolName }}` — numbers
 * (a symbol-id fallback) are stringified first.
 */
@Pipe({ name: 'shortSymbolName', pure: true })
export class ShortSymbolNamePipe implements PipeTransform {
  transform(name: string | number | null | undefined): string {
    return shortSymbolName(String(name ?? ''));
  }
}
