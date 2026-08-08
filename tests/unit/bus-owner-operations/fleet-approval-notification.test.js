"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetApprovalService } = require("../../../src/modules/admin/fleet-management/fleet-status.service");

test("fleet-approval-notification unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validFleetId = "64f000000000000000000002";

  const mockPopulatedFleet = {
    _id: validFleetId,
    approvalStatus: "APPROVED",
    status: "ACTIVE",
    ownerId: {
      _id: "64f000000000000000000055",
      name: "Ram Bahadur",
      email: "ram@example.com",
      contactNumber: "9800000000",
    },
  };

  await t.test("notification receives populated owner contact details post-persistence", async () => {
    let notifiedFleet = null;
    let notifiedState = null;

    const service = createFleetApprovalService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      repository: {
        atomicDecidePendingFleet: async () => mockPopulatedFleet,
        findApprovalStatusById: async () => null,
      },
      notify: async (fleet, state) => {
        notifiedFleet = fleet;
        notifiedState = state;
      },
      clock: () => new Date("2026-08-05T12:00:00Z"),
    });

    const result = await service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", actor: { adminId: validAdminId, tokenRole: "ADMIN" } });
    assert.equal(result.success, true);
    assert.equal(notifiedState, "APPROVED");
    assert.equal(notifiedFleet.ownerId.email, "ram@example.com");
    assert.equal(notifiedFleet.ownerId.name, "Ram Bahadur");
    assert.equal(notifiedFleet.ownerId.contactNumber, "9800000000");
  });

  await t.test("notification failure logs warning and does not throw or fail decision", async () => {
    let warnLogged = false;
    const service = createFleetApprovalService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      repository: {
        atomicDecidePendingFleet: async () => mockPopulatedFleet,
        findApprovalStatusById: async () => null,
      },
      notify: async () => { throw new Error("Email service offline"); },
      logger: { warn: () => { warnLogged = true; } },
      clock: () => new Date("2026-08-05T12:00:00Z"),
    });

    const result = await service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", actor: { adminId: validAdminId, tokenRole: "ADMIN" } });
    assert.equal(result.success, true);
    assert.equal(warnLogged, true);
  });

  await t.test("notification is skipped when validation or authorization fails", async () => {
    let notificationCalled = false;
    const service = createFleetApprovalService({
      resolveAuthorizedAdminActor: async () => { throw new Error("Unauthorized"); },
      repository: {
        atomicDecidePendingFleet: async () => mockPopulatedFleet,
      },
      notify: async () => { notificationCalled = true; },
    });

    await assert.rejects(async () => service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", actor: null }));
    assert.equal(notificationCalled, false);
  });
});
