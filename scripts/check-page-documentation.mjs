import { execFileSync } from 'node:child_process';

const documentationPaths = [
  'docs/components/',
  'docs/ROUTES_AND_PERMISSIONS.md',
  'docs/DOCUMENTATION_STATUS.md',
  'docs/USER_MANUAL.md',
];

const sourcePrefixes = [
  'src/app/components/',
  'src/app/modules/shared/auth/guards/',
];

const sourceFiles = new Set(['src/app/app.routes.ts', 'src/app/app.ts']);

function getDiffRange() {
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}...HEAD`;
  }

  const before = process.env.GITHUB_EVENT_BEFORE;
  const after = process.env.GITHUB_SHA || 'HEAD';
  if (before && !/^0+$/.test(before)) {
    return `${before}...${after}`;
  }

  return 'HEAD^...HEAD';
}

function getChangedPaths() {
  const range = getDiffRange();
  const output = execFileSync(
    'git',
    ['diff', '--name-only', range, '--'],
    { encoding: 'utf8' },
  );

  return output
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

function isPageSource(path) {
  return sourceFiles.has(path) || sourcePrefixes.some((prefix) => path.startsWith(prefix));
}

function isDocumentation(path) {
  return documentationPaths.some((prefix) => path === prefix || path.startsWith(prefix));
}

try {
  const changedPaths = getChangedPaths();
  const changedPageSource = changedPaths.some(isPageSource);
  const changedDocumentation = changedPaths.some(isDocumentation);

  if (changedPageSource && !changedDocumentation) {
    console.error('Page source changed without a documentation change.');
    console.error('Update the affected page guide, route matrix, status ledger, or user manual.');
    process.exit(1);
  }

  console.log(
    changedPageSource
      ? 'Page source and documentation changes detected.'
      : 'No page source change requires documentation validation.',
  );
} catch (error) {
  console.error('Unable to determine changed files for documentation validation.');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
