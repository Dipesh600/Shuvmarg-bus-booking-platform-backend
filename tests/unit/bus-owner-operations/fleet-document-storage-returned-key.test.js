"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetDocumentStorageService } = require("../../../src/modules/fleet/document-lifecycle/fleet-document-storage.service");
const createUploadService = require("../../../src/modules/fleet/document-lifecycle/fleet-document-upload.service");

test("fleet-document-storage-returned-key unit tests", async (t) => {
  const fleetId = "64f000000000000000000001";
  const userId = "64f000000000000000000002";
  const pdfBuffer = Buffer.from("%PDF-1.4 header");

  await t.test("uploadPrivate returns stored object key from string or object", async () => {
    const s1 = createFleetDocumentStorageService({ uploadFileToS3: async () => "key-123.pdf" });
    const k1 = await s1.uploadPrivate({ file: {}, objectKey: "key-123.pdf" });
    assert.equal(k1, "key-123.pdf");

    const s2 = createFleetDocumentStorageService({ uploadFileToS3: async () => ({ objectKey: "key-456.pdf" }) });
    const k2 = await s2.uploadPrivate({ file: {}, objectKey: "key-456.pdf" });
    assert.equal(k2, "key-456.pdf");
  });

  await t.test("missing returned key fails safely", async () => {
    const s = createFleetDocumentStorageService({ uploadFileToS3: async () => null });
    await assert.rejects(
      async () => s.uploadPrivate({ file: {}, objectKey: "k.pdf" }),
      (err) => err.message.includes("Storage upload did not return an object key")
    );
  });

  await t.test("public URL return is rejected and not treated as objectKey", async () => {
    const s = createFleetDocumentStorageService({ uploadFileToS3: async () => "https://s3.amazonaws.com/bucket/file.pdf" });
    await assert.rejects(
      async () => s.uploadPrivate({ file: {}, objectKey: "k.pdf" }),
      (err) => err.message.includes("Storage returned a public URL")
    );
  });

  await t.test("returned key mismatch is rejected when exact-key contract is required", async () => {
    const s = createFleetDocumentStorageService({ uploadFileToS3: async () => "different-key.pdf" });
    await assert.rejects(
      async () => s.uploadPrivate({ file: {}, objectKey: "requested-key.pdf" }),
      (err) => err.message.includes("Storage returned an unexpected object key")
    );
  });

  await t.test("uploadPrivate returned key is persisted to DB and used for compensation", async () => {
    let persistedKey = null;
    let deletedKey = null;

    const repo = {
      findFleetForDocumentUpdate: async () => ({ _id: fleetId, ownerId: userId, approvalStatus: "PENDING", __v: 1 }),
      atomicDocumentUpdate: async ({ update }) => {
        persistedKey = update.$set["fleetDocuments.fitnessCert.objectKey"];
        return null; // Force concurrency compensation
      },
    };

    const storage = {
      buildPrivateObjectKey: () => "req-key.pdf",
      uploadPrivate: async () => "canonical-key.pdf",
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
      (err) => err.code === "FLEET_DOCUMENT_CONCURRENT_MODIFICATION"
    );

    assert.equal(persistedKey, "canonical-key.pdf");
    assert.equal(deletedKey, "canonical-key.pdf");
  });
});
