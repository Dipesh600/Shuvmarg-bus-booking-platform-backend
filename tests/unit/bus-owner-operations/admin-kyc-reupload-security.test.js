"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminKycReuploadService } = require("../../../src/modules/admin/bus-owner-management/admin-kyc-reupload.service");

test("admin-kyc-reupload-security unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validOwnerId = "64f000000000000000000002";
  const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const makeFile = (name) => ({ name: `${name}.pdf`, data: pdfHeader, size: pdfHeader.length, mimetype: "application/pdf" });

  const rejectedOwner = {
    _id: validOwnerId,
    verificationStatus: "rejected",
    rejectionReason: "Tax and license invalid",
    companyRegistration: { documentUrls: ["old-company.pdf"], verified: true, rejectionReason: null },
    taxRegistration: { documentUrls: ["old-tax.pdf"], verified: false, rejectionReason: "Invalid TAX" },
    transportLicense: { documentUrls: ["old-license.pdf"], verified: false, rejectionReason: "Expired License" },
  };

  function makeDeps(overrides = {}) {
    let updateQuery = null;
    let updatePayload = null;

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      BusOwner: {
        findById: async () => rejectedOwner,
        findOneAndUpdate: async (q, u) => {
          updateQuery = q;
          updatePayload = u;
          return { ...rejectedOwner, verificationStatus: "pending", taxRegistration: { documentUrls: ["new-tax.pdf"], verified: false } };
        },
      },
      storageService: {
        uploadDocument: async () => "new-tax.pdf",
        deleteMany: async () => ({ deleted: [], failed: [] }),
      },
      ...overrides,
    };
    return { deps, getUpdate: () => ({ query: updateQuery, payload: updatePayload }) };
  }

  await t.test("reupload is allowed on rejected owner, preserves non-targeted rejected document verdicts, and appends atomic audit", async () => {
    const { deps, getUpdate } = makeDeps();
    const service = createAdminKycReuploadService(deps);

    const result = await service.reuploadRejectedKycDocument({
      ownerId: validOwnerId,
      documentType: "taxRegistration",
      file: makeFile("new-tax"),
      actor: { id: validAdminId },
    });

    assert.equal(result.verificationStatus, "pending");
    assert.equal(result.documentType, "taxRegistration");

    const { query, payload } = getUpdate();
    assert.equal(query.verificationStatus, "rejected");
    assert.equal(payload.$set.verificationStatus, "pending");
    assert.equal(payload.$set.rejectionReason, null);
    assert.deepEqual(payload.$set["taxRegistration.documentUrls"], ["new-tax.pdf"]);
    assert.equal(payload.$set["taxRegistration.verified"], false);
    assert.equal(payload.$set["taxRegistration.rejectionReason"], null);

    assert.equal(payload.$set["transportLicense.verified"], undefined, "Must NOT alter non-targeted document verdict");
    assert.equal(payload.$set["transportLicense.rejectionReason"], undefined);

    const audit = payload.$push.kycAuditHistory;
    assert.equal(audit.eventType, "KYC_RESUBMITTED");
    assert.equal(audit.actorType, "ADMIN");
    assert.equal(audit.actorId, validAdminId);
    assert.equal(audit.fromStatus, "rejected");
    assert.equal(audit.toStatus, "pending");
  });

  await t.test("rejects reupload when owner status is approved or pending with 409 Conflict", async () => {
    for (const status of ["approved", "pending"]) {
      const { deps } = makeDeps({
        BusOwner: { findById: async () => ({ ...rejectedOwner, verificationStatus: status }) },
      });
      const service = createAdminKycReuploadService(deps);

      await assert.rejects(
        async () => service.reuploadRejectedKycDocument({ ownerId: validOwnerId, documentType: "taxRegistration", file: makeFile("new-tax"), actor: { id: validAdminId } }),
        (err) => err.statusCode === 409 && err.code === "KYC_REUPLOAD_INVALID_STATE"
      );
    }
  });

  await t.test("rejects bankDetails and insuranceCertificates as reupload document types with 400 Bad Request", async () => {
    const { deps } = makeDeps();
    const service = createAdminKycReuploadService(deps);

    for (const documentType of ["bankDetails", "insuranceCertificates", "invalidType"]) {
      await assert.rejects(
        async () => service.reuploadRejectedKycDocument({ ownerId: validOwnerId, documentType, file: makeFile("new-doc"), actor: { id: validAdminId } }),
        (err) => err.statusCode === 400 && err.code === "KYC_REUPLOAD_INVALID_DOCUMENT_TYPE"
      );
    }
  });
});
