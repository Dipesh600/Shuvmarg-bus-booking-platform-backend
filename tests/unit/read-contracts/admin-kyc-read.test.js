"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminKycReadService } = require("../../../src/modules/read-contracts/admin-kyc/admin-kyc-read.service");
const { ReadContractUnauthorizedError, ReadContractValidationError } = require("../../../src/modules/read-contracts/common/read-errors");

test("admin kyc read service enforces fresh admin authorization", async () => {
  let repositoryCalled = false;
  const mockRepo = {
    findPaginatedKycs: async () => {
      repositoryCalled = true;
      return { items: [], totalItems: 0 };
    },
  };

  const service = createAdminKycReadService({
    repository: mockRepo,
    resolveAdminActor: async () => null,
  });

  const req = { adminInfo: { id: "admin1", role: "ADMIN" }, query: {} };
  await assert.rejects(() => service.listKycQueue(req), ReadContractUnauthorizedError);
  assert.equal(repositoryCalled, false);
});

test("admin kyc list returns canonical envelope and document summary", async () => {
  const mockKyc = {
    _id: "507f1f77bcf86cd799439011",
    busOwnerId: "SUV-MARG-BOWNER-ABC-001",
    user: { _id: "507f1f77bcf86cd799439022", name: "Jane Owner", email: "jane@example.com" },
    companyName: "Jane Express",
    verificationStatus: "pending",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  };

  const mockRepo = {
    findPaginatedKycs: async () => ({
      items: [{
        ownerId: String(mockKyc._id),
        ownerCode: mockKyc.busOwnerId,
        userId: String(mockKyc.user._id),
        companyName: mockKyc.companyName,
        verificationStatus: mockKyc.verificationStatus,
        documentSummary: { totalSlots: 3, present: 3, missing: 0, verified: 0, unverified: 3, rejected: 0 },
        createdAt: mockKyc.createdAt.toISOString(),
        updatedAt: mockKyc.updatedAt.toISOString(),
      }],
      totalItems: 1,
    }),
  };

  const service = createAdminKycReadService({
    repository: mockRepo,
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const req = { adminInfo: { id: "admin1", role: "ADMIN" }, query: { page: "1", limit: "10" } };
  const res = await service.listKycQueue(req);

  assert.equal(res.success, true);
  assert.equal(res.data.items.length, 1);
  assert.equal(res.data.items[0].ownerId, "507f1f77bcf86cd799439011");
  assert.equal(res.data.items[0].documentSummary.totalSlots, 3);
});

test("admin kyc detail validates invalid object id format", async () => {
  const service = createAdminKycReadService({
    repository: {},
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const req = { adminInfo: { id: "admin1", role: "ADMIN" }, body: { id: "invalid-id" } };
  await assert.rejects(() => service.getKycDetail(req), ReadContractValidationError);
});
