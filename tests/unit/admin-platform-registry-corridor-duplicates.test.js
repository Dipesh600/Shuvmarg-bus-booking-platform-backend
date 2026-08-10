"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDuplicateCorridorPlan,
} = require(
  "../../src/modules/admin/platform-registry/corridor-migration/" +
  "corridor-duplicate-plan.js"
);

const KTM = "64b000000000000000000001";
const MLW = "64b000000000000000000002";
const FIRST = "64c000000000000000000001";
const REVERSE = "64c000000000000000000002";

test("reverse corridors merge into one neutral pair and flip variant direction", () => {
  const plan = buildDuplicateCorridorPlan([
    {
      _id: FIRST, code: "KTM-MLW", originId: KTM, destinationId: MLW,
      status: "PENDING", createdAt: "2025-01-01", variantSequence: 1,
    },
    {
      _id: REVERSE, code: "MLW-KTM", originId: MLW, destinationId: KTM,
      status: "ACTIVE", createdAt: "2025-02-01", variantSequence: 2,
    },
  ], [
    {
      _id: "64d000000000000000000001", corridorId: REVERSE,
      code: "MLW-KTM-V02-F", direction: "FORWARD", status: "ACTIVE",
    },
    {
      _id: "64d000000000000000000002", corridorId: REVERSE,
      code: "MLW-KTM-V01-R", direction: "RETURN", status: "INACTIVE",
    },
  ]);

  assert.equal(plan.safeToApply, true);
  assert.equal(plan.merges.length, 1);
  assert.equal(plan.merges[0].survivorId, FIRST);
  assert.deepEqual(plan.merges[0].duplicateIds, [REVERSE]);
  assert.deepEqual(plan.merges[0].variantMoves.map((move) => move.direction), [
    "RETURN", "FORWARD",
  ]);
  assert.equal(plan.merges[0].status, "ACTIVE");
  assert.equal(plan.merges[0].variantSequence, 2);
});

test("an unsupported legacy direction blocks reconciliation", () => {
  const plan = buildDuplicateCorridorPlan([
    { _id: FIRST, originId: KTM, destinationId: MLW, createdAt: "2025-01-01" },
    { _id: REVERSE, originId: MLW, destinationId: KTM, createdAt: "2025-02-01" },
  ], [{
    _id: "64d000000000000000000003", corridorId: REVERSE,
    direction: "SIDEWAYS", status: "DRAFT",
  }]);
  assert.equal(plan.safeToApply, false);
  assert.equal(plan.invalidRecords.length, 1);
});
