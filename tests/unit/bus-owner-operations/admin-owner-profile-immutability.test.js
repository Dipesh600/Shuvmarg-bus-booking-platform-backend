"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerProfileService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile.service");

test("admin-owner-profile-immutability unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validOwnerId = "64f000000000000000000001";
  const validUserId = "64f000000000000000000002";
  const validReason = "Updating user profile details per admin review";

  function makeService(status = "approved") {
    const owner = {
      _id: validOwnerId,
      user: validUserId,
      verificationStatus: status,
      companyName: "Original Bus Co",
      taxRegistration: { panNumber: "123456789", registrationNumber: "REG-100" },
      bankDetails: { bankName: "Nabil Bank", accountNumber: "999000111" },
      __v: 1,
    };
    const user = {
      _id: validUserId,
      name: "Ram Bahadur",
      address: "Kathmandu",
      email: "ram@example.com",
      phone: "9800000000",
      __v: 1,
    };

    let userUpdated = false;
    let ownerUpdated = false;

    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => new Date("2026-08-05T12:00:00Z"),
      repository: {
        findOwnerForProfileUpdate: async () => owner,
        findLinkedUserForProfileUpdate: async () => user,
        findUserConflict: async () => null,
        updateUserWithVersion: async () => { userUpdated = true; return { ...user, __v: 2 }; },
        updateOwnerWithVersion: async () => { ownerUpdated = true; return { ...owner, __v: 2 }; },
      },
    };

    return { service: createAdminOwnerProfileService(deps), wasUserUpdated: () => userUpdated, wasOwnerUpdated: () => ownerUpdated };
  }

  await t.test("approved owner may change general profile fields (name, address)", async () => {
    const { service, wasUserUpdated, wasOwnerUpdated } = makeService("approved");
    const result = await service.updateAdminOwnerProfile({
      id: validOwnerId,
      name: "New Ram Name",
      address: "Pokhara",
      changeReason: validReason,
      actor: { adminId: validAdminId, tokenRole: "ADMIN" },
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data.changedFields.sort(), ["address", "name"]);
    assert.equal(wasUserUpdated(), true);
    assert.equal(wasOwnerUpdated(), true);
  });

  await t.test("approved owner cannot change KYC-significant fields (panNumber, companyName) and returns 409", async () => {
    const { service, wasUserUpdated, wasOwnerUpdated } = makeService("approved");
    await assert.rejects(
      async () => service.updateAdminOwnerProfile({
        id: validOwnerId,
        companyName: "Changed Company",
        panNumber: "987654321",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      }),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, "APPROVED_KYC_FACT_IMMUTABLE");
        assert.deepEqual(err.fields.sort(), ["companyName", "panNumber"]);
        return true;
      }
    );
    assert.equal(wasUserUpdated(), false);
    assert.equal(wasOwnerUpdated(), false);
  });

  await t.test("mixed allowed + forbidden changes reject the full request", async () => {
    const { service, wasUserUpdated, wasOwnerUpdated } = makeService("approved");
    await assert.rejects(
      async () => service.updateAdminOwnerProfile({
        id: validOwnerId,
        name: "New Ram Name",
        panNumber: "987654321",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      }),
      (err) => err.statusCode === 409 && err.code === "APPROVED_KYC_FACT_IMMUTABLE"
    );
    assert.equal(wasUserUpdated(), false);
    assert.equal(wasOwnerUpdated(), false);
  });

  await t.test("submitting unchanged current KYC value does not trigger false rejection for approved owner", async () => {
    const { service } = makeService("approved");
    const result = await service.updateAdminOwnerProfile({
      id: validOwnerId,
      name: "New Ram Name",
      companyName: "Original Bus Co", // unchanged!
      changeReason: validReason,
      actor: { adminId: validAdminId, tokenRole: "ADMIN" },
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data.changedFields, ["name"]);
  });

  await t.test("pending or rejected owner MAY change KYC-significant fields", async () => {
    for (const status of ["pending", "rejected"]) {
      const { service } = makeService(status);
      const result = await service.updateAdminOwnerProfile({
        id: validOwnerId,
        companyName: "New Pending Company",
        panNumber: "987654321",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      });
      assert.equal(result.success, true);
      assert.deepEqual(result.data.changedFields.sort(), ["companyName", "panNumber"]);
    }
  });
});
