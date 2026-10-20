/** Test counts as generated into assets/test-counts.json by scripts/generate-test-counts.js. */
export interface TestCountRow {
  name: string;
  area: string;
  files: number;
  tests: number;
  unit: number;
  smoke: number;
  e2e: number;
}

export interface TestCountReport {
  generatedAt: string;
  totals: { files: number; tests: number; unit: number; smoke: number; e2e: number };
  components: TestCountRow[];
}

/** A row as the Tests tab shows it: bar width relative to the best-tested component. */
export interface TestCountView extends TestCountRow {
  share: number;
}

/** Rows sorted most-tested first, each with its bar width (0–100). Bad data gives no rows. */
export function toTestCountViews(report: TestCountReport | null | undefined): TestCountView[] {
  const rows = Array.isArray(report?.components) ? report.components : [];
  const max = rows.reduce((m, r) => Math.max(m, r.tests || 0), 0);
  return [...rows]
    .sort((a, b) => (b.tests || 0) - (a.tests || 0) || a.name.localeCompare(b.name))
    .map((r) => ({ ...r, share: max ? Math.round(((r.tests || 0) / max) * 100) : 0 }));
}
