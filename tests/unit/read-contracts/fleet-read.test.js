"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createFleetReadService } = require("../../../src/modules/read-contracts/fleet/fleet-read.service");
const { ReadContractUnauthorizedError } = require("../../../src/modules/read-contracts/common/read-errors");

test("fleet read service enforces fresh admin authorization for admin endpoints", async () => {
  let repoCalled = false;
  const mockRepo = {
    findAdminPaginatedFleets: async () => {
      repoCalled = true;
      return { items: [], totalItems: 0 };
    },
  };

  const service = createFleetReadService({
    repository: mockRepo,
    resolveAdminActor: async () => null,
  });

  const req = { adminInfo: { id: "admin1", role: "ADMIN" }, query: {} };
  await assert.rejects(() => service.listFleetsForAdmin(req), ReadContractUnauthorizedError);
  assert.equal(repoCalled, false);
});

test("fleet read service enforces server-derived owner authorization for owner endpoints", async () => {
  let queriedUserId = null;
  const mockRepo = {
    findOwnerPaginatedFleets: async ({ userId }) => {
      queriedUserId = userId;
      return { items: [], totalItems: 0 };
    },
  };

  const service = createFleetReadService({ repository: mockRepo });

  const unauthenticatedReq = { userInfo: null, query: { ownerId: "hacked-user-id" } };
  await assert.rejects(() => service.listFleetsForOwner(unauthenticatedReq), ReadContractUnauthorizedError);

  const authenticatedReq = { userInfo: { id: "authenticated-user-123" }, query: { ownerId: "hacked-user-id" } };
  const res = await service.listFleetsForOwner(authenticatedReq);

  assert.equal(res.success, true);
  assert.equal(queriedUserId, "authenticated-user-123");
});

test("fleet read service separates fleetId and fleetCode correctly in DTOs", async () => {
  const mockFleet = {
    _id: "507f1f77bcf86cd799439011",
    fleetId: "SUV-MARG-FLEET-ABC-001",
    busName: "Express Bus",
    busNumber: "BA 1 PA 1234",
    busType: "AC",
    vehicleType: "bus",
    totalSeats: 35,
    status: "active",
    approvalStatus: "APPROVED",
    isApproved: true,
    setupComplete: true,
  };

  const mockRepo = {
    findAdminFleetDetailById: async () => ({
      fleetId: String(mockFleet._id),
      fleetCode: mockFleet.fleetId,
      vehicle: { busName: mockFleet.busName, busNumber: mockFleet.busNumber },
      approvalStatus: mockFleet.approvalStatus,
      setupComplete: true,
    }),
  };

  const service = createFleetReadService({
    repository: mockRepo,
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const req = { adminInfo: { id: "admin1", role: "ADMIN" }, params: { id: "507f1f77bcf86cd799439011" } };
  const res = await service.getFleetDetailForAdmin(req);

  assert.equal(res.success, true);
  assert.equal(res.data.fleetId, "507f1f77bcf86cd799439011");
  assert.equal(res.data.fleetCode, "SUV-MARG-FLEET-ABC-001");
});
