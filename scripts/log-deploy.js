const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const releaseFile = path.resolve(__dirname, '..', 'updates', 'RELEASE_LOG.md');
const legacyReleaseFile = path.resolve(__dirname, '..', 'notes', 'release');
const markerPrefix = 'LAST_DEPLOY_COMMIT=';
const header = '# Release Log\n\nThis file is updated automatically after successful deploys.\n';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureReleaseFile() {
  const dir = path.dirname(releaseFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(releaseFile)) {
    let initial = header;

    if (fs.existsSync(legacyReleaseFile)) {
      const legacy = fs
        .readFileSync(legacyReleaseFile, 'utf8')
        .replace(/^LAST_DEPLOY_COMMIT=[a-f0-9]+\s*$/gim, '')
        .trim();
      if (legacy) {
        initial += `\n## Migrated Legacy Notes\n\n${legacy}\n`;
      }
    }

    fs.writeFileSync(releaseFile, initial, 'utf8');
  }
}

function readLastLoggedCommit(content) {
  const markerRegex = new RegExp(`^${escapeRegex(markerPrefix)}([a-f0-9]+)\\r?$`, 'gim');
  const matches = [...content.matchAll(markerRegex)];
  if (matches.length === 0) {
    return null;
  }
  return matches[matches.length - 1][1];
}

function upsertMarker(content, headCommit) {
  const markerLine = `${markerPrefix}${headCommit}`;
  const markerRegex = new RegExp(`^${escapeRegex(markerPrefix)}[a-f0-9]+\\r?$`, 'gim');
  const withoutMarkers = content.replace(markerRegex, '').replace(/\n{3,}/g, '\n\n').trimEnd();
  const normalized = withoutMarkers.length === 0 ? '' : `${withoutMarkers}\n`;
  return `${normalized}${markerLine}\n`;
}

function getCommitsSince(lastCommit) {
  const baseCmd = "git log --pretty=format:%H%x09%ad%x09%s --date=short";

  if (lastCommit) {
    try {
      run(`git rev-parse --verify ${lastCommit}`);
      const output = run(`${baseCmd} ${lastCommit}..HEAD`);
      if (output) {
        return output.split('\n').map((line) => {
          const [hash, date, subject] = line.split('\t');
          return { hash, date, subject };
        });
      }
      return [];
    } catch {
      // If previous marker points to an unknown commit, fallback to latest commits.
    }
  }

  const fallback = run(`${baseCmd} -n 10`);
  if (!fallback) {
    return [];
  }

  return fallback.split('\n').map((line) => {
    const [hash, date, subject] = line.split('\t');
    return { hash, date, subject };
  });
}

function formatEntry(headCommit, version, commits) {
  const now = new Date();
  const localTimestamp = now.toLocaleString('sv-SE', { hour12: false }).replace(' ', 'T');

  const lines = [];
  lines.push('');
  lines.push('---');
  lines.push(`Deploy: ${localTimestamp}`);
  lines.push(`Version: ${version}`);
  lines.push(`Head: ${headCommit.slice(0, 7)}`);
  lines.push('Changes:');

  if (commits.length === 0) {
    lines.push('- No new commits found.');
  } else {
    for (const commit of commits) {
      lines.push(`- ${commit.date} ${commit.hash.slice(0, 7)} ${commit.subject}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  ensureReleaseFile();

  const headCommit = run('git rev-parse HEAD');
  const version = run('node -p "require(\'./package.json\').version"');

  const current = fs.readFileSync(releaseFile, 'utf8');
  const lastLoggedCommit = readLastLoggedCommit(current);
  const commits = getCommitsSince(lastLoggedCommit);

  let next = current;
  if (!next.endsWith('\n') && next.length > 0) {
    next += '\n';
  }
  next += formatEntry(headCommit, version, commits);
  next = upsertMarker(next, headCommit);

  fs.writeFileSync(releaseFile, next, 'utf8');
  console.log(`Release log updated: ${path.relative(process.cwd(), releaseFile)}`);
}

main();
