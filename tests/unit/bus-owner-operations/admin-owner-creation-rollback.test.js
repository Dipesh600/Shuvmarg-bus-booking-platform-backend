"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerCreationService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-creation.service");

test("admin-owner-creation-rollback unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validUserId = "64f000000000000000000001";
  const pdfHeader = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
  const makeFile = (name) => ({ name: `${name}.pdf`, data: pdfHeader, size: pdfHeader.length, mimetype: "application/pdf" });

  const validFiles = { companyRegistrationCert: makeFile("comp"), panCardImage: makeFile("tax"), ownerCitizenship: makeFile("id") };
  const validBody = { companyName: "Shuvmarg Yatayat", ownerName: "Hari Bahadur", phone: "9841234567", address: "Kathmandu", bankName: "Nabil Bank", accountHolderName: "Hari", accountNumber: "001", branchName: "K" };

  await t.test("new user save failure deletes newly created User and uploaded S3 objects without sending notifications", async () => {
    let deletedUser = null;
    let deletedKeys = [];
    let notified = false;

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      prepareOwnerIdentity: async () => ({ userData: { name: "Hari" }, password: "pass", isNew: true }),
      createUnnotifiedUser: async () => ({ user: { _id: validUserId }, wasCreated: true, roleWasAdded: false, password: "pass" }),
      rollbackUserIdentity: async (res) => { if (res.wasCreated) deletedUser = res.user._id; },
      notifyNewOwnerCredentials: async () => { notified = true; },
      storageService: {
        uploadDocument: async ({ documentType }) => `key-${documentType}`,
        deleteMany: async (keys) => { deletedKeys = keys; return { deleted: keys, failed: [] }; },
      },
      BusOwner: function () { this.save = async () => { throw new Error("DB Save Failed"); }; },
      mongooseTypesObjectId: function () { return { toString: () => "owner-1" }; },
    };
    deps.BusOwner.findByIdAndDelete = async () => {};

    const service = createAdminOwnerCreationService(deps);
    await assert.rejects(
      async () => service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.message === "DB Save Failed"
    );
    assert.equal(deletedUser, validUserId);
    assert.deepEqual(deletedKeys, ["key-companyRegistration", "key-taxRegistration", "key-ownerIdentity"]);
    assert.equal(notified, false);
  });

  await t.test("existing user role update failure deletes created BusOwner and uploaded files without deleting pre-existing User", async () => {
    let deletedUser = null;
    let deletedOwner = null;
    let deletedKeys = [];

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      prepareOwnerIdentity: async () => ({ existingUser: { _id: validUserId, roles: ["passenger"] }, isNew: false }),
      addOwnerRoleToExistingUser: async () => { throw new Error("Role Update Failed"); },
      rollbackUserIdentity: async (res) => { if (res.wasCreated) deletedUser = res.user._id; },
      storageService: {
        uploadDocument: async ({ documentType }) => `key-${documentType}`,
        deleteMany: async (keys) => { deletedKeys = keys; return { deleted: keys, failed: [] }; },
      },
      BusOwner: function (data) { this._id = data._id; this.save = async () => this; },
      mongooseTypesObjectId: function () { return { toString: () => "owner-existing" }; },
    };
    deps.BusOwner.findByIdAndDelete = async (id) => { deletedOwner = id; };

    const service = createAdminOwnerCreationService(deps);
    await assert.rejects(
      async () => service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.message === "Role Update Failed"
    );
    assert.equal(deletedUser, null);
    assert.equal(deletedOwner.toString(), "owner-existing");
    assert.deepEqual(deletedKeys, ["key-companyRegistration", "key-taxRegistration", "key-ownerIdentity"]);
  });

  await t.test("S3 cleanup throws but BusOwner deletion and User rollback are still attempted, original error preserved, and cleanup error logged", async () => {
    let busOwnerDeleteAttempted = false;
    let userRollbackAttempted = false;
    let loggedErrors = [];

    const originalError = new Error("Role Update Failed");
    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      prepareOwnerIdentity: async () => ({ existingUser: { _id: validUserId }, isNew: false }),
      addOwnerRoleToExistingUser: async () => { throw originalError; },
      rollbackUserIdentity: async () => { userRollbackAttempted = true; },
      logger: { error: (msg, err) => { loggedErrors.push({ msg, err }); } },
      storageService: {
        uploadDocument: async ({ documentType }) => `key-${documentType}`,
        deleteMany: async () => { throw new Error("S3 Delete Network Failure"); },
      },
      BusOwner: function (data) { this._id = data._id; this.save = async () => this; },
      mongooseTypesObjectId: function () { return { toString: () => "owner-err" }; },
    };
    deps.BusOwner.findByIdAndDelete = async () => { busOwnerDeleteAttempted = true; };

    const service = createAdminOwnerCreationService(deps);
    await assert.rejects(
      async () => service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err === originalError
    );
    assert.equal(busOwnerDeleteAttempted, true);
    assert.equal(userRollbackAttempted, true);
    assert.equal(loggedErrors.length, 1);
  });

  await t.test("Multiple cleanup failures preserve original error and log all failures", async () => {
    let loggedErrors = [];
    const originalError = new Error("DB Save Crash");

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      prepareOwnerIdentity: async () => ({ userData: { name: "Hari" }, password: "pass", isNew: true }),
      createUnnotifiedUser: async () => ({ user: { _id: validUserId }, wasCreated: true, roleWasAdded: false }),
      rollbackUserIdentity: async () => { throw new Error("User Rollback DB Error"); },
      logger: { error: (msg, err) => { loggedErrors.push({ msg, err }); } },
      storageService: {
        uploadDocument: async ({ documentType }) => `key-${documentType}`,
        deleteMany: async () => { throw new Error("S3 Delete Exception"); },
      },
      BusOwner: function (data) { this._id = data._id; this.save = async () => { throw originalError; }; },
      mongooseTypesObjectId: function () { return { toString: () => "owner-multi-err" }; },
    };
    deps.BusOwner.findByIdAndDelete = async () => { throw new Error("BusOwner Delete Error"); };

    const service = createAdminOwnerCreationService(deps);
    await assert.rejects(
      async () => service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err === originalError
    );
    assert.equal(loggedErrors.length, 3);
  });
});
