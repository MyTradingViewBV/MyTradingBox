import { Pipe, PipeTransform } from '@angular/core';

/**
 * `{{ lines | join:'\n' }}` — `Array.prototype.join()` as a pure pipe.
 * Pure: only recomputes when the array reference changes, so bind it to
 * arrays that are replaced (not mutated in place) — type them `readonly`.
 */
@Pipe({ name: 'join', pure: true })
export class JoinPipe implements PipeTransform {
  transform(value: readonly unknown[] | null | undefined, separator?: string): string {
    return (value ?? []).join(separator);
  }
}
