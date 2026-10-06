import { Pipe, PipeTransform } from '@angular/core';

/** `{{ text | trim }}` — `String.prototype.trim()` as a pure pipe (null/undefined → ''). */
@Pipe({ name: 'trim', pure: true })
export class TrimPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return (value ?? '').trim();
  }
}
