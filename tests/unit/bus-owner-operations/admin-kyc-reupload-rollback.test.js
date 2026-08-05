"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminKycReuploadService } = require("../../../src/modules/admin/bus-owner-management/admin-kyc-reupload.service");

test("admin-kyc-reupload-rollback unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validOwnerId = "64f000000000000000000002";
  const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const makeFile = () => ({ name: "tax.pdf", data: pdfHeader, size: pdfHeader.length, mimetype: "application/pdf" });

  const rejectedOwner = {
    _id: validOwnerId,
    verificationStatus: "rejected",
    taxRegistration: { documentUrls: ["old-tax-key.pdf"], verified: false },
  };

  await t.test("lost atomic update deletes newly uploaded object, preserves old object, and returns 409 conflict", async () => {
    let deletedKeys = [];

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      BusOwner: {
        findById: async () => rejectedOwner,
        findOneAndUpdate: async () => null,
      },
      storageService: {
        uploadDocument: async () => "new-tax-key.pdf",
        deleteMany: async (keys) => { deletedKeys.push(...keys); return { deleted: keys, failed: [] }; },
      },
    };

    const service = createAdminKycReuploadService(deps);

    await assert.rejects(
      async () => service.reuploadRejectedKycDocument({ ownerId: validOwnerId, documentType: "taxRegistration", file: makeFile(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.statusCode === 409 && err.code === "KYC_REUPLOAD_CONFLICT"
    );

    assert.deepEqual(deletedKeys, ["new-tax-key.pdf"], "Must delete newly uploaded key on lost update");
  });

  await t.test("findOneAndUpdate exception deletes new key, preserves old key, and rethrows DB error", async () => {
    let deletedKeys = [];
    const dbError = new Error("Database connection lost");

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      BusOwner: {
        findById: async () => rejectedOwner,
        findOneAndUpdate: async () => { throw dbError; },
      },
      storageService: {
        uploadDocument: async () => "new-tax-key.pdf",
        deleteMany: async (keys) => { deletedKeys.push(...keys); return { deleted: keys, failed: [] }; },
      },
    };

    const service = createAdminKycReuploadService(deps);

    await assert.rejects(
      async () => service.reuploadRejectedKycDocument({ ownerId: validOwnerId, documentType: "taxRegistration", file: makeFile(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err === dbError
    );

    assert.deepEqual(deletedKeys, ["new-tax-key.pdf"]);
  });

  await t.test("cleanup exception does not swallow original DB error", async () => {
    const dbError = new Error("Mongo Write Exception");

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      BusOwner: {
        findById: async () => rejectedOwner,
        findOneAndUpdate: async () => { throw dbError; },
      },
      storageService: {
        uploadDocument: async () => "new-tax-key.pdf",
        deleteMany: async () => { throw new Error("S3 Delete Failure"); },
      },
    };

    const service = createAdminKycReuploadService(deps);

    await assert.rejects(
      async () => service.reuploadRejectedKycDocument({ ownerId: validOwnerId, documentType: "taxRegistration", file: makeFile(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err === dbError
    );
  });

  await t.test("successful atomic update deletes old replaced object key", async () => {
    let deletedKeys = [];

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      BusOwner: {
        findById: async () => rejectedOwner,
        findOneAndUpdate: async () => ({ ...rejectedOwner, verificationStatus: "pending" }),
      },
      storageService: {
        uploadDocument: async () => "new-tax-key.pdf",
        deleteMany: async (keys) => { deletedKeys.push(...keys); return { deleted: keys, failed: [] }; },
      },
    };

    const service = createAdminKycReuploadService(deps);
    await service.reuploadRejectedKycDocument({ ownerId: validOwnerId, documentType: "taxRegistration", file: makeFile(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } });

    assert.deepEqual(deletedKeys, ["old-tax-key.pdf"], "Must delete old replaced object key on success");
  });
});
