const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sourceRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(sourceRoot, 'build', 'aiyla-arm64-installer.nsi');

test('the ARM64 installer explicitly extracts the ARM64 ZIP payload and creates distinct shortcuts', () => {
  const script = fs.readFileSync(scriptPath, 'utf8');

  assert.match(script, /File \/oname=\$PLUGINSDIR\\app-arm64\.zip "\$\{APP_ARM64\}"/);
  assert.match(script, /nsisunz::Unzip "\$PLUGINSDIR\\app-arm64\.zip" "\$INSTDIR"/);
  assert.match(script, /IfFileExists "\$INSTDIR\\Aiyla Command Centre\.exe"/);
  assert.match(script, /\$DESKTOP\\Aiyla Command Centre\.lnk/);
  assert.match(script, /\$SMPROGRAMS\\Aiyla Command Centre\.lnk/);
  assert.doesNotMatch(script, /IsNativeARM64|Nsis7z::Extract/);
});
