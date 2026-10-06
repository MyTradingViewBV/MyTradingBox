import { Pipe, PipeTransform } from '@angular/core';

/** CSS class for a P/L amount: 'pos' (> 0), 'neg' (< 0), otherwise 'neutral'. */
export function pnlClass(value: number): string {
  if (value > 0) return 'pos';
  if (value < 0) return 'neg';
  return 'neutral';
}

@Pipe({ name: 'pnlClass', pure: true })
export class PnlClassPipe implements PipeTransform {
  transform(value: number): string {
    return pnlClass(value);
  }
}
