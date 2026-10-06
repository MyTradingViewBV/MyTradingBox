import { PnlClassPipe } from './pnl-class.pipe';

describe('PnlClassPipe', () => {
  const pipe = new PnlClassPipe();

  it('maps positive amounts to pos', () => {
    expect(pipe.transform(12.5)).toBe('pos');
    expect(pipe.transform(0.0001)).toBe('pos');
  });

  it('maps negative amounts to neg', () => {
    expect(pipe.transform(-3)).toBe('neg');
  });

  it('maps zero to neutral', () => {
    expect(pipe.transform(0)).toBe('neutral');
    expect(pipe.transform(-0)).toBe('neutral');
  });

  it('maps non-comparable values (NaN, null, undefined) to neutral', () => {
    expect(pipe.transform(NaN)).toBe('neutral');
    expect(pipe.transform(null as unknown as number)).toBe('neutral');
    expect(pipe.transform(undefined as unknown as number)).toBe('neutral');
  });
});
