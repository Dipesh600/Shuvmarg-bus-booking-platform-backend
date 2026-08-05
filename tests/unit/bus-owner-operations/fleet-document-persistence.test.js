"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const createUploadService = require("../../../src/modules/fleet/document-lifecycle/fleet-document-upload.service");

test("fleet-document-persistence unit tests", async (t) => {
  const fleetId = "64f000000000000000000001";
  const userId = "64f000000000000000000002";
  const pdfBuffer = Buffer.from("%PDF-1.4 header");

  await t.test("guarded update mismatch (null) deletes uploaded file and throws 409 concurrentModification", async () => {
    let deletedKey = null;

    const repo = {
      findFleetForDocumentUpdate: async () => ({
        _id: fleetId,
        ownerId: userId,
        approvalStatus: "PENDING",
        __v: 5,
      }),
      atomicDocumentUpdate: async () => null, // version mismatch
    };

    const storage = {
      buildPrivateObjectKey: () => "fleet-documents/1/fitnessCert/u1.pdf",
      uploadPrivate: async () => "fleet-documents/1/fitnessCert/u1.pdf",
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
      (err) => err.statusCode === 409 && err.code === "FLEET_DOCUMENT_CONCURRENT_MODIFICATION"
    );

    assert.equal(deletedKey, "fleet-documents/1/fitnessCert/u1.pdf");
  });
});
