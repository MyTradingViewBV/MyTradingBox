#!/usr/bin/env node

/**
 * Version updater script
 * Automatically increments patch version in package.json and src/assets/version.json
 * Run this before building to ensure PWA cache busting on Android devices
 */

const fs = require('fs');
const path = require('path');

function incrementVersion(version) {
  const parts = version.split('.');
  const patch = parseInt(parts[2] || 0, 10);
  parts[2] = (patch + 1).toString();
  return parts.join('.');
}

function updateVersionFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`File not found: ${filePath}`);
    return null;
  }

  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const oldVersion = content.version;
  const newVersion = incrementVersion(oldVersion);
  
  content.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
  
  return { oldVersion, newVersion };
}

try {
  console.log('🔄 Updating version numbers...\n');

  // Update package.json
  const pkgResult = updateVersionFile(path.join(__dirname, 'package.json'));
  if (pkgResult) {
    console.log(`✅ package.json: ${pkgResult.oldVersion} → ${pkgResult.newVersion}`);
  }

  // Update version.json
  const versionResult = updateVersionFile(path.join(__dirname, 'src/assets/version.json'));
  if (versionResult) {
    console.log(`✅ src/assets/version.json: ${versionResult.oldVersion} → ${versionResult.newVersion}`);
  }

  if (pkgResult && versionResult && pkgResult.newVersion === versionResult.newVersion) {
    console.log(`\n✨ Version bumped to ${pkgResult.newVersion}`);
    console.log('💡 This ensures PWA cache busting on Android devices');
    process.exit(0);
  }
} catch (err) {
  console.error('❌ Error updating version:', err.message);
  process.exit(1);
}
