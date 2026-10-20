import { describe, expect, it } from 'vitest';
import { TestCountReport, toTestCountViews } from './test-counts';

const row = (name: string, tests: number) => ({
  name,
  area: 'components',
  files: 1,
  tests,
  unit: tests,
  smoke: 0,
  e2e: 0,
});

describe('toTestCountViews', () => {
  it('sorts most-tested first and scales bars to the largest count', () => {
    const report: TestCountReport = {
      generatedAt: '2026-10-20T20:00:00.000Z',
      totals: { files: 3, tests: 15, unit: 15, smoke: 0, e2e: 0 },
      components: [row('login', 5), row('chart', 10), row('header', 0)],
    };
    const views = toTestCountViews(report);
    expect(views.map((v) => v.name)).toEqual(['chart', 'login', 'header']);
    expect(views.map((v) => v.share)).toEqual([100, 50, 0]);
  });

  it('gives no rows for missing data', () => {
    expect(toTestCountViews(null)).toEqual([]);
    expect(toTestCountViews({} as TestCountReport)).toEqual([]);
  });
});
