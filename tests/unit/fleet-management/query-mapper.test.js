"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetQueryService } = require("../../../src/modules/fleet-management/fleet-query.service");

test("query service formats presigned URLs and raw keys", async () => {
  const calls = [];
  const mapper = {
    withPresignedUrls: (doc) => { calls.push(["urls", doc]); return { ...doc, presigned: true }; },
    withRawKeys: (doc) => { calls.push(["raw", doc]); return { ...doc, raw: true }; },
  };
  const repository = {
    findByOwner: async () => [{ id: "f1" }],
    findDetails: async () => ({ id: "f1" }),
    findRaw: async () => ({ id: "f1" }),
    remove: async () => ({ id: "f1" }),
  };
  const service = createFleetQueryService({ repository, mapper });

  const list = await service.getFleetsByOwnerId("owner", "brand");
  assert.deepEqual(list, [{ id: "f1", presigned: true }]);

  const details = await service.getFleetDetails("f1", "owner");
  assert.deepEqual(details, { id: "f1", presigned: true });

  const raw = await service.getFleetDetailsRaw("f1");
  assert.deepEqual(raw, { id: "f1", raw: true });

  const deleted = await service.removeFleet("f1", "owner");
  assert.deepEqual(deleted, { id: "f1" });
});

test("query service preserves exact missing-fleet contract", async () => {
  const repository = {
    findDetails: async () => null, findRaw: async () => null,
    remove: async () => null,
  };
  const service = createFleetQueryService({ repository, mapper: {} });
  for (const operation of [
    () => service.getFleetDetails("x"),
    () => service.getFleetDetailsRaw("x"),
    () => service.removeFleet("x"),
  ]) {
    await assert.rejects(operation(), (err) => err.code === "FLEET_NOT_FOUND");
  }
});

test("query repository preserves owner filter, population, and newest-first order", async () => {
  const calls = [];
  const query = {
    sort() { calls.push(["sort"]); return this; },
    populate() { calls.push(["populate"]); return this; },
    lean: async () => [{ _id: "f1" }],
  };
  const Bus = {
    find: (filter) => { calls.push(["find", filter]); return query; },
  };
  const { createFleetQueryRepository } = require("../../../src/modules/fleet-management/fleet-query.repository");
  const repo = createFleetQueryRepository({ Bus });
  const result = await repo.findByOwner("owner_1", "brand_1");
  assert.deepEqual(result, [{ _id: "f1" }]);
  assert.equal(calls[0][0], "find");
  assert.deepEqual(calls[0][1], { ownerId: "owner_1", brandId: "brand_1" });
  assert.equal(calls[calls.length - 1][0], "sort");
});
