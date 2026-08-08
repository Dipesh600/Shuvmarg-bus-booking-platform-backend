"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminOwnerProfileService } = require("../../../src/modules/admin/bus-owner-management/admin-owner-profile.service");
const { createOwnerProfileController } = require("../../../src/modules/admin/bus-owner-management/owner-profile.controller");

test("admin-owner-profile-response unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validOwnerId = "64f000000000000000000001";
  const validUserId = "64f000000000000000000002";
  const validReason = "Updating bank details per owner request";
  const fixedDate = new Date("2026-08-05T12:00:00Z");

  await t.test("service return DTO strips full models, sensitive bank/PAN values, documents, and audit history", async () => {
    let capturedOwnerSet = null;

    const service = createAdminOwnerProfileService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => fixedDate,
      repository: {
        findOwnerForProfileUpdate: async () => ({ _id: validOwnerId, user: validUserId, verificationStatus: "pending", bankDetails: { accountNumber: "OLD123" }, __v: 1 }),
        findLinkedUserForProfileUpdate: async () => ({ _id: validUserId, name: "Ram", __v: 1 }),
        findUserConflict: async () => null,
        updateOwnerWithVersion: async ({ set }) => {
          capturedOwnerSet = set;
          return { _id: validOwnerId, __v: 2 };
        },
      },
    });

    const result = await service.updateAdminOwnerProfile({
      id: validOwnerId,
      bankName: "Global IME",
      changeReason: validReason,
      actor: { adminId: validAdminId, tokenRole: "ADMIN" },
    });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      ownerId: validOwnerId,
      userId: validUserId,
      verificationStatus: "pending",
      changedFields: ["bankName"],
      updatedAt: fixedDate.toISOString(),
    });

    assert.equal(result.data.bankName, undefined);
    assert.equal(result.data.accountNumber, undefined);
    assert.equal(result.data.panNumber, undefined);
    assert.equal(result.data.user, undefined);
    assert.equal(result.data.busOwner, undefined);
    assert.equal(result.data.adminProfileAuditHistory, undefined);

    assert.deepEqual(capturedOwnerSet, { "bankDetails.bankName": "Global IME" }, "bankName must map to bankDetails.bankName path");
  });

  await t.test("controller sanitizes 500 internal errors for updateBusOwnerProfile", async () => {
    const mockRes = () => {
      const res = {};
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (body) => { res.body = body; return res; };
      return res;
    };

    const controller = createOwnerProfileController({
      updateAdminOwnerProfile: async () => { throw new Error("Sensitive DB password leaked in error"); },
      console: { error: () => {} },
    });

    const res = mockRes();
    await controller.updateBusOwnerProfile({ body: {} }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Internal server error");
    assert.equal(res.body.error, undefined, "updateBusOwnerProfile must not leak raw error text");
  });
});
