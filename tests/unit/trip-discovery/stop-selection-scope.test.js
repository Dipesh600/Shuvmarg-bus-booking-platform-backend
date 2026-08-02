const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { createStopSelectionResolver } = require("../../../src/modules/trip-discovery/stop-selection-resolver");

test("stop-selection-resolver scope expansion & selection guard", async (t) => {
  await t.test("expands parent stop to include active child stops", async () => {
    const parentId = new mongoose.Types.ObjectId();
    const childId1 = new mongoose.Types.ObjectId();
    const childId2 = new mongoose.Types.ObjectId();

    const repository = {
      isValidObjectId: () => true,
      findStopById: async () => ({
        _id: parentId,
        name: "Kathmandu",
        code: "KTM",
        parentStopId: null,
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
        isSearchable: true,
      }),
      findChildStops: async () => [
        { _id: childId1, name: "Kalanki", code: "KLK" },
        { _id: childId2, name: "New Bus Park", code: "NBP" },
      ],
    };

    const resolver = createStopSelectionResolver({ repository });
    const scope = await resolver.resolveStopScope(parentId.toString());

    assert.equal(scope.canonicalName, "Kathmandu");
    assert.deepEqual(scope.matchingStopIds, [parentId, childId1, childId2]);
  });

  await t.test("specific child stop does not expand to siblings or parent", async () => {
    const childId = new mongoose.Types.ObjectId();
    const parentId = new mongoose.Types.ObjectId();

    const repository = {
      isValidObjectId: () => true,
      findStopById: async () => ({
        _id: childId,
        name: "Kalanki",
        code: "KLK",
        parentStopId: parentId,
        status: "ACTIVE",
        verificationStatus: "VERIFIED",
        isSearchable: true,
      }),
      findChildStops: async () => [],
    };

    const resolver = createStopSelectionResolver({ repository });
    const scope = await resolver.resolveStopScope(childId.toString());

    assert.equal(scope.canonicalName, "Kalanki");
    assert.deepEqual(scope.matchingStopIds, [childId]);
  });

  await t.test("rejects same-stop selection (fromStopId === toStopId)", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const repository = { isValidObjectId: () => true };
    const resolver = createStopSelectionResolver({ repository });

    await assert.rejects(
      async () => resolver.resolveStopSelection({ fromStopId: id, toStopId: id }),
      (err) => err.errorCode === "SAME_STOP_SELECTION" && err.status === 400
    );
  });

  await t.test("rejects one-ID-only request with INVALID_STOP_SELECTION", async () => {
    const id = new mongoose.Types.ObjectId().toString();
    const repository = { isValidObjectId: () => true };
    const resolver = createStopSelectionResolver({ repository });

    await assert.rejects(
      async () => resolver.resolveStopSelection({ fromStopId: id }),
      (err) => err.errorCode === "INVALID_STOP_SELECTION" && err.status === 400
    );
  });
});
