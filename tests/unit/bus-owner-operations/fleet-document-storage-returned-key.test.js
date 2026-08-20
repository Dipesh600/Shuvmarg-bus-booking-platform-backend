"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetDocumentStorageService } = require("../../../src/modules/fleet/document-lifecycle/fleet-document-storage.service");
const createUploadService = require("../../../src/modules/fleet/document-lifecycle/fleet-document-upload.service");

test("fleet-document-storage-returned-key unit tests", async (t) => {
  const fleetId = "64f000000000000000000001";
  const userId = "64f000000000000000000002";
  const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

  await t.test("mismatch deletes actual returned key, does NOT delete requested key, preserves mismatch error", async () => {
    let deletedKeys = [];
    const storage = createFleetDocumentStorageService({
      uploadFileToS3: async () => "actual-unexpected-key.jpg",
      deleteObjectFromS3: async (key) => { deletedKeys.push(key); },
    });

    await assert.rejects(
      async () => storage.uploadPrivate({ file: {}, objectKey: "requested-key.jpg" }),
      (err) => err.message.includes("Storage returned an unexpected object key")
    );

    assert.deepEqual(deletedKeys, ["actual-unexpected-key.jpg"]);
    assert.ok(!deletedKeys.includes("requested-key.jpg"));
  });

  await t.test("cleanup failure does not mask mismatch error", async () => {
    const loggerErrors = [];
    const storage = createFleetDocumentStorageService({
      uploadFileToS3: async () => "bad-key.jpg",
      deleteObjectFromS3: async () => { throw new Error("S3 Delete API network error"); },
    });

    await assert.rejects(
      async () => storage.uploadPrivate({ file: {}, objectKey: "req.jpg" }, { error: (msg) => loggerErrors.push(msg) }),
      (err) => err.message.includes("Storage returned an unexpected object key")
    );

    assert.ok(loggerErrors.some((m) => m.includes("S3 Mismatch Compensation Delete Failed")));
  });

  await t.test("public URL result is cleaned when key can be derived and URL is never persisted", async () => {
    let deletedKeys = [];
    const storage = createFleetDocumentStorageService({
      uploadFileToS3: async () => "https://s3.amazonaws.com/bucket/fleet-documents/1/fitnessCert/abc.pdf",
      deleteObjectFromS3: async (key) => { deletedKeys.push(key); },
    });

    await assert.rejects(
      async () => storage.uploadPrivate({ file: {}, objectKey: "req.pdf" }),
      (err) => err.message.includes("Storage returned a public URL")
    );

    assert.deepEqual(deletedKeys, ["bucket/fleet-documents/1/fitnessCert/abc.pdf"]);
  });

  await t.test("multi-image upload compensation: second image mismatch cleans second object AND first image", async () => {
    let deletedKeys = [];
    let uploadCount = 0;

    const repo = {
      findFleetForDocumentUpdate: async () => ({ _id: fleetId, ownerId: userId, approvalStatus: "DRAFT", __v: 1 }),
    };

    const storageService = createFleetDocumentStorageService({
      uploadFileToS3: async (file, { objectKey }) => {
        uploadCount++;
        if (uploadCount === 1) return objectKey;
        return "mismatched-img2.jpg";
      },
      deleteObjectFromS3: async (key) => { deletedKeys.push(key); },
    });

    const service = createUploadService({
      repository: repo,
      storage: storageService,
      resolveActor: async () => ({ actorType: "BUS_OWNER", actorId: userId, userId }),
    });

    const file1 = { name: "img1.jpg", mimetype: "image/jpeg", data: jpgHeader, size: 100 };
    const file2 = { name: "img2.jpg", mimetype: "image/jpeg", data: jpgHeader, size: 100 };
    const file3 = { name: "img3.jpg", mimetype: "image/jpeg", data: jpgHeader, size: 100 };
    const file4 = { name: "img4.jpg", mimetype: "image/jpeg", data: jpgHeader, size: 100 };

    await assert.rejects(
      async () => service.uploadDocument({
        fleetId,
        slot: "fleetImages",
        body: {},
        files: { fleetImages: [file1, file2, file3, file4] },
        actorContext: { userInfo: { id: userId, role: "busOwner" } },
      }),
      (err) => err.message.includes("Storage returned an unexpected object key")
    );

    assert.ok(deletedKeys.includes("mismatched-img2.jpg"));
    assert.ok(deletedKeys.some((k) => k.startsWith("fleet-images/")));
  });
});
