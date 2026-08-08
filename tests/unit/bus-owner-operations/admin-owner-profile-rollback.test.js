"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerProfileService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile.service");

test("admin-owner-profile-rollback unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validOwnerId = "64f000000000000000000001";
  const validUserId = "64f000000000000000000002";
  const validReason = "Updating profile settings for owner";

  await t.test("restoreUserSnapshot returns null — null rollback result is logged and original owner 409 is preserved", async () => {
    const loggedErrors = [];
    const loggedPayloads = [];

    const service = createAdminOwnerProfileService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => new Date("2026-08-05T12:00:00Z"),
      logger: {
        error: (msg, payload) => {
          loggedErrors.push(msg);
          if (payload) loggedPayloads.push(payload);
        },
      },
      repository: {
        findOwnerForProfileUpdate: async () => ({ _id: validOwnerId, user: validUserId, verificationStatus: "pending", __v: 1 }),
        findLinkedUserForProfileUpdate: async () => ({ _id: validUserId, name: "Old Ram", __v: 1 }),
        findUserConflict: async () => null,
        updateUserWithVersion: async () => ({ _id: validUserId, name: "New Ram", __v: 8 }),
        updateOwnerWithVersion: async () => null,   // owner version conflict
        restoreUserSnapshot: async () => null,       // another operation moved User.__v
      },
    });

    await assert.rejects(
      async () => service.updateAdminOwnerProfile({
        id: validOwnerId,
        name: "New Ram",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      }),
      (err) => err.statusCode === 409 && err.code === "OWNER_PROFILE_CONCURRENT_MODIFICATION"
    );

    assert.equal(loggedErrors.length, 1, "Expected exactly one error log for the null rollback");
    assert.match(loggedErrors[0], /guarded version no longer matched/i);

    assert.equal(loggedPayloads.length, 1);
    const logPayload = loggedPayloads[0];
    assert.equal(logPayload.userId, String(validUserId));
    assert.equal(logPayload.expectedVersion, 8);

    const payloadStr = JSON.stringify(logPayload);
    assert.equal(payloadStr.includes("Ram"), false, "Logged payload must not contain User name value");
    assert.equal(payloadStr.includes("@"), false, "Logged payload must not contain email");
    assert.equal(payloadStr.includes("bank"), false, "Logged payload must not contain bank data");
  });

  await t.test("original owner repository error is preserved when rollback returns null", async () => {
    const dbErr = new Error("Unexpected Mongo connection loss");

    const service = createAdminOwnerProfileService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => new Date("2026-08-05T12:00:00Z"),
      logger: { error: () => {} },
      repository: {
        findOwnerForProfileUpdate: async () => ({ _id: validOwnerId, user: validUserId, verificationStatus: "pending", __v: 1 }),
        findLinkedUserForProfileUpdate: async () => ({ _id: validUserId, name: "Old Ram", __v: 1 }),
        findUserConflict: async () => null,
        updateUserWithVersion: async () => ({ _id: validUserId, __v: 2 }),
        updateOwnerWithVersion: async () => { throw dbErr; },
        restoreUserSnapshot: async () => null,
      },
    });

    await assert.rejects(
      async () => service.updateAdminOwnerProfile({
        id: validOwnerId,
        name: "New Ram",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      }),
      (err) => {
        assert.equal(err, dbErr, "Original owner repository error must be re-thrown exactly");
        return true;
      }
    );
  });

  await t.test("null rollback result does not produce a false success response", async () => {
    let resultReturned = false;

    const service = createAdminOwnerProfileService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => new Date("2026-08-05T12:00:00Z"),
      logger: { error: () => {} },
      repository: {
        findOwnerForProfileUpdate: async () => ({ _id: validOwnerId, user: validUserId, verificationStatus: "pending", __v: 1 }),
        findLinkedUserForProfileUpdate: async () => ({ _id: validUserId, name: "Old Ram", __v: 1 }),
        findUserConflict: async () => null,
        updateUserWithVersion: async () => ({ _id: validUserId, __v: 2 }),
        updateOwnerWithVersion: async () => null,
        restoreUserSnapshot: async () => null,
      },
    });

    let threwError = false;
    try {
      const result = await service.updateAdminOwnerProfile({
        id: validOwnerId,
        name: "New Ram",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      });
      if (result && result.success) resultReturned = true;
    } catch (err) {
      threwError = true;
      assert.equal(err.statusCode, 409, "Must throw 409 not produce success");
    }

    assert.equal(resultReturned, false, "Must not return success when rollback returns null");
    assert.equal(threwError, true);
  });
});
