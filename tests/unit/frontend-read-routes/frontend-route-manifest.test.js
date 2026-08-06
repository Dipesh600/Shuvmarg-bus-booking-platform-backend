"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { FRONTEND_READ_ROUTES } = require("../../../src/contracts/frontend-read-routes.js");

test("Frontend read routes manifest contract & validity", async (t) => {
  await t.test("1. Manifest is frozen", () => {
    assert.equal(Object.isFrozen(FRONTEND_READ_ROUTES), true);
  });

  await t.test("2. All canonical routes use GET method", () => {
    for (const [key, entry] of Object.entries(FRONTEND_READ_ROUTES)) {
      assert.equal(entry.key, key);
      assert.equal(entry.method, "GET", `Route ${key} must use GET method`);
      assert.equal(entry.requestBody, false, `Route ${key} must not require request body`);
    }
  });

  await t.test("3. Path identifiers are domain-specific", () => {
    assert.deepEqual(FRONTEND_READ_ROUTES.ADMIN_BUS_OWNER_DETAIL.pathParams, ["ownerId"]);
    assert.deepEqual(FRONTEND_READ_ROUTES.ADMIN_KYC_DETAIL.pathParams, ["kycId"]);
    assert.deepEqual(FRONTEND_READ_ROUTES.ADMIN_FLEET_DETAIL.pathParams, ["fleetId"]);
    assert.deepEqual(FRONTEND_READ_ROUTES.ADMIN_FLEET_SETUP_STATUS.pathParams, ["fleetId"]);
    assert.deepEqual(FRONTEND_READ_ROUTES.BUS_OWNER_FLEET_DETAIL.pathParams, ["fleetId"]);
  });

  await t.test("4. Unique canonical method + path pairs across manifest", () => {
    const paths = new Set();
    for (const entry of Object.values(FRONTEND_READ_ROUTES)) {
      const id = `${entry.method} ${entry.path}`;
      assert.equal(paths.has(id), false, `Duplicate route path in manifest: ${id}`);
      paths.add(id);
    }
  });

  await t.test("5. Legacy-only routes explicitly marked", () => {
    const adminFleetDetailAliases = FRONTEND_READ_ROUTES.ADMIN_FLEET_DETAIL.compatibilityAliases;
    const legacyDetails = adminFleetDetailAliases.find((a) => a.path === "/api/admin/fleet/details/:id");
    assert.ok(legacyDetails);
    assert.equal(legacyDetails.isLegacyNotRecommended, true);
  });
});
