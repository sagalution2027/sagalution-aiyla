const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = path.resolve(__dirname, "..");

test("the controlled GitHub workflow builds the tested Windows ARM64 NSIS installer before an optional release", () => {
  const workflow = fs.readFileSync(path.join(sourceRoot, ".github", "workflows", "release-windows-arm64.yml"), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s*push:/);
  assert.match(workflow, /runs-on: windows-11-arm/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /electron-builder --win nsis --arm64/);
  assert.match(workflow, /Aiyla Command Centre Setup \*\.exe/);
  assert.match(workflow, /Validate fresh installer and Command Centre shortcut/);
  assert.match(workflow, /Aiyla Command Centre\.exe/);
  assert.match(workflow, /Aiyla Command Centre\.lnk/);
  assert.match(workflow, /Start-Process -FilePath \$installer\.FullName .* -Wait -PassThru/);
  assert.match(workflow, /\$installProcess\.ExitCode/);
  assert.match(workflow, /Located Aiyla Command Centre executables/);
  assert.match(workflow, /Candidate Aiyla directories/);
  assert.match(workflow, /Shortcut target is wrong/);
  assert.match(workflow, /ARCHIVE\|Aiyla-0\\\.1\\\.0/);
  assert.match(workflow, /if: \$\{\{ inputs\.publish_release == true \}\}/);
  assert.match(workflow, /SHA256SUMS\.txt/);
  assert.match(workflow, /\$releaseAssetName = \$installer\.Name -replace ' ', '\.'/);
  assert.match(workflow, /gh release create/);
});

test("the public-release guard blocks API keys, local credentials, and signing private keys from source control", () => {
  const ignored = fs.readFileSync(path.join(sourceRoot, ".gitignore"), "utf8");
  for (const entry of [".env", "*.pfx", "*.p12", "*.pem", "*.key", "AIYLA_OPENAI_API_KEY"]) {
    assert.match(ignored, new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
