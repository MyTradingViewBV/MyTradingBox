const fs = require('node:fs');
const path = require('node:path');

const releaseLogPath = path.resolve(__dirname, '..', 'updates', 'RELEASE_LOG.md');
const outputPath = path.resolve(__dirname, '..', 'src', 'assets', 'release-notes.mock.json');

// Human-readable labels per conventional-commit type.
const TYPE_LABELS = {
  feat: 'New feature',
  fix: 'Bug fix',
  perf: 'Improvement',
  refactor: 'Improvement',
  style: 'Improvement',
  chore: 'Maintenance',
  build: 'Maintenance',
  ci: 'Maintenance',
  docs: 'Documentation',
  test: 'Testing',
};

// Internal bookkeeping that means nothing to an end user.
const NOISE_FRAGMENT = [
  /^\.+$/,
  /^…+$/,
  /^merge\b/i,
  /^(chore:\s*)?(update|bump)\s+(the\s+)?version\b/i,
  /^(update|enhance|add)\b.*\brelease\s+(notes?|log)\b/i,
  /^update\s+(the\s+)?(deployment|release)\s+log\b/i,
  /^release\s+(notes?|log)\b/i,
  /^no new commits found\.?$/i,
];

function isNoise(text) {
  const letters = text.replace(/[^a-z]/gi, '');
  if (letters.length < 3) return true;
  return NOISE_FRAGMENT.some((re) => re.test(text));
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function labelForSubject(subject) {
  const typeMatch = subject.match(/^(\w+)(\([^)]*\))?!?:\s*/);
  if (typeMatch && TYPE_LABELS[typeMatch[1].toLowerCase()]) {
    return TYPE_LABELS[typeMatch[1].toLowerCase()];
  }
  if (/^fix/i.test(subject)) return 'Bug fix';
  if (/^(add|implement|introduce|new)\b/i.test(subject)) return 'New feature';
  return 'Improvement';
}

// Split on top-level commas only, so parenthesized asides stay intact.
function splitFragments(subject) {
  const fragments = [];
  let depth = 0;
  let current = '';
  for (const ch of subject) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      fragments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fragments.push(current);
  return fragments
    .map((fragment) => fragment.trim().replace(/^and\s+/i, '').trim())
    .filter(Boolean);
}

// Developer-facing work that end users never notice.
const HIDDEN_TYPES = /^(test|docs|chore|build|ci|style)(\([^)]*\))?!?:/i;

// Turn one raw commit subject into zero or more user-friendly entries.
function entriesFromSubject(rawSubject) {
  if (HIDDEN_TYPES.test(rawSubject)) return [];

  const label = labelForSubject(rawSubject);

  const subject = rawSubject
    // Drop the conventional-commit prefix, e.g. "feat(chart): ".
    .replace(/^\w+(\([^)]*\))?!?:\s*/, '')
    // Drop version/task markers, e.g. "(v0.2.33)" or "(T6)".
    .replace(/\s*\((v?\d+\.\d+\.\d+|T\d+)\)/gi, '')
    .trim();

  // Compound subjects ("do A, improve B, and fix C") become separate bullets.
  const fragments = splitFragments(subject);

  const entries = [];
  for (const fragment of fragments) {
    if (isNoise(fragment)) continue;
    entries.push({
      title: capitalize(fragment),
      summary: label,
    });
  }
  return entries;
}

function formatDate(rawDate) {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return rawDate;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function parseReleaseLog(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const withoutMarker = normalized.replace(/^LAST_DEPLOY_COMMIT=.*$/gim, '').trim();
  const chunks = withoutMarker
    .split('\n---\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => /^Deploy:\s+/m.test(chunk) && /^Version:\s+/m.test(chunk));

  const releases = [];
  const seenVersions = new Set();
  const seenTitles = new Set();

  for (const chunk of chunks.reverse()) {
    const deployMatch = chunk.match(/^Deploy:\s+(.+)$/m);
    const versionMatch = chunk.match(/^Version:\s+(.+)$/m);
    const changesMatch = chunk.match(/^Changes:\s*([\s\S]*)$/m);

    if (!deployMatch || !versionMatch) continue;

    const rawVersion = String(versionMatch[1] || '').trim();
    const normalizedVersion = (rawVersion.match(/(\d+\.\d+\.\d+)/) || [rawVersion])[0];
    const version = normalizedVersion.startsWith('v') ? normalizedVersion : `v${normalizedVersion}`;
    const versionKey = version.toLowerCase();
    if (seenVersions.has(versionKey)) {
      continue;
    }
    seenVersions.add(versionKey);

    const entries = [];
    if (changesMatch) {
      const lines = changesMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '));

      for (const line of lines) {
        const commitMatch = line.match(/^-\s+(?:\d{4}-\d{2}-\d{2}\s+[a-f0-9]{7,}\s+)?(.+)$/i);
        if (!commitMatch) continue;

        for (const entry of entriesFromSubject(commitMatch[1].trim())) {
          // The same change often shows up in several deploys; mention it once.
          const titleKey = entry.title.toLowerCase();
          if (seenTitles.has(titleKey)) continue;
          seenTitles.add(titleKey);
          entries.push(entry);
        }
      }
    }

    // Deploys without user-visible changes (redeploys, version-only bumps)
    // would just clutter the page.
    if (entries.length === 0) continue;

    releases.push({
      version,
      date: formatDate(String(deployMatch[1]).trim()),
      tag: releases.length === 0 ? 'Current' : 'History',
      entries,
    });
  }

  return releases;
}

function main() {
  if (!fs.existsSync(releaseLogPath)) {
    console.warn(`Release log not found: ${releaseLogPath}`);
    return;
  }

  const markdown = fs.readFileSync(releaseLogPath, 'utf8');
  const releases = parseReleaseLog(markdown);
  const json = JSON.stringify(releases, null, 2) + '\n';

  fs.writeFileSync(outputPath, json, 'utf8');
  console.log(`Release notes mock generated: ${path.relative(process.cwd(), outputPath)}`);
}

main();
