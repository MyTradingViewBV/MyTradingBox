// Publish the build byte for byte. angular-cli-ghpages commits the build with git;
// with core.autocrlf=true git turns CRLF into LF in text files (index.html, i18n,
// manifest.json, custom-sw.js), so GitHub Pages serves bytes that no longer match
// the hashes in ngsw.json and the service worker fails with "Hash mismatch".
const fs = require('node:fs');
const path = require('node:path');

const dir = path.resolve(__dirname, '..', 'dist', 'MyTradingBox', 'browser');
if (!fs.existsSync(dir)) {
  console.error(`❌ Build folder not found: ${dir}`);
  process.exit(1);
}
fs.writeFileSync(path.join(dir, '.gitattributes'), '* -text\n');
console.log('✅ .gitattributes written: gh-pages files are published without line-ending conversion');
