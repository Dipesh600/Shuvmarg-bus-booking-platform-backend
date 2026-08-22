"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetApprovalService } = require("../../../src/modules/admin/fleet-management/fleet-status.service");
const { createFleetManagementController } = require("../../../src/modules/admin/fleet-management/fleet-management.controller");
const { approvedFleetReviews } = require("../../helpers/fleet-review-fixtures");

test("fleet-approval-response unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validFleetId = "64f000000000000000000002";
  const fixedDate = new Date("2026-08-05T12:00:00Z");

  const mockPopulatedFleet = {
    _id: validFleetId,
    approvalStatus: "APPROVED",
    status: "ACTIVE",
    ownerId: { name: "Ram Bahadur", email: "ram@example.com" },
    fleetDocuments: { registration: "key1" },
    documentReviews: { fitnessCert: { status: "approved" } },
    approvedBy: validAdminId,
    approvalAuditHistory: [{ eventType: "FLEET_APPROVED" }],
  };

  await t.test("service return DTO strips owner, documents, reviews, audit history, and admin IDs", async () => {
    const service = createFleetApprovalService({
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      repository: {
        atomicDecidePendingFleet: async () => mockPopulatedFleet,
        findApprovalStatusById: async () => null,
      },
      clock: () => fixedDate,
    });

    const result = await service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", reviews: approvedFleetReviews(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } });

    assert.equal(result.success, true);
    assert.deepEqual(result.data, {
      fleetId: validFleetId,
      approvalStatus: "APPROVED",
      status: "ACTIVE",
      approvedAt: fixedDate.toISOString(),
    });

    assert.equal(result.data.ownerId, undefined);
    assert.equal(result.data.fleetDocuments, undefined);
    assert.equal(result.data.documentReviews, undefined);
    assert.equal(result.data.approvedBy, undefined);
    assert.equal(result.data.approvalAuditHistory, undefined);
  });

  await t.test("controller sanitizes 500 internal errors for updateFleetStatus", async () => {
    const mockRes = () => {
      const res = {};
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (body) => { res.body = body; return res; };
      return res;
    };

    const controller = createFleetManagementController({
      updateFleetStatus: async () => { throw new Error("Sensitive DB connection error text"); },
      console: { error: () => {} },
    });

    const res = mockRes();
    await controller.updateFleetStatus({ body: {} }, res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Internal server error");
    assert.equal(res.body.error, undefined, "updateFleetStatus must not leak raw error text");
  });
});
