import { JoinPipe } from './join.pipe';

describe('JoinPipe', () => {
  const pipe = new JoinPipe();

  it('joins with the given separator', () => {
    expect(pipe.transform(['a', 'b', 'c'], '\n')).toBe('a\nb\nc');
  });

  it('uses the default comma separator when none is given', () => {
    expect(pipe.transform(['a', 'b'])).toBe('a,b');
  });

  it('returns an empty string for an empty array', () => {
    expect(pipe.transform([], '\n')).toBe('');
  });

  it('treats null/undefined as an empty array', () => {
    expect(pipe.transform(null, '\n')).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
