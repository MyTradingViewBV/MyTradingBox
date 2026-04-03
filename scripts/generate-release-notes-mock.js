const fs = require('node:fs');
const path = require('node:path');

const releaseLogPath = path.resolve(__dirname, '..', 'updates', 'RELEASE_LOG.md');
const outputPath = path.resolve(__dirname, '..', 'src', 'assets', 'release-notes.mock.json');

function parseCommitLine(line) {
  const commitMatch = line.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+([a-f0-9]{7,})\s+(.+)$/i);
  if (commitMatch) {
    const [, date, hash, subject] = commitMatch;
    return {
      title: subject.trim(),
      summary: `${date} | ${hash.slice(0, 7)}`,
    };
  }

  const genericMatch = line.match(/^-\s+(.+)$/);
  if (genericMatch) {
    const text = genericMatch[1].trim();
    if (!text) return null;
    return {
      title: text,
      summary: 'Release log entry',
    };
  }

  return null;
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

    const entries = [];
    if (changesMatch) {
      const lines = changesMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('- '));

      for (const line of lines) {
        const parsed = parseCommitLine(line);
        if (parsed) entries.push(parsed);
      }
    }

    releases.push({
      version,
      date: String(deployMatch[1]).trim(),
      tag: releases.length === 0 ? 'Current' : 'History',
      entries,
    });
    seenVersions.add(versionKey);
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
