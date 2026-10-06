import { Pipe, PipeTransform } from '@angular/core';

/**
 * Image `src` for a symbol icon: a full `data:image…` URL is returned as-is,
 * otherwise the value is treated as raw base64 PNG. Empty → null.
 */
export function symbolIconSrc(icon: string | null | undefined): string | null {
  if (!icon) return null;
  const trimmed = (icon || '').trim();
  // If already a full data URL, return as-is
  if (trimmed.startsWith('data:image')) return trimmed;
  // Default to PNG if MIME type is not provided
  return `data:image/png;base64,${trimmed}`;
}

/** `[src]="selectedSymbol?.Icon | symbolIconSrc"` */
@Pipe({ name: 'symbolIconSrc', pure: true })
export class SymbolIconSrcPipe implements PipeTransform {
  transform(icon: string | null | undefined): string | null {
    return symbolIconSrc(icon);
  }
}
