"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");

const retiredArtifacts = [
  "dummy.jpg",
  "dummy.png",
  "get-admin.js",
  "scripts/backfillBrandId.js",
  "scripts/backfill_trips_manual.js",
  "scripts/checkBookings.js",
  "scripts/findDuplicatePhones.js",
  "scripts/generateReferralCodesForExistingUsers.js",
  "scripts/listUsers.js",
  "scripts/migrate-corridor-registry.js",
  "scripts/migrate-stop-registry.js",
  "scripts/migrate-trip-patterns.js",
  "scripts/migrateRoles.js",
  "scripts/migrateToOperatorBrand.js",
  "scripts/migrateTripdateToDate.js",
  "scripts/seedSuperAdmin.js",
  "scripts/seedUser.js",
];

test("retired local and one-off operational artifacts stay out of the repository", () => {
  const present = retiredArtifacts.filter((relativePath) =>
    fs.existsSync(path.join(root, relativePath)),
  );

  assert.deepEqual(present, []);
});
