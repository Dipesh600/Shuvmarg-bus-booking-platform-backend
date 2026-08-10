"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerCreationService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-creation.service");
const { getAdminActor, resolveAuthorizedAdminActor } = require("../../../src/modules/admin/bus-owner-management/admin-actor.resolver");

test("admin-owner-creation-security unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validUserId = "64f000000000000000000001";
  const validOwnerId = "64f000000000000000000002";
  const fixedDate = new Date("2026-08-05T12:00:00Z");

  const pdfHeader = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
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
        this.kycSecurity = data.kycSecurity;
        this.kycAuditHistory = data.kycAuditHistory;
        this.save = async () => { savedOwner = this; return this; };
      },
      ...overrides,
    };
    deps.BusOwner.findByIdAndDelete = async () => {};
    return { deps, getSavedOwner: () => savedOwner, getNotifiedUser: () => notifiedUser, uploadedKeys };
  }

  await t.test("getAdminActor extracts explicit adminId and tokenRole from req.adminInfo", () => {
    assert.equal(getAdminActor(null), null);
    assert.equal(getAdminActor({}), null);
    assert.equal(getAdminActor({ adminInfo: { id: validAdminId } }), null);

    const actor = getAdminActor({ adminInfo: { id: validAdminId, role: "ADMIN" } });
    assert.deepEqual(actor, { adminId: validAdminId, tokenRole: "ADMIN" });
  });

  await t.test("role drift returns 403 ADMIN_ROLE_MISMATCH when tokenRole differs from active DB role", async () => {
    const mockAdminModel = {
      findById: () => ({ lean: async () => ({ _id: validAdminId, role: "SUB_ADMIN", isActive: true, accountLocked: false }) }),
    };

    await assert.rejects(
      async () => resolveAuthorizedAdminActor({ adminId: validAdminId, tokenRole: "ADMIN" }, { Admin: mockAdminModel }),
      (err) => err.statusCode === 403 && err.code === "ADMIN_ROLE_MISMATCH"
    );
  });

  await t.test("creation completes with valid PDF files, pending status, atomic audit, and storage-only bankDetails", async () => {
    const { deps, getSavedOwner, getNotifiedUser } = makeDeps();
    const service = createAdminOwnerCreationService(deps);

    const result = await service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { adminId: validAdminId, tokenRole: "ADMIN" } });
    assert.equal(result.busOwnerId, "BOWN-001");
    assert.equal(result.userId, validUserId);

    const owner = getSavedOwner();
    assert.equal(owner.verificationStatus, "pending");
    assert.equal(owner.bankDetails.verified, undefined);
    assert.equal(owner.kycSecurity.malwareScanStatus, "skipped_non_production");
    assert.equal(owner.kycSecurity.fileCount, 3);
    assert.equal(owner.kycAuditHistory.length, 1);

    const notified = getNotifiedUser();
    assert.equal(notified.phone, "9841234567");
  });

  await t.test("notification failure is non-fatal: User, BusOwner, and uploaded files remain intact", async () => {
    let warningLogged = false;
    const { deps, getSavedOwner, uploadedKeys } = makeDeps({
      notifyNewOwnerCredentials: async () => { throw new Error("SMS Gateway Timeout"); },
      logger: { warn: () => { warningLogged = true; } },
    });
    const service = createAdminOwnerCreationService(deps);

    const result = await service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { adminId: validAdminId, tokenRole: "ADMIN" } });
    assert.equal(result.busOwnerId, "BOWN-001");
    assert.notEqual(getSavedOwner(), null, "BusOwner must remain saved");
    assert.equal(uploadedKeys.length, 3, "Uploaded documents must remain");
    assert.equal(warningLogged, true, "Notification error must be logged as warning");
  });

  await t.test("malware scan failure prevents identity creation and storage uploads", async () => {
    let identityCalls = 0;
    const scanError = Object.assign(new Error("infected"), { code: "KYC_MALWARE_DETECTED", statusCode: 422 });
    const { deps, uploadedKeys } = makeDeps({
      malwareScanner: { scanValidatedFiles: async () => { throw scanError; } },
      prepareOwnerIdentity: async () => { identityCalls += 1; return {}; },
    });
    const service = createAdminOwnerCreationService(deps);

    await assert.rejects(
      () => service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (error) => error === scanError
    );
    assert.equal(identityCalls, 0);
    assert.equal(uploadedKeys.length, 0);
  });
});
