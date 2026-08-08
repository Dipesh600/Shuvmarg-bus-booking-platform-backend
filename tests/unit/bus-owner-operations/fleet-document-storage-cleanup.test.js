"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const createUploadService = require("../../../src/modules/fleet/document-lifecycle/fleet-document-upload.service");

test("fleet-document-storage-cleanup unit tests", async (t) => {
  const fleetId = "64f000000000000000000001";
  const userId = "64f000000000000000000002";
  const pdfBuffer = Buffer.from("%PDF-1.4 header");

  await t.test("S3 upload failure cleans up uploaded keys and preserves original error", async () => {
    let deletedKey = null;
    const s3Err = new Error("S3 connection drop");

    const repo = {
      findFleetForDocumentUpdate: async () => ({ _id: fleetId, ownerId: userId, approvalStatus: "DRAFT", __v: 1 }),
    };

    const storage = {
      buildPrivateObjectKey: () => "k1",
      uploadPrivate: async () => { throw s3Err; },
      deleteNewObjectOrReport: async (keys) => { deletedKey = keys[0]; },
      deleteOldObjectBestEffort: async () => {},
    };

    const service = createUploadService({
      repository: repo,
      storage,
      resolveActor: async () => ({ actorType: "BUS_OWNER", actorId: userId, userId }),
    });

    const file = { name: "doc.pdf", mimetype: "application/pdf", data: pdfBuffer, size: 100 };

    await assert.rejects(
      async () => service.uploadDocument({
        fleetId,
        slot: "fitnessCert",
        body: {},
        files: { fitnessCert: file },
        actorContext: { userInfo: { id: userId, role: "busOwner" } },
      }),
      (err) => err === s3Err
    );
  });

  await t.test("successful DB update attempts old object cleanup and returns success response", async () => {
    let oldKeyDeleted = null;

    const repo = {
      findFleetForDocumentUpdate: async () => ({
        _id: fleetId,
        ownerId: userId,
        approvalStatus: "DRAFT",
        __v: 1,
        fleetDocuments: { fitnessCert: { objectKey: "old-key.pdf" } },
      }),
      atomicDocumentUpdate: async () => ({ _id: fleetId, approvalStatus: "PENDING", status: "INACTIVE" }),
    };

    const storage = {
      buildPrivateObjectKey: () => "new-key.pdf",
      uploadPrivate: async () => "new-key.pdf",
      deleteNewObjectOrReport: async () => {},
      deleteOldObjectBestEffort: async (keys) => { oldKeyDeleted = keys[0]; },
    };

    const service = createUploadService({
      repository: repo,
      storage,
      resolveActor: async () => ({ actorType: "BUS_OWNER", actorId: userId, userId }),
    });

    const file = { name: "doc.pdf", mimetype: "application/pdf", data: pdfBuffer, size: 100 };

    const res = await service.uploadDocument({
      fleetId,
      slot: "fitnessCert",
      body: { changeReason: "Updating document" },
      files: { fitnessCert: file },
      actorContext: { userInfo: { id: userId, role: "busOwner" } },
    });

    assert.equal(res.success, true);
    assert.equal(oldKeyDeleted, "old-key.pdf");
  });
});
