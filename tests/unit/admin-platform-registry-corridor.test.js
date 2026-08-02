"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildCorridorPairKey,
} = require("../../src/domain/corridor/corridor-identity.js");
const {
  buildCorridorMigrationPlan,
} = require(
  "../../src/modules/admin/platform-registry/corridor-migration/corridor-migration-plan.js"
);
const {
  mapCorridor,
} = require("../../src/modules/admin/platform-registry/corridor/corridor.mapper.js");

const id = () => new mongoose.Types.ObjectId();
const stop = (_id, overrides = {}) => ({
  _id, code: "STP", name: "Stop", status: "ACTIVE",
  verificationStatus: "VERIFIED", isSearchable: true, ...overrides,
});

test("corridor pair identity is direction-neutral", () => {
  const left = id(); const right = id();
  assert.equal(
    buildCorridorPairKey(left, right), buildCorridorPairKey(right, left)
  );
});

test("corridor pair identity rejects the same endpoint", () => {
  const endpoint = id();
  assert.throws(
    () => buildCorridorPairKey(endpoint, endpoint),
    (error) => error.code === "SAME_CORRIDOR_ENDPOINT"
  );
});

test("migration reports reverse corridor duplicates without merging", () => {
  const originId = id(); const destinationId = id();
  const plan = buildCorridorMigrationPlan([
    { _id: id(), code: "AAA-BBB", originId, destinationId },
    { _id: id(), code: "BBB-AAA", originId: destinationId,
      destinationId: originId },
  ], [stop(originId), stop(destinationId)]);
  assert.equal(plan.safeToApply, false);
  assert.equal(plan.identityConflicts.length, 1);
  assert.equal(plan.identityConflicts[0].matches.length, 2);
});

test("migration rejects an unusable corridor endpoint", () => {
  const originId = id(); const destinationId = id();
  const plan = buildCorridorMigrationPlan([
    { _id: id(), code: "AAA-BBB", originId, destinationId },
  ], [stop(originId), stop(destinationId, { isSearchable: false })]);
  assert.equal(plan.safeToApply, false);
  assert.match(plan.invalidRecords[0].problems[0], /not active, verified/);
});

test("corridor mapper exposes province and compatibility endpoint fields", () => {
  const originId = id(); const destinationId = id();
  const result = mapCorridor({
    _id: id(), code: "KTM-MLW", status: "PENDING",
    originId: stop(originId, { name: "Kathmandu", province: "Bagmati" }),
    destinationId: stop(destinationId, { name: "Malangwa", province: "Madhesh" }),
  });
  assert.equal(result.origin.province, "Bagmati");
  assert.equal(result.destination.province, "Madhesh");
  assert.deepEqual(result.originId, result.origin);
});

test("route requests and discovery cannot create corridors directly", () => {
  const root = path.resolve(__dirname, "../..");
  const routeRequest = fs.readFileSync(path.join(
    root, "controllers/adminController/routeRequestController.js"
  ), "utf8");
  const discovery = fs.readFileSync(path.join(
    root,
    "src/modules/admin/route-discovery/route-publication-records.service.js"
  ), "utf8");
  assert.doesNotMatch(routeRequest, /RouteCorridor\.create|Stop\.create/);
  assert.doesNotMatch(discovery, /RouteCorridor\.create/);
  assert.match(routeRequest, /corridorRegistry\.findOrCreateCorridor/);
  assert.match(discovery, /findOrCreateRegistryCorridor/);
});
