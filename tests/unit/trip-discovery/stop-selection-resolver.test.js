const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { createStopSelectionResolver } = require("../../../src/modules/trip-discovery/stop-selection-resolver");

test("stop-selection-resolver validation", async (t) => {
  await t.test("rejects invalid ObjectId formats", async () => {
    const repository = { isValidObjectId: () => false };
    const resolver = createStopSelectionResolver({ repository });

    await assert.rejects(
      async () => resolver.resolveStopScope("invalid-id"),
      (err) => err.errorCode === "INVALID_STOP_SELECTION" && err.status === 400
    );
  });

  await t.test("rejects missing stops with 404 STOP_NOT_FOUND", async () => {
    const repository = {
      isValidObjectId: () => true,
      findStopById: async () => null,
    };
    const resolver = createStopSelectionResolver({ repository });

    await assert.rejects(
      async () => resolver.resolveStopScope(new mongoose.Types.ObjectId().toString()),
      (err) => err.errorCode === "STOP_NOT_FOUND" && err.status === 404
    );
  });

  await t.test("rejects inactive stops with STOP_NOT_SEARCHABLE", async () => {
    const repository = {
      isValidObjectId: () => true,
      findStopById: async () => ({ _id: "s1", status: "INACTIVE", verificationStatus: "VERIFIED", isSearchable: true }),
    };
    const resolver = createStopSelectionResolver({ repository });

    await assert.rejects(
      async () => resolver.resolveStopScope("s1"),
      (err) => err.errorCode === "STOP_NOT_SEARCHABLE" && err.status === 400
    );
  });

  await t.test("rejects unverified stops with STOP_NOT_SEARCHABLE", async () => {
    const repository = {
      isValidObjectId: () => true,
      findStopById: async () => ({ _id: "s1", status: "ACTIVE", verificationStatus: "PENDING", isSearchable: true }),
    };
    const resolver = createStopSelectionResolver({ repository });

    await assert.rejects(
      async () => resolver.resolveStopScope("s1"),
      (err) => err.errorCode === "STOP_NOT_SEARCHABLE" && err.status === 400
    );
  });

  await t.test("rejects non-searchable stops with STOP_NOT_SEARCHABLE", async () => {
    const repository = {
      isValidObjectId: () => true,
      findStopById: async () => ({ _id: "s1", status: "ACTIVE", verificationStatus: "VERIFIED", isSearchable: false }),
    };
    const resolver = createStopSelectionResolver({ repository });

    await assert.rejects(
      async () => resolver.resolveStopScope("s1"),
      (err) => err.errorCode === "STOP_NOT_SEARCHABLE" && err.status === 400
    );
  });
});
