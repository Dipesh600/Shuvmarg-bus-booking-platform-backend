"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const createReadService = require("../../../src/modules/fleet/document-lifecycle/fleet-document-read.service");

test("fleet-document-read unit tests", async (t) => {
  const fleetId = "64f000000000000000000001";
  const ownerUserId = "64f000000000000000000002";
  const otherUserId = "64f000000000000000000003";

  await t.test("owner can read own fleet document URL", async () => {
    const repo = {
      findFleetForRead: async () => ({
        _id: fleetId,
        ownerId: ownerUserId,
        fleetDocuments: { insurance: { objectKey: "fleet-documents/1/insurance/file.pdf" } },
      }),
    };

    const service = createReadService({
      repository: repo,
      getPresignedUrl: async (key) => `https://s3.amazonaws.com/${key}?signed=true`,
      resolveActor: async () => ({ actorType: "BUS_OWNER", actorId: ownerUserId, userId: ownerUserId }),
    });

    const res = await service.getDocumentReadUrl({
      fleetId,
      slot: "insurance",
      actorContext: { userInfo: { id: ownerUserId, role: "busOwner" } },
    });

    assert.equal(res.success, true);
    assert.match(res.data.readUrl, /fleet-documents\/1\/insurance\/file\.pdf/);
    assert.equal(res.data.objectKey, undefined);
  });

  await t.test("owner cannot read another owner's fleet document URL", async () => {
    const repo = {
      findFleetForRead: async () => ({
        _id: fleetId,
        ownerId: ownerUserId,
        fleetDocuments: { insurance: { objectKey: "fleet-documents/1/insurance/file.pdf" } },
      }),
    };

    const service = createReadService({
      repository: repo,
      getPresignedUrl: async () => "url",
      resolveActor: async () => ({ actorType: "BUS_OWNER", actorId: otherUserId, userId: otherUserId }),
    });

    await assert.rejects(
      async () => service.getDocumentReadUrl({
        fleetId,
        slot: "insurance",
        actorContext: { userInfo: { id: otherUserId, role: "busOwner" } },
      }),
      (err) => err.statusCode === 403 && err.code === "FLEET_DOCUMENT_FORBIDDEN"
    );
  });

  await t.test("empty slot returns 404 not found", async () => {
    const repo = {
      findFleetForRead: async () => ({ _id: fleetId, ownerId: ownerUserId, fleetDocuments: {} }),
    };

    const service = createReadService({
      repository: repo,
      getPresignedUrl: async () => "url",
      resolveActor: async () => ({ actorType: "BUS_OWNER", actorId: ownerUserId, userId: ownerUserId }),
    });

    await assert.rejects(
      async () => service.getDocumentReadUrl({
        fleetId,
        slot: "fitnessCert",
        actorContext: { userInfo: { id: ownerUserId, role: "busOwner" } },
      }),
      (err) => err.statusCode === 404 && err.code === "FLEET_DOCUMENT_NOT_FOUND"
    );
  });
});
