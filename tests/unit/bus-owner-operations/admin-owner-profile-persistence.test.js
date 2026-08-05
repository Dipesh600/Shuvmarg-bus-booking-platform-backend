"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerProfileService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile.service");

test("admin-owner-profile-persistence unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validOwnerId = "64f000000000000000000001";
  const validUserId = "64f000000000000000000002";
  const validReason = "Updating profile settings for owner";

  await t.test("owner-only change does not update User, does not increment User.__v, and does not trigger user rollback on owner failure", async () => {
    let updateUserCalled = false;
    let restoreUserCalled = false;

    const service = createAdminOwnerProfileService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => new Date("2026-08-05T12:00:00Z"),
      repository: {
        findOwnerForProfileUpdate: async () => ({ _id: validOwnerId, user: validUserId, verificationStatus: "pending", companyName: "Old Co", __v: 1 }),
        findLinkedUserForProfileUpdate: async () => ({ _id: validUserId, name: "Ram", __v: 1 }),
        findUserConflict: async () => null,
        updateUserWithVersion: async () => { updateUserCalled = true; return { _id: validUserId, __v: 2 }; },
        updateOwnerWithVersion: async () => null,
        restoreUserSnapshot: async () => { restoreUserCalled = true; },
      },
    });

    await assert.rejects(
      async () => service.updateAdminOwnerProfile({
        id: validOwnerId,
        companyName: "New Co",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      }),
      (err) => err.statusCode === 409 && err.code === "OWNER_PROFILE_CONCURRENT_MODIFICATION"
    );

    assert.equal(updateUserCalled, false);
    assert.equal(restoreUserCalled, false);
  });

  await t.test("user update occurs before owner update and owner failure triggers user compensation with updatedUser.__v", async () => {
    const steps = [];
    let restoredVersion = null;
    let restoredSnapshot = null;

    const service = createAdminOwnerProfileService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => new Date("2026-08-05T12:00:00Z"),
      repository: {
        findOwnerForProfileUpdate: async () => ({ _id: validOwnerId, user: validUserId, verificationStatus: "pending", __v: 1 }),
        findLinkedUserForProfileUpdate: async () => ({ _id: validUserId, name: "Old Ram", address: "Old City", __v: 10 }),
        findUserConflict: async () => null,
        updateUserWithVersion: async () => { steps.push("updateUser"); return { _id: validUserId, name: "New Ram", __v: 11 }; },
        updateOwnerWithVersion: async () => { steps.push("updateOwner"); return null; },
        restoreUserSnapshot: async ({ expectedCurrentVersion, snapshot }) => {
          steps.push("restoreUser");
          restoredVersion = expectedCurrentVersion;
          restoredSnapshot = snapshot;
          return { _id: validUserId, __v: 12 };
        },
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

    assert.deepEqual(steps, ["updateUser", "updateOwner", "restoreUser"]);
    assert.equal(restoredVersion, 11, "Rollback must use version returned by successful User update");
    assert.deepEqual(restoredSnapshot, { name: "Old Ram" });
  });

  await t.test("owner repository exception triggers user rollback and original error is re-thrown", async () => {
    let userRestored = false;
    const dbErr = new Error("Mongo network error");

    const service = createAdminOwnerProfileService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => new Date("2026-08-05T12:00:00Z"),
      repository: {
        findOwnerForProfileUpdate: async () => ({ _id: validOwnerId, user: validUserId, verificationStatus: "pending", __v: 1 }),
        findLinkedUserForProfileUpdate: async () => ({ _id: validUserId, name: "Old Ram", __v: 1 }),
        findUserConflict: async () => null,
        updateUserWithVersion: async () => ({ _id: validUserId, __v: 2 }),
        updateOwnerWithVersion: async () => { throw dbErr; },
        restoreUserSnapshot: async () => { userRestored = true; return { _id: validUserId, __v: 3 }; },
      },
    });

    await assert.rejects(
      async () => service.updateAdminOwnerProfile({
        id: validOwnerId,
        name: "New Ram",
        changeReason: validReason,
        actor: { adminId: validAdminId, tokenRole: "ADMIN" },
      }),
      (err) => err === dbErr
    );

    assert.equal(userRestored, true);
  });
});
