#!/usr/bin/env node

/**
 * Pre-deploy sanity check
 * Ensures the git working tree is clean before proceeding with deploy
 * Must run BEFORE set-version to catch uncommitted changes upfront
 */

const { execSync } = require('node:child_process');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function main() {
  try {
    const status = run('git status --porcelain');

    if (status) {
      console.error('❌ Git working tree is not clean. Commit or stash changes before deploying:\n');
      console.error(status);
      console.error(
        '\nNote: a previous deploy leaves version/release-note files modified (package.json, src/assets/version.json, updates/RELEASE_LOG.md, src/assets/release-notes.mock.json). Untracked files also count. Commit those first.'
      );
      process.exit(1);
    }

    console.log('✅ Git working tree is clean');
    console.log('Note: deploy bumps the version and updates the release notes; commit those files after deploying.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error checking git status:', err.message);
    process.exit(1);
  }
}

main();
