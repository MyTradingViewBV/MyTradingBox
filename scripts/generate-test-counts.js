const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const outputPath = path.resolve(root, 'src', 'assets', 'test-counts.json');
const componentsDir = path.join(root, 'src', 'app', 'components');

// One test case: it(...) / test(...), optionally with a Vitest/Playwright
// modifier (it.skip, test.only, it.each([...])). test.describe/test.use are not tests.
const TEST_CALL = /(?<![\w.$])(?:it|test)(?:\.(?:only|skip|todo|fails|concurrent|sequential|each))*\s*\(/g;

function listSpecs(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...listSpecs(full));
    else if (entry.name.endsWith('.spec.ts')) result.push(full);
  }
  return result;
}

function countTests(file) {
  const source = fs
    .readFileSync(file, 'utf8')
    // Commented-out tests do not run.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return (source.match(TEST_CALL) || []).length;
}

/** Which component (or app area) a spec file belongs to. */
function ownerOf(relative) {
  const parts = relative.split('/');
  if (parts[0] === 'e2e') return { name: 'e2e', area: 'e2e' };
  if (parts[0] === 'src' && parts[1] === 'app') {
    const [, , top, sub] = parts;
    if (top === 'components' && parts.length > 4) return { name: sub, area: 'components' };
    if (top === 'modules' && parts.length > 5) return { name: `${sub}/${parts[4]}`, area: 'modules' };
    if (top === 'store' && parts.length > 4) return { name: `store/${sub}`, area: 'store' };
    if (parts.length === 3) return { name: 'app', area: 'app' };
    return { name: top, area: top };
  }
  return { name: parts.slice(0, 2).join('/'), area: 'other' };
}

function kindOf(relative) {
  if (relative.startsWith('e2e/')) return 'e2e';
  return relative.endsWith('.smoke.spec.ts') ? 'smoke' : 'unit';
}

function main() {
  const rows = new Map();
  const row = (owner) => {
    const key = `${owner.area}|${owner.name}`;
    if (!rows.has(key)) {
      rows.set(key, { name: owner.name, area: owner.area, files: 0, tests: 0, unit: 0, smoke: 0, e2e: 0 });
    }
    return rows.get(key);
  };

  // Every component gets a row, so the ones without tests stand out.
  for (const entry of fs.readdirSync(componentsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) row({ name: entry.name, area: 'components' });
  }

  const specs = [...listSpecs(path.join(root, 'src')), ...listSpecs(path.join(root, 'e2e'))];
  for (const file of specs) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const tests = countTests(file);
    const r = row(ownerOf(relative));
    r.files += 1;
    r.tests += tests;
    r[kindOf(relative)] += tests;
  }

  const components = [...rows.values()].sort((a, b) => b.tests - a.tests || a.name.localeCompare(b.name));
  const sum = (key) => components.reduce((n, r) => n + r[key], 0);
  const report = {
    generatedAt: new Date().toISOString(),
    totals: { files: sum('files'), tests: sum('tests'), unit: sum('unit'), smoke: sum('smoke'), e2e: sum('e2e') },
    components,
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(
    `Test counts generated: ${path.relative(process.cwd(), outputPath)} (${report.totals.tests} tests in ${report.totals.files} files)`,
  );
}

if (require.main === module) {
  main();
}

module.exports = { ownerOf, kindOf };
