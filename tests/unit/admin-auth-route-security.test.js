"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (relative) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

test("admin authentication routes preserve the bootstrap and root-only boundary", () => {
  const routes = read("routes/adminRoutes/adminRoutes.js");
  const index = read("routes/indexRoute.js");
  assert.match(routes, /\/auth\/bootstrap\/mfa\/begin.*adminEnrollmentLimiter/);
  assert.match(routes, /\/administrators".*, adminMiddleware, rootAdminMiddleware/);
  assert.match(routes, /\/administrators\/:adminId\/status".*, adminMiddleware, rootAdminMiddleware/);
  assert.doesNotMatch(index, /seedRoute|\/seed\/admin/);
  assert.equal(fs.existsSync(path.join(process.cwd(), "routes/seed/seedRoute.js")), false);
});
