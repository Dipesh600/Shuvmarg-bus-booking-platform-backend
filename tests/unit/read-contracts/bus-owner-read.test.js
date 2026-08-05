"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createBusOwnerReadService } = require("../../../src/modules/read-contracts/bus-owner/bus-owner-read.service");
const { ReadContractUnauthorizedError, ReadContractNotFoundError } = require("../../../src/modules/read-contracts/common/read-errors");

test("bus owner read service enforces server-derived owner authorization", async () => {
  const service = createBusOwnerReadService({
    UserModel: { findById: () => ({ select: () => ({ lean: async () => null }) }) },
    BusOwnerModel: { findOne: () => ({ lean: async () => null }) },
  });

  const unauthenticatedReq = { userInfo: null, query: { ownerId: "fake-id" } };
  await assert.rejects(() => service.getOwnProfile(unauthenticatedReq), ReadContractUnauthorizedError);
  await assert.rejects(() => service.getOwnKycStatus(unauthenticatedReq), ReadContractUnauthorizedError);
});

test("bus owner getOwnProfile derives userId from auth token and returns BusOwnerProfile DTO", async () => {
  let queriedUserId = null;
  const mockUser = { _id: "user-123", name: "John Owner", email: "john@example.com", phone: "9800000000" };
  const mockOwner = { _id: "owner-456", busOwnerId: "SUV-MARG-BOWNER-ABC-001", companyName: "John Transport", verificationStatus: "approved" };

  const service = createBusOwnerReadService({
    UserModel: {
      findById: (id) => {
        queriedUserId = id;
        return { select: () => ({ lean: async () => mockUser }) };
      },
    },
    BusOwnerModel: {
      findOne: () => ({ lean: async () => mockOwner }),
    },
  });

  const req = { userInfo: { id: "user-123" }, query: { ownerId: "fake-override-id" } };
  const res = await service.getOwnProfile(req);

  assert.equal(res.success, true);
  assert.equal(queriedUserId, "user-123");
  assert.equal(res.data.ownerId, "owner-456");
  assert.equal(res.data.ownerCode, "SUV-MARG-BOWNER-ABC-001");
  assert.equal(res.data.profile.name, "John Owner");
  assert.equal(res.data.business.companyName, "John Transport");
});

test("bus owner getOwnKycStatus returns database-truth descriptors and no fabricated submittedAt", async () => {
  const mockOwner = {
    _id: "owner-456",
    busOwnerId: "SUV-MARG-BOWNER-ABC-001",
    verificationStatus: "pending",
    companyRegistration: { documentUrls: ["http://s3/cert.pdf"], verified: true },
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  };

  const service = createBusOwnerReadService({
    BusOwnerModel: {
      findOne: () => ({ lean: async () => mockOwner }),
    },
  });

  const req = { userInfo: { id: "user-123" } };
  const res = await service.getOwnKycStatus(req);

  assert.equal(res.success, true);
  assert.equal(res.data.submittedAt, undefined);
  assert.equal(res.data.documents.companyRegistration.present, true);
  assert.equal(res.data.documents.companyRegistration.verified, true);
  assert.equal(res.data.documentSummary.totalSlots, 6);
});
