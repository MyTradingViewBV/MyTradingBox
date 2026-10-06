import { TrimPipe } from './trim.pipe';

describe('TrimPipe', () => {
  const pipe = new TrimPipe();

  it('trims surrounding whitespace', () => {
    expect(pipe.transform('  hello \n')).toBe('hello');
  });

  it('keeps inner whitespace', () => {
    expect(pipe.transform(' a b ')).toBe('a b');
  });

  it('returns an empty (falsy) string for whitespace-only input', () => {
    expect(pipe.transform('   ')).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  it('treats null/undefined as empty', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
