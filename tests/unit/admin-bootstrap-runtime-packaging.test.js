"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

test("admin bootstrap preflight is included in the production image", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const command = packageJson.scripts["preflight:admin-bootstrap"];

  assert.equal(command, "node scripts/preflightAdminBootstrap.js");
  assert.equal(fs.existsSync(path.join(root, "scripts/preflightAdminBootstrap.js")), true);

  const dockerignore = fs.readFileSync(path.join(root, ".dockerignore"), "utf8");
  assert.doesNotMatch(dockerignore, /^scripts(?:\/|$)/m);
});
