import { Pipe, PipeTransform } from '@angular/core';
import { normalizeTimeframe } from '../utils/timeframe-bucketing';

/**
 * Display label for a key-zone timeframe in the settings panel: minutes stay
 * lowercase ('3m'), hours/days/weeks upper-case ('4H', '1W') and the month
 * is '1M' — so month and minute never render as the same label.
 */
export function keyZoneTimeframeLabel(tf: string): string {
  const key = normalizeTimeframe(tf);
  if (key === '1M' || key.endsWith('m')) return key;
  return key.toUpperCase();
}

/**
 * Per-timeframe key-zone toggle lookup. The key-zone store keys flags by the
 * shared normalized timeframe ('1M' month stays distinct from '1m' minute).
 */
export function keyZoneTimeframeFlag(
  flags: Readonly<Record<string, boolean>>,
  tf: string,
): boolean {
  const key = normalizeTimeframe(tf);
  return !!key && !!flags[key];
}

/** `{{ tf | keyZoneTimeframeLabel }}` */
@Pipe({ name: 'keyZoneTimeframeLabel', pure: true })
export class KeyZoneTimeframeLabelPipe implements PipeTransform {
  transform(tf: string): string {
    return keyZoneTimeframeLabel(tf);
  }
}

/**
 * `[checked]="tf | keyZoneTimeframeEnabled: keyZoneTimeframeFlags"`.
 * Pure: pass the flags object that is replaced (never mutated) on change.
 */
@Pipe({ name: 'keyZoneTimeframeEnabled', pure: true })
export class KeyZoneTimeframeEnabledPipe implements PipeTransform {
  transform(tf: string, flags: Readonly<Record<string, boolean>>): boolean {
    return keyZoneTimeframeFlag(flags, tf);
  }
}
