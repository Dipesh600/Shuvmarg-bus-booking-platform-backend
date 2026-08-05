"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminBusOwnerReadService } = require("../../../src/modules/read-contracts/admin-bus-owner/admin-bus-owner-read.service");
const { ReadContractUnauthorizedError, ReadContractValidationError } = require("../../../src/modules/read-contracts/common/read-errors");

test("admin bus owner read service enforces fresh admin authorization", async () => {
  let repositoryCalled = false;
  const mockRepo = {
    findPaginatedOwners: async () => {
      repositoryCalled = true;
      return { items: [], totalItems: 0 };
    },
  };

  const service = createAdminBusOwnerReadService({
    repository: mockRepo,
    resolveAdminActor: async () => null,
  });

  const req = { adminInfo: { id: "admin1", role: "ADMIN" }, query: {} };
  await assert.rejects(() => service.listBusOwners(req), ReadContractUnauthorizedError);
  assert.equal(repositoryCalled, false);
});

test("admin bus owner list returns canonical envelope and pagination", async () => {
  const mockOwner = {
    _id: "507f1f77bcf86cd799439011",
    busOwnerId: "SUV-MARG-BOWNER-ABC-001",
    user: { _id: "507f1f77bcf86cd799439022", name: "John Owner", email: "john@example.com" },
    companyName: "John Express",
    verificationStatus: "approved",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  };

  const mockRepo = {
    findPaginatedOwners: async () => ({
      items: [{
        ownerId: String(mockOwner._id),
        ownerCode: mockOwner.busOwnerId,
        userId: String(mockOwner.user._id),
        name: mockOwner.user.name,
        email: mockOwner.user.email,
        companyName: mockOwner.companyName,
        verificationStatus: mockOwner.verificationStatus,
        fleetCount: 2,
        createdAt: mockOwner.createdAt.toISOString(),
        updatedAt: mockOwner.updatedAt.toISOString(),
      }],
      totalItems: 1,
    }),
  };

  const service = createAdminBusOwnerReadService({
    repository: mockRepo,
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const req = { adminInfo: { id: "admin1", role: "ADMIN" }, query: { page: "1", limit: "10" } };
  const res = await service.listBusOwners(req);

  assert.equal(res.success, true);
  assert.equal(res.data.items.length, 1);
  assert.equal(res.data.items[0].ownerId, "507f1f77bcf86cd799439011");
  assert.equal(res.data.items[0].fleetCount, 2);
  assert.deepEqual(res.data.pagination, { page: 1, limit: 10, totalItems: 1, totalPages: 1 });
});

test("admin bus owner detail validates invalid object id format", async () => {
  const service = createAdminBusOwnerReadService({
    repository: {},
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const req = { adminInfo: { id: "admin1", role: "ADMIN" }, body: { id: "not-an-object-id" } };
  await assert.rejects(() => service.getBusOwnerDetail(req), ReadContractValidationError);
});
