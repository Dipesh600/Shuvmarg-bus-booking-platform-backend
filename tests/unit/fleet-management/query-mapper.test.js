"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetDocumentMapper,
} = require("../../../src/modules/fleet-management/fleet-document.mapper");
const {
  createFleetQueryService,
} = require("../../../src/modules/fleet-management/fleet-query.service");
const {
  createFleetQueryRepository,
} = require("../../../src/modules/fleet-management/fleet-query.repository");

test("fleet mapper presigns images and document slots", async () => {
  const seen = [];
  const mapper = createFleetDocumentMapper({
    getPresignedUrl: async (key) => { seen.push(key); return `signed:${key}`; },
  });
  const fleet = {
    fleetImages: ["front", "back"],
    fleetDocuments: {
      fitnessCert: { url: "fitness" }, insurance: { url: "insurance" },
      bluebook: { url: null }, routePermit: { url: "permit" },
    },
  };
  assert.equal(await mapper.withRawKeys(fleet), fleet);
  assert.equal(seen.length, 0);
  const result = await mapper.withPresignedUrls(fleet);
  assert.equal(result, fleet);
  assert.deepEqual(seen, ["front", "back", "fitness", "insurance", "permit"]);
  assert.deepEqual(result.fleetImages, ["signed:front", "signed:back"]);
  assert.equal(result.fleetDocuments.routePermit.url, "signed:permit");
});

test("query service distinguishes mapped and raw admin reads", async () => {
  const mapped = [];
  const repository = {
    findByOwner: async () => [{ id: 1 }, { id: 2 }],
    findDetails: async () => ({ id: 3 }),
    findRaw: async () => ({ id: 4 }),
    remove: async () => ({ id: 5 }),
  };
  const mapper = {
    withPresignedUrls: async (fleet) => { mapped.push(fleet.id); return { ...fleet, signed: true }; },
    withRawKeys: (fleet) => ({ ...fleet, raw: true }),
  };
  const service = createFleetQueryService({ repository, mapper });
  assert.deepEqual(await service.getFleetsByOwnerId("owner"), [
    { id: 1, signed: true }, { id: 2, signed: true },
  ]);
  assert.deepEqual(await service.getFleetDetails("3"), { id: 3, signed: true });
  assert.deepEqual(await service.getFleetDetailsRaw("4"), { id: 4, raw: true });
  assert.deepEqual(await service.removeFleet("5"), { id: 5 });
  assert.deepEqual(mapped, [1, 2, 3]);
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
    await assert.rejects(operation(), /Fleet not found or unauthorized\./);
  }
});

test("query repository preserves owner filter, population, and newest-first order", async () => {
  const calls = [];
  const query = {
    populate(value, select) { calls.push(["populate", value, select]); return this; },
    sort(value) { calls.push(["sort", value]); return this; },
    async lean() { calls.push(["lean"]); return [{ id: "fleet" }]; },
  };
  let filter;
  const repository = createFleetQueryRepository({
    Bus: { find(value) { filter = value; return query; } },
  });
  assert.deepEqual(await repository.findByOwner("owner", "brand"), [{ id: "fleet" }]);
  assert.deepEqual(filter, { ownerId: "owner", brandId: "brand" });
  assert.deepEqual(calls[0], ["populate", "ownerId", "name email phone"]);
  assert.deepEqual(calls.at(-2), ["sort", { createdAt: -1 }]);
  assert.deepEqual(calls.at(-1), ["lean"]);
  const corridor = calls.find(
    ([kind, value]) => kind === "populate" && value?.path === "corridorId"
  )[1];
  assert.equal(corridor.select, "code originId destinationId status");
  assert.deepEqual(corridor.populate.map((value) => value.path), [
    "originId", "destinationId",
  ]);
});
