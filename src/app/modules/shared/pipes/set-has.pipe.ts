import { Pipe, PipeTransform } from '@angular/core';

/**
 * `{{ ids | setHas: id }}` — `Set.prototype.has()` as a pure pipe.
 * Pure: only recomputes when the set reference (or key) changes, so bind it
 * to sets that are replaced on change (type them `ReadonlySet`).
 */
@Pipe({ name: 'setHas', pure: true })
export class SetHasPipe implements PipeTransform {
  transform<T>(set: ReadonlySet<T> | null | undefined, key: T): boolean {
    return !!set && set.has(key);
  }
}
