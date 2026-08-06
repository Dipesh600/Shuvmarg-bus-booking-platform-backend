"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapLegacyFleetUpdateRequest,
  mapLegacyFleetDeleteRequest,
} = require("../../../src/modules/bus-owner/fleet-management/legacy-fleet-write-request.adapter.js");

test("Legacy fleet write request adapters", async (t) => {
  await t.test("mapLegacyFleetUpdateRequest maps body fleetId to params.fleetId and preserves body", () => {
    const req = {
      params: {},
      body: { fleetId: "fleet_123", busName: "Super Express" },
    };
    let called = false;
    mapLegacyFleetUpdateRequest(req, {}, () => { called = true; });
    assert.equal(called, true);
    assert.equal(req.params.fleetId, "fleet_123");
    assert.equal(req.body.busName, "Super Express");
  });

  await t.test("mapLegacyFleetDeleteRequest maps body fleetId to params.fleetId and preserves body", () => {
    const req = {
      params: {},
      body: { fleetId: "fleet_456" },
    };
    let called = false;
    mapLegacyFleetDeleteRequest(req, {}, () => { called = true; });
    assert.equal(called, true);
    assert.equal(req.params.fleetId, "fleet_456");
  });

  await t.test("adapters preserve existing params.fleetId if present", () => {
    const req = {
      params: { fleetId: "params_789" },
      body: { fleetId: "body_000" },
    };
    mapLegacyFleetUpdateRequest(req, {}, () => {});
    assert.equal(req.params.fleetId, "params_789");
  });
});
