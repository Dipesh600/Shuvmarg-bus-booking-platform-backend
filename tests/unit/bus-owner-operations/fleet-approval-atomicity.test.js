"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createFleetApprovalService } = require("../../../src/modules/admin/fleet-management/fleet-status.service");
const { approvedFleetReviews, rejectedFleetReviews } = require("../../helpers/fleet-review-fixtures");

test("fleet-approval-atomicity unit tests", async (t) => {
  const validAdminId = "64f000000000000000000099";
  const validFleetId = "64f000000000000000000002";
  const fixedDate = new Date("2026-08-05T12:00:00Z");

  function makeService(overrides = {}) {
    let capturedUpdate = null;
    const deps = {
      resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
      clock: () => fixedDate,
      repository: {
        atomicDecidePendingFleet: async ({ fleetId, update }) => {
          capturedUpdate = update;
          return { _id: fleetId, approvalStatus: update.$set.approvalStatus, status: update.$set.status };
        },
        findApprovalStatusById: async () => null,
        ...overrides.repository,
      },
      ...overrides,
    };
    return { service: createFleetApprovalService(deps), getUpdate: () => capturedUpdate };
  }

  await t.test("atomic approval sets APPROVED/ACTIVE, records admin _id & timestamp, clears rejection, and pushes audit", async () => {
    const { service, getUpdate } = makeService();
    await service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", reviews: approvedFleetReviews(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } });

    const update = getUpdate();
    assert.equal(update.$set.approvalStatus, "APPROVED");
    assert.equal(update.$set.status, "ACTIVE");
    assert.equal(update.$set.approvedBy, validAdminId);
    assert.equal(update.$set.approvedAt, fixedDate);
    assert.equal(update.$set.rejectedBy, null);
    assert.equal(update.$set.rejectedAt, null);
    assert.equal(update.$set.rejectionReason, null);

    assert.equal(update.$set.fleetDocuments, undefined, "Unrelated fields must not be included in $set");
    assert.equal(update.$set.documentReviews, undefined);
    assert.equal(update.$set["documentReviews.insurance"].status, "approved");
    assert.equal(update.$set["sectionReviews.routeSetup"].status, "approved");

    const audit = update.$push.approvalAuditHistory;
    assert.equal(audit.eventType, "FLEET_APPROVED");
    assert.equal(audit.actorId, validAdminId);
    assert.equal(audit.occurredAt, fixedDate);
  });

  await t.test("atomic rejection sets REJECTED/INACTIVE, records admin _id, timestamp & reason, clears approval, and pushes audit", async () => {
    const { service, getUpdate } = makeService();
    await service.decideFleetApproval({ fleetId: validFleetId, status: "REJECTED", rejectionReason: "Invalid fitness certificate", reviews: rejectedFleetReviews("fitnessCert", "Invalid fitness certificate"), actor: { adminId: validAdminId, tokenRole: "ADMIN" } });

    const update = getUpdate();
    assert.equal(update.$set.approvalStatus, "REJECTED");
    assert.equal(update.$set.status, "INACTIVE");
    assert.equal(update.$set.rejectedBy, validAdminId);
    assert.equal(update.$set.rejectedAt, fixedDate);
    assert.equal(update.$set.rejectionReason, "Invalid fitness certificate");
    assert.equal(update.$set.approvedBy, null);
    assert.equal(update.$set.approvedAt, null);

    const audit = update.$push.approvalAuditHistory;
    assert.equal(audit.eventType, "FLEET_REJECTED");
    assert.equal(audit.metadata.rejectionReason, "Invalid fitness certificate");
  });

  await t.test("missing fleet returns 404 when atomic update returns null and lookup returns null", async () => {
    const { service } = makeService({
      repository: {
        atomicDecidePendingFleet: async () => null,
        findApprovalStatusById: async () => null,
      },
    });

    await assert.rejects(
      async () => service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", reviews: approvedFleetReviews(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.statusCode === 404 && err.code === "FLEET_NOT_FOUND"
    );
  });

  await t.test("non-pending fleet returns 409 when atomic update returns null and lookup returns non-pending status", async () => {
    const { service } = makeService({
      repository: {
        atomicDecidePendingFleet: async () => null,
        findApprovalStatusById: async () => ({ approvalStatus: "APPROVED" }),
      },
    });

    await assert.rejects(
      async () => service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", reviews: approvedFleetReviews(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.statusCode === 409 && err.code === "FLEET_APPROVAL_CONFLICT" && err.message.includes("APPROVED")
    );
  });

  await t.test("null update with lookup still PENDING returns 409 conflict", async () => {
    const { service } = makeService({
      repository: {
        atomicDecidePendingFleet: async () => null,
        findApprovalStatusById: async () => ({ approvalStatus: "PENDING" }),
      },
    });

    await assert.rejects(
      async () => service.decideFleetApproval({ fleetId: validFleetId, status: "APPROVED", reviews: approvedFleetReviews(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
      (err) => err.statusCode === 409 && err.code === "FLEET_APPROVAL_CONFLICT" && err.message.includes("could not be committed")
    );
  });
});
