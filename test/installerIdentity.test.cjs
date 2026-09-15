const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(sourceRoot, "package.json"), "utf8"));

test("the installed Command Centre has an identity distinct from archived Aiyla test builds", () => {
  assert.equal(packageJson.build.appId, "com.sagalution.aiyla.commandcentre");
  assert.equal(packageJson.build.productName, "Aiyla Command Centre");
  assert.equal(packageJson.build.win.executableName, "Aiyla Command Centre");
  assert.equal(packageJson.build.nsis.shortcutName, "Aiyla Command Centre");
  assert.match(packageJson.build.win.artifactName, /Aiyla Command Centre Setup/);
});
