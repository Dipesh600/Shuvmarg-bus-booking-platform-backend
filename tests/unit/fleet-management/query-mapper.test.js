"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
const {
  createFleetDocumentMapper,
} = require("../../../src/modules/fleet-management/fleet-document.mapper");
const {
  createFleetQueryService,
} = require("../../../src/modules/fleet-management/fleet-query.service");
const {
  createFleetQueryRepository,
} = require("../../../src/modules/fleet-management/fleet-query.repository");

test("fleet mapper returns safe document descriptors without raw keys or presigned URLs", async () => {
  const mapper = createFleetDocumentMapper({});
  const fleet = {
    fleetImages: ["front", "back"],
    fleetDocuments: {
      fitnessCert: { url: "fitness", objectKey: "key1", storageKey: "sk1", uploadedAt: new Date("2026-08-05") },
      insurance: { url: "insurance", objectKey: "key2" },
      bluebook: { url: null },
      routePermit: { url: "permit" },
    },
  };
  const rawResult = mapper.withRawKeys(fleet);
  assert.equal(rawResult.fleetDocuments.fitnessCert.present, true);
  assert.equal(rawResult.fleetDocuments.fitnessCert.url, undefined);
  assert.equal(rawResult.fleetDocuments.fitnessCert.objectKey, undefined);
  assert.equal(rawResult.fleetDocuments.fitnessCert.storageKey, undefined);

  const result = await mapper.withPresignedUrls(fleet);
  assert.equal(result.fleetDocuments.fitnessCert.present, true);
  assert.equal(result.fleetDocuments.fitnessCert.url, undefined);
  assert.equal(result.fleetDocuments.fitnessCert.objectKey, undefined);
  assert.equal(result.fleetDocuments.fitnessCert.storageKey, undefined);
  assert.equal(result.fleetImages.count, 2);
});

test("query service distinguishes mapped and raw admin reads", async () => {
  const mapped = [];
  const repository = {
    findByOwner: async () => [{ id: 1 }, { id: 2 }],
    findDetails: async () => ({ id: 3 }),
    findRaw: async () => ({ id: 4 }),
    remove: async () => ({ id: 5, approvalStatus: "DRAFT" }),
    findDocument: async () => ({ id: 5, approvalStatus: "DRAFT" }),
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
  assert.deepEqual(await service.removeFleet("5"), { id: 5, approvalStatus: "DRAFT" });
  assert.deepEqual(mapped, [1, 2, 3]);
});

test("query service preserves exact missing-fleet contract", async () => {
  const repository = {
    findDetails: async () => null,
    findRaw: async () => null,
    findDocument: async () => null,
    remove: async () => null,
  };
  const service = createFleetQueryService({ repository, mapper: {} });
  for (const operation of [
    () => service.getFleetDetails("x"),
    () => service.getFleetDetailsRaw("x"),
    () => service.removeFleet("x"),
  ]) {
    await assert.rejects(
      operation(),
      (error) => error instanceof ApiError && error.code === "FLEET_NOT_FOUND"
    );
  }
});

test("query repository preserves owner filter, population, and newest-first order", async () => {
  const calls = [];
  const query = {
    populate(value, select) {
      if (select !== undefined) calls.push(["populate", value, select]);
      else calls.push(["populate", value]);
      return this;
    },
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
  assert.deepEqual(calls[1], ["populate", "amenitiesId"]);
  assert.deepEqual(calls[2], ["populate", "boardingPointId"]);

  const corridorCall = calls[3][1];
  assert.equal(corridorCall.path, "corridorId");
  assert.equal(corridorCall.select, "code originId destinationId status");
  assert.deepEqual(corridorCall.populate.map((v) => v.path), ["originId", "destinationId"]);

  assert.deepEqual(calls[4], ["populate", "routeRequestId"]);
  assert.deepEqual(calls[5], ["sort", { createdAt: -1 }]);
  assert.deepEqual(calls[6], ["lean"]);
});
