"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerCreationService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-creation.service");

test("admin-owner-creation-rollback unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validUserId = "64f000000000000000000001";
  const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const makeFile = (name) => ({ name: `${name}.pdf`, data: pdfHeader, size: pdfHeader.length, mimetype: "application/pdf" });

  const validFiles = {
    companyRegistrationCert: makeFile("comp"),
    panCardImage: makeFile("tax"),
    ownerCitizenship: makeFile("id"),
  };

  const validBody = {
    companyName: "Shuvmarg Yatayat",
    ownerName: "Hari Bahadur",
    phone: "9841234567",
    address: "Kathmandu",
    bankName: "Nabil Bank",
    accountHolderName: "Hari Bahadur",
    accountNumber: "001001001001",
    branchName: "Kantipath",
  };

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
      BusOwner: function () {
        this.save = async () => { throw new Error("DB Save Failed"); };
      },
      mongooseTypesObjectId: function () { return { toString: () => "owner-1" }; },
    };
    deps.BusOwner.findByIdAndDelete = async () => {};

    const service = createAdminOwnerCreationService(deps);

    await assert.rejects(
      async () => service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { id: validAdminId } }),
      (err) => err.message === "DB Save Failed"
    );

    assert.equal(deletedUser, validUserId, "Must delete operation-created User upon failure");
    assert.deepEqual(deletedKeys, ["key-companyRegistration", "key-taxRegistration", "key-ownerIdentity"], "Must delete uploaded S3 keys");
    assert.equal(notified, false, "Must not send notification on failure");
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
      BusOwner: function (data) {
        this._id = data._id;
        this.save = async () => this;
      },
      mongooseTypesObjectId: function () { return { toString: () => "owner-existing" }; },
    };
    deps.BusOwner.findByIdAndDelete = async (id) => { deletedOwner = id; };

    const service = createAdminOwnerCreationService(deps);

    await assert.rejects(
      async () => service.createAdminBusOwner({ body: validBody, files: validFiles, actor: { id: validAdminId } }),
      (err) => err.message === "Role Update Failed"
    );

    assert.equal(deletedUser, null, "Must NEVER delete a pre-existing User");
    assert.equal(deletedOwner.toString(), "owner-existing", "Must delete newly created BusOwner");
    assert.deepEqual(deletedKeys, ["key-companyRegistration", "key-taxRegistration", "key-ownerIdentity"]);
  });
});
