import { SetHasPipe } from './set-has.pipe';

describe('SetHasPipe', () => {
  const pipe = new SetHasPipe();

  it('returns true for a member', () => {
    expect(pipe.transform(new Set([1, 2]), 2)).toBe(true);
  });

  it('returns false for a non-member', () => {
    expect(pipe.transform(new Set([1, 2]), 3)).toBe(false);
  });

  it('returns false for an empty set', () => {
    expect(pipe.transform(new Set<number>(), 1)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(pipe.transform<number>(null, 1)).toBe(false);
    expect(pipe.transform<number>(undefined, 1)).toBe(false);
  });
});
