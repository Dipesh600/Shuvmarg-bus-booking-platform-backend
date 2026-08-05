"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createAdminBusOwnerReadService } = require("../../../src/modules/read-contracts/admin-bus-owner/admin-bus-owner-read.service");
const { createAdminKycReadService } = require("../../../src/modules/read-contracts/admin-kyc/admin-kyc-read.service");
const { createFleetReadService } = require("../../../src/modules/read-contracts/fleet/fleet-read.service");
const { createBusOwnerReadService } = require("../../../src/modules/read-contracts/bus-owner/bus-owner-read.service");

function mockRes() {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.body = body;
    return res;
  };
  return res;
}

test("endpoint contract test for admin bus owner list and detail", async () => {
  const mockRepo = {
    findPaginatedOwners: async () => ({ items: [{ ownerId: "owner-1", name: "Owner Name" }], totalItems: 1 }),
    findOwnerDetailById: async () => ({ ownerId: "owner-1", profile: { name: "Owner Name" } }),
  };
  const service = createAdminBusOwnerReadService({
    repository: mockRepo,
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const listReq = { adminInfo: { id: "admin-1", role: "ADMIN" }, query: { page: 1, limit: 10 } };
  const listRes = await service.listBusOwners(listReq);
  assert.equal(listRes.success, true);
  assert.equal(listRes.data.items[0].ownerId, "owner-1");

  const detailReq = { adminInfo: { id: "admin-1", role: "ADMIN" }, body: { id: "507f1f77bcf86cd799439011" } };
  const detailRes = await service.getBusOwnerDetail(detailReq);
  assert.equal(detailRes.success, true);
  assert.equal(detailRes.data.ownerId, "owner-1");
});

test("endpoint contract test for admin kyc queue and detail", async () => {
  const mockRepo = {
    findPaginatedKycs: async () => ({ items: [{ ownerId: "owner-1", verificationStatus: "pending" }], totalItems: 1 }),
    findKycDetailById: async () => ({ ownerId: "owner-1", verificationStatus: "pending" }),
  };
  const service = createAdminKycReadService({
    repository: mockRepo,
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const queueReq = { adminInfo: { id: "admin-1", role: "ADMIN" }, query: {} };
  const queueRes = await service.listKycQueue(queueReq);
  assert.equal(queueRes.success, true);

  const detailReq = { adminInfo: { id: "admin-1", role: "ADMIN" }, body: { id: "507f1f77bcf86cd799439011" } };
  const detailRes = await service.getKycDetail(detailReq);
  assert.equal(detailRes.success, true);
});

test("endpoint contract test for bus owner profile and kyc status", async () => {
  const mockUser = { _id: "user-1", name: "John Owner", email: "john@example.com" };
  const mockOwner = { _id: "owner-1", busOwnerId: "SUV-MARG-BOWNER-001", verificationStatus: "approved" };

  const service = createBusOwnerReadService({
    UserModel: { findById: () => ({ select: () => ({ lean: async () => mockUser }) }) },
    BusOwnerModel: { findOne: () => ({ lean: async () => mockOwner }) },
  });

  const profileReq = { userInfo: { id: "user-1" } };
  const profileRes = await service.getOwnProfile(profileReq);
  assert.equal(profileRes.success, true);
  assert.equal(profileRes.data.ownerId, "owner-1");

  const kycRes = await service.getOwnKycStatus(profileReq);
  assert.equal(kycRes.success, true);
  assert.equal(kycRes.data.verificationStatus, "approved");
});

test("endpoint contract test for fleet read service admin and owner routes", async () => {
  const mockRepo = {
    findAdminPaginatedFleets: async () => ({ items: [{ fleetId: "507f1f77bcf86cd799439011", fleetCode: "SUV-MARG-FLEET-001" }], totalItems: 1 }),
    findAdminFleetDetailById: async () => ({ fleetId: "507f1f77bcf86cd799439011", fleetCode: "SUV-MARG-FLEET-001" }),
    findOwnerPaginatedFleets: async () => ({ items: [{ fleetId: "507f1f77bcf86cd799439011" }], totalItems: 1 }),
    findOwnerFleetDetailById: async () => ({ fleetId: "507f1f77bcf86cd799439011" }),
  };

  const service = createFleetReadService({
    repository: mockRepo,
    resolveAdminActor: async () => ({ status: "active", isLocked: false }),
  });

  const adminListRes = await service.listFleetsForAdmin({ adminInfo: { id: "admin-1", role: "ADMIN" }, query: {} });
  assert.equal(adminListRes.success, true);

  const ownerListRes = await service.listFleetsForOwner({ userInfo: { id: "user-1" }, query: {} });
  assert.equal(ownerListRes.success, true);
});
