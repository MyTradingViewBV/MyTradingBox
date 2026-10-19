import { Location } from '@angular/common';
import { inject } from '@angular/core';
import { NavigationError } from '@angular/router';

/**
 * After a deploy, a tab still running the old build asks for lazy chunks whose
 * hashed file names no longer exist on the host, and navigation fails with
 * "Failed to fetch dynamically imported module". A full page load of the
 * target URL picks up the new build. The reload happens at most once per
 * RELOAD_GUARD_MS, so a chunk that is really missing cannot cause a loop.
 */
export const CHUNK_RELOAD_KEY = 'mtb.chunkReloadAt';
export const RELOAD_GUARD_MS = 30_000;

const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
  /ChunkLoadError/i,
];

export function isChunkLoadError(error: unknown): boolean {
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error ?? '');
  return CHUNK_ERROR_PATTERNS.some((p) => p.test(text));
}

/** Reloads to `url` unless a chunk reload happened within the guard window; true when it reloads. */
export function reloadForChunkError(
  url: string,
  now = Date.now(),
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeSessionStorage(),
  assign: (url: string) => void = (u) => window.location.assign(u),
): boolean {
  try {
    const last = Number(storage?.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false;
    storage?.setItem(CHUNK_RELOAD_KEY, `${now}`);
  } catch {
    // Without storage there is no loop guard; still reload once for this error.
  }
  assign(url);
  return true;
}

/** Router navigation error handler (runs in an injection context). */
export function handleChunkLoadNavigationError(error: NavigationError): void {
  if (!isChunkLoadError(error.error)) return;
  reloadForChunkError(inject(Location).prepareExternalUrl(error.url));
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
