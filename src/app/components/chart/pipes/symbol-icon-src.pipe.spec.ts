import { SymbolIconSrcPipe } from './symbol-icon-src.pipe';

describe('SymbolIconSrcPipe', () => {
  const pipe = new SymbolIconSrcPipe();

  it('wraps raw base64 as a PNG data URL', () => {
    expect(pipe.transform('iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  it('returns a full data URL unchanged', () => {
    expect(pipe.transform('data:image/svg+xml;base64,PHN2Zz4=')).toBe(
      'data:image/svg+xml;base64,PHN2Zz4=',
    );
  });

  it('trims surrounding whitespace before deciding', () => {
    expect(pipe.transform('  data:image/jpeg;base64,AAA  ')).toBe('data:image/jpeg;base64,AAA');
    expect(pipe.transform('  AAA\n')).toBe('data:image/png;base64,AAA');
  });

  it('returns null for empty/missing icons', () => {
    expect(pipe.transform('')).toBeNull();
    expect(pipe.transform(null)).toBeNull();
    expect(pipe.transform(undefined)).toBeNull();
  });

  it('keeps the original behaviour for whitespace-only icons (non-empty input)', () => {
    expect(pipe.transform('   ')).toBe('data:image/png;base64,');
  });
});
