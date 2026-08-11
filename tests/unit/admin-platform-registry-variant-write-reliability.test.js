"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveCommittedStops,
} = require("../../src/modules/admin/platform-registry/variant-draft-workflow/commit-policy.service.js");
const {
  runVariantWrite,
} = require("../../src/modules/admin/platform-registry/variant-write-transaction.service.js");

test("a retry reuses a CREATE_NEW candidate resolved before a failed sequence write", async () => {
  const candidate = {
    _id: "candidate-1", reviewStatus: "CREATE_NEW", resolvedStopId: null,
    coordinates: { lat: 27.7, lng: 84.4 }, proposedStop: { name: "Mugling", isSearchable: true },
    saveCalls: 0,
    async save() { this.saveCalls += 1; },
  };
  const created = { _id: "stop-1", code: "MUG" };
  let createCalls = 0;
  let resolvedCalls = 0;
  const dependencies = {
    findStopByIdentity: async () => null,
    createStop: async () => { createCalls += 1; return created; },
    resolveEligibleStop: async (stopId) => {
      resolvedCalls += 1;
      assert.equal(String(stopId), "stop-1");
      return created;
    },
  };

  await resolveCommittedStops([candidate], "admin-1", dependencies);
  assert.equal(candidate.saveCalls, 1);
  assert.equal(createCalls, 1);

  // This represents the later RouteStop write failing on a standalone MongoDB.
  // The saved candidate resolution survives, so the next click cannot mint MUG again.
  await resolveCommittedStops([candidate], "admin-1", dependencies);
  assert.equal(createCalls, 1);
  assert.equal(resolvedCalls, 1);
});

test("commit reuses an exact canonical Stop identity instead of inserting a duplicate", async () => {
  const candidate = {
    reviewStatus: "CREATE_NEW", resolvedStopId: null,
    coordinates: { lat: 27.17, lng: 85.13 },
    proposedStop: { name: "Nijgadh", district: "Bara", municipality: "Nijgadh" },
    async save() {},
  };
  const existing = { _id: "existing-stop", code: "NJG" };
  let createCalls = 0;
  const result = await resolveCommittedStops([candidate], "admin-1", {
    findStopByIdentity: async () => existing,
    createStop: async () => { createCalls += 1; return null; },
  });
  assert.deepEqual(result, [existing]);
  assert.equal(createCalls, 0);
  assert.equal(candidate.reviewStatus, "USE_EXISTING");
  assert.equal(candidate.matchedStopId, existing._id);
  assert.equal(candidate.resolvedStopId, existing._id);
  assert.equal(candidate.proposedStop, undefined);
});

test("variant writes use a transaction when supported and a fallback on standalone MongoDB", async () => {
  const calls = [];
  const session = {
    withTransaction: async (work) => work(),
    endSession: async () => calls.push("end"),
  };
  const transactional = await runVariantWrite({
    mongooseImpl: { connection: { readyState: 1 }, startSession: async () => session },
    transactionWork: async () => { calls.push("transaction"); return "transaction-result"; },
    fallbackWork: async () => { calls.push("fallback"); return "fallback-result"; },
  });
  assert.equal(transactional, "transaction-result");
  assert.deepEqual(calls, ["transaction", "end"]);

  const standalone = await runVariantWrite({
    mongooseImpl: { connection: { readyState: 0 }, startSession: async () => assert.fail("must not start") },
    transactionWork: async () => assert.fail("must not transact"),
    fallbackWork: async () => "fallback-result",
  });
  assert.equal(standalone, "fallback-result");
});

test("an unsupported transaction retries through the non-transactional preserving path", async () => {
  let fallbackCalls = 0;
  const result = await runVariantWrite({
    mongooseImpl: {
      connection: { readyState: 1 },
      startSession: async () => ({
        withTransaction: async () => { throw new Error("Transaction numbers are only allowed on a replica set member"); },
        endSession: async () => {},
      }),
    },
    transactionWork: async () => assert.fail("must not run after transaction setup failure"),
    fallbackWork: async () => { fallbackCalls += 1; return "preserved"; },
  });
  assert.equal(result, "preserved");
  assert.equal(fallbackCalls, 1);
});
