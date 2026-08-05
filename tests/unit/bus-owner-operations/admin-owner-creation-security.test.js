"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerCreationService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-creation.service");

test("admin-owner-creation-security unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validUserId = "64f000000000000000000001";
  const validOwnerId = "64f000000000000000000002";
  const fixedDate = new Date("2026-08-05T12:00:00Z");

  const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const makeFile = (name, ext, mime, buf) => ({
    name: `${name}.${ext}`,
    data: buf,
    size: buf.length,
    mimetype: mime,
  });

  const validFiles = {
    companyRegistrationCert: makeFile("comp", "pdf", "application/pdf", pdfHeader),
    panCardImage: makeFile("tax", "pdf", "application/pdf", pdfHeader),
    ownerCitizenship: makeFile("id", "pdf", "application/pdf", pdfHeader),
    bankAuthorizationLetter: makeFile("bank", "pdf", "application/pdf", pdfHeader),
  };

  const validBody = {
    companyName: "Shuvmarg Yatayat",
    ownerName: "Hari Bahadur",
    phone: "9841234567",
    email: "hari@example.com",
    address: "Kathmandu",
    bankName: "Nabil Bank",
    accountHolderName: "Hari Bahadur",
    accountNumber: "001001001001",
    branchName: "Kantipath",
  };

  function makeDeps(overrides = {}) {
    let savedOwner = null;
    let notifiedUser = null;
    const uploadedKeys = [];

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      prepareOwnerIdentity: async () => ({ userData: { name: "Hari" }, password: "temp-pass-123", isNew: true }),
      createUnnotifiedUser: async () => ({ user: { _id: validUserId }, wasCreated: true, roleWasAdded: false, password: "temp-pass-123" }),
      addOwnerRoleToExistingUser: async () => ({ user: { _id: validUserId }, wasCreated: false, roleWasAdded: true }),
      rollbackUserIdentity: async () => {},
      notifyNewOwnerCredentials: async (payload) => { notifiedUser = payload; },
      clock: () => fixedDate,
      mongooseTypesObjectId: function () { return { toString: () => validOwnerId }; },
      storageService: {
        uploadDocument: async ({ documentType, validatedFile }) => {
          const key = `bus_owner_kyc/${documentType}/${validOwnerId}-uuid.${validatedFile.safeExtension}`;
          uploadedKeys.push(key);
          return key;
        },
        deleteMany: async () => ({ deleted: [], failed: [] }),
      },
      BusOwner: function (data) {
        this._id = data._id;
        this.busOwnerId = "BOWN-001";
        this.verificationStatus = data.verificationStatus;
        this.companyRegistration = data.companyRegistration;
        this.ownerIdentity = data.ownerIdentity;
        this.taxRegistration = data.taxRegistration;
        this.bankDetails = data.bankDetails;
        this.kycAuditHistory = data.kycAuditHistory;
        this.save = async () => { savedOwner = this; return this; };
      },
      ...overrides,
    };
    deps.BusOwner.findByIdAndDelete = async () => {};
    return { deps, getSavedOwner: () => savedOwner, getNotifiedUser: () => notifiedUser, uploadedKeys };
  }

  await t.test("creation completes with valid PDF files, pending status, atomic audit, and storage-only bankDetails", async () => {
    const { deps, getSavedOwner, getNotifiedUser, uploadedKeys } = makeDeps();
    const service = createAdminOwnerCreationService(deps);

    const result = await service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { id: validAdminId } });
    assert.equal(result.busOwnerId, "BOWN-001");
    assert.equal(result.userId, validUserId);

    const owner = getSavedOwner();
    assert.equal(owner.verificationStatus, "pending");
    assert.equal(owner.bankDetails.verified, undefined, "bankDetails must not have a review verdict property");
    assert.equal(owner.bankDetails.rejectionReason, undefined);

    assert.equal(owner.kycAuditHistory.length, 1);
    const event = owner.kycAuditHistory[0];
    assert.equal(event.eventType, "KYC_SUBMITTED");
    assert.equal(event.actorType, "ADMIN");
    assert.equal(event.actorId, validAdminId);
    assert.equal(event.metadata.documentCount, 4);

    const notified = getNotifiedUser();
    assert.equal(notified.phone, "9841234567");
    assert.equal(notified.password, "temp-pass-123");
  });

  await t.test("rejects GIF files with 400 validation error", async () => {
    const gifHeader = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const invalidFiles = {
      ...validFiles,
      companyRegistrationCert: makeFile("comp", "gif", "image/gif", gifHeader),
    };
    const { deps } = makeDeps();
    const service = createAdminOwnerCreationService(deps);

    await assert.rejects(
      async () => service.createAdminBusOwner({ body: validBody, files: invalidFiles, actor: { id: validAdminId } }),
      (err) => err.code === "KYC_FILE_TYPE_NOT_ALLOWED" || err.code === "KYC_FILE_EXTENSION_NOT_ALLOWED"
    );
  });
});
