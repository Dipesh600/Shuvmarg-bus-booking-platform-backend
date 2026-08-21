"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetApprovalService,
} = require("../../src/modules/admin/fleet-management/fleet-status.service");
const { approvedFleetReviews, rejectedFleetReviews } = require("../helpers/fleet-review-fixtures");

const validAdminId = "64f000000000000000000099";
const validFleetId = "64f000000000000000000002";

function makeService(overrides = {}) {
  const bus = {
    _id: validFleetId,
    status: "INACTIVE",
    approvalStatus: "PENDING",
  };
  const deps = {
    resolveAuthorizedAdminActor: async () => ({ _id: validAdminId, role: "ADMIN", isActive: true }),
    repository: {
      atomicDecidePendingFleet: async ({ update }) => {
        bus.status = update.$set.status;
        bus.approvalStatus = update.$set.approvalStatus;
        return bus;
      },
      findApprovalStatusById: async () => ({ approvalStatus: "PENDING" }),
    },
    notify: async () => {},
    clock: () => new Date("2026-03-04T00:00:00Z"),
    ...overrides,
  };
  return {
    bus,
    service: createFleetApprovalService(deps),
  };
}

test("invalid status stops before fleet lookup", async () => {
  let queried = false;
  const { service } = makeService({
    repository: {
      atomicDecidePendingFleet: async () => {
        queried = true;
      },
      findApprovalStatusById: async () => {
        queried = true;
      },
    },
  });
  await assert.rejects(
    async () => service.decideFleetApproval({ status: "INVALID", fleetId: validFleetId, actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
    (err) => err.code === "FLEET_STATUS_INVALID_STATUS"
  );
  assert.equal(queried, false);
});

test("missing fleet throws exact 404 FLEET_NOT_FOUND", async () => {
  const { service } = makeService({
    repository: {
      atomicDecidePendingFleet: async () => null,
      findApprovalStatusById: async () => null,
    },
  });
  await assert.rejects(
    async () => service.decideFleetApproval({ status: "APPROVED", fleetId: validFleetId, reviews: approvedFleetReviews(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } }),
    (err) => err.statusCode === 404 && err.code === "FLEET_NOT_FOUND"
  );
});

test("approval saves before notification and preserves response DTO", async () => {
  const order = [];
  const { bus, service } = makeService({
    repository: {
      atomicDecidePendingFleet: async ({ update }) => {
        order.push("save");
        bus.status = update.$set.status;
        bus.approvalStatus = update.$set.approvalStatus;
        return bus;
      },
      findApprovalStatusById: async () => null,
    },
    notify: async (received, state) => {
      order.push("notify");
      assert.equal(received, bus);
      assert.equal(state, "APPROVED");
    },
  });
  const result = await service.decideFleetApproval({ status: "APPROVED", fleetId: validFleetId, reviews: approvedFleetReviews(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } });
  assert.deepEqual(order, ["save", "notify"]);
  assert.equal(bus.status, "ACTIVE");
  assert.equal(result.success, true);
  assert.equal(result.data.approvalStatus, "APPROVED");
  assert.equal(result.data.status, "ACTIVE");
});

test("notification failure is non-fatal post-save", async () => {
  const error = new Error("email failed");
  const { service, bus } = makeService({
    notify: async () => {
      throw error;
    },
  });
  const result = await service.decideFleetApproval({ status: "REJECTED", fleetId: validFleetId, rejectionReason: "Docs invalid", reviews: rejectedFleetReviews(), actor: { adminId: validAdminId, tokenRole: "ADMIN" } });
  assert.equal(bus.status, "INACTIVE");
  assert.equal(bus.approvalStatus, "REJECTED");
  assert.equal(result.success, true);
  assert.equal(result.data.approvalStatus, "REJECTED");
});

test("approval is blocked when the fleet route setup is missing", async () => {
  const FleetRouteSetup = {
    findOne: () => ({ select: () => ({ lean: async () => null }) }),
  };
  const { service } = makeService({ FleetRouteSetup });
  await assert.rejects(
    () => service.decideFleetApproval({
      status: "APPROVED",
      fleetId: validFleetId,
      reviews: approvedFleetReviews(),
      actor: { adminId: validAdminId, tokenRole: "ADMIN" },
    }),
    (error) => error.code === "FLEET_ROUTE_REVIEW_INCOMPLETE" && error.statusCode === 409
  );
});

test("an admin can persist and overwrite a pending item review", async () => {
  const saved = [];
  const { service } = makeService({
    repository: {
      savePendingReviewItem: async (input) => {
        saved.push(input);
        return { _id: validFleetId, approvalStatus: "PENDING" };
      },
    },
  });

  await service.saveFleetReviewItem({
    fleetId: validFleetId,
    key: "routeSetup",
    status: "REJECTED",
    reason: "  Add the missing destination stop.  ",
    actor: { adminId: validAdminId, tokenRole: "ADMIN" },
  });
  await service.saveFleetReviewItem({
    fleetId: validFleetId,
    key: "routeSetup",
    status: "APPROVED",
    actor: { adminId: validAdminId, tokenRole: "ADMIN" },
  });

  assert.equal(saved[0].path, "sectionReviews.routeSetup");
  assert.equal(saved[0].review.status, "rejected");
  assert.equal(saved[0].review.reason, "Add the missing destination stop.");
  assert.equal(saved[1].review.status, "approved");
  assert.equal(saved[1].review.reason, null);
});
