import { CHUNK_RELOAD_KEY, RELOAD_GUARD_MS, isChunkLoadError, reloadForChunkError } from './chunk-load-recovery';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

describe('chunk-load-recovery', () => {
  it('recognises chunk load errors from all browsers', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/chunk-A.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError('ChunkLoadError: Loading chunk 3 failed')).toBe(true);
    expect(isChunkLoadError(new Error('Cannot match any routes'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it('reloads to the target URL and records the time', () => {
    const storage = memoryStorage();
    const assign = vi.fn();
    expect(reloadForChunkError('/MyTradingBox/orders', 1_000_000, storage, assign)).toBe(true);
    expect(assign).toHaveBeenCalledWith('/MyTradingBox/orders');
    expect(storage.data[CHUNK_RELOAD_KEY]).toBe('1000000');
  });

  it('does not reload again within the guard window, but does after it', () => {
    const storage = memoryStorage({ [CHUNK_RELOAD_KEY]: '1000000' });
    const assign = vi.fn();
    expect(reloadForChunkError('/x', 1_000_000 + RELOAD_GUARD_MS - 1, storage, assign)).toBe(false);
    expect(assign).not.toHaveBeenCalled();
    expect(reloadForChunkError('/x', 1_000_000 + RELOAD_GUARD_MS, storage, assign)).toBe(true);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('still reloads when storage is unavailable', () => {
    const assign = vi.fn();
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => undefined,
    };
    expect(reloadForChunkError('/x', 1, broken, assign)).toBe(true);
    expect(reloadForChunkError('/x', 1, null, assign)).toBe(true);
    expect(assign).toHaveBeenCalledTimes(2);
  });
});
