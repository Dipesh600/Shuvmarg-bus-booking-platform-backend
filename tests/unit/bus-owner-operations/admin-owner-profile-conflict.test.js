"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerProfileService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile.service");
const { mapAdminOwnerProfileError } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile-error.mapper");

test("admin-owner-profile-conflict unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validOwnerId = "64f000000000000000000001";
  const validUserId = "64f000000000000000000002";
  const validReason = "Updating email address per admin request";

  function makeService(conflictResult = null) {
    const owner = { _id: validOwnerId, user: validUserId, verificationStatus: "pending", __v: 1 };
    const user = { _id: validUserId, email: "old@example.com", phone: "9800000000", __v: 1 };
    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => new Date("2026-08-05T12:00:00Z"),
      repository: {
        findOwnerForProfileUpdate: async () => owner,
        findLinkedUserForProfileUpdate: async () => user,
        findUserConflict: async () => conflictResult,
      },
    };
    return createAdminOwnerProfileService(deps);
  }

  await t.test("existing email owned by another user returns 409 OWNER_PROFILE_EMAIL_CONFLICT", async () => {
    const service = makeService("email");
    await assert.rejects(
      async () => service.updateAdminOwnerProfile({
        id: validOwnerId,
        email: "taken@example.com",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      }),
      (err) => err.statusCode === 409 && err.code === "OWNER_PROFILE_EMAIL_CONFLICT" && err.field === "email"
    );
  });

  await t.test("existing phone owned by another user returns 409 OWNER_PROFILE_PHONE_CONFLICT", async () => {
    const service = makeService("phone");
    await assert.rejects(
      async () => service.updateAdminOwnerProfile({
        id: validOwnerId,
        phone: "9811111111",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      }),
      (err) => err.statusCode === 409 && err.code === "OWNER_PROFILE_PHONE_CONFLICT" && err.field === "phone"
    );
  });

  await t.test("mongo duplicate key error 11000 maps to 409 conflict payload", () => {
    const mongoEmailErr = new Error("E11000 duplicate key error");
    mongoEmailErr.code = 11000;
    mongoEmailErr.keyPattern = { email: 1 };

    const mapped = mapAdminOwnerProfileError(mongoEmailErr);
    assert.equal(mapped.statusCode, 409);
    assert.equal(mapped.payload.errorCode, "OWNER_PROFILE_EMAIL_CONFLICT");
    assert.equal(mapped.payload.field, "email");
  });
});
