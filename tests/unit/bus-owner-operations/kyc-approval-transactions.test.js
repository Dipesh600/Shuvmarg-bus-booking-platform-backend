"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");
const { KycReviewError } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.errors");

function makeMockSession({ failOnCommit = false, failOnStart = false } = {}) {
  const operations = [];
  return {
    operations,
    session: {
      withTransaction: async (fn) => {
        if (failOnStart) throw new Error("Transaction start failed");
        operations.push("withTransaction:start");
        try {
          await fn();
          if (failOnCommit) {
            operations.push("withTransaction:abort_commit_error");
            throw new Error("Simulated transaction commit failure");
          }
          operations.push("withTransaction:commit");
        } catch (err) {
          operations.push(`withTransaction:abort:${err.code || err.message}`);
          throw err;
        }
      },
      endSession: async () => {
        operations.push("session:end");
      },
    },
  };
}

const mockAdmin = {
  _id: "507f1f77bcf86cd799439010",
  role: "SUPER_ADMIN",
};

const validActor = {
  adminId: "507f1f77bcf86cd799439010",
  tokenRole: "SUPER_ADMIN",
};

function createPendingOwner(overrides = {}) {
  return {
    _id: "507f1f77bcf86cd799439011",
    user: "507f1f77bcf86cd799439012",
    companyName: "Himalayan Roadways",
    verificationStatus: "pending",
    companyRegistration: { documentUrls: ["cr.pdf"] },
    taxRegistration: { documentUrls: ["tax.pdf"] },
    ownerIdentity: { documentUrls: ["id.pdf"] },
    ...overrides,
  };
}

test("kyc-review transaction: passes session to defaultBrand, BusOwner, and User updates", async () => {
  const { session, operations } = makeMockSession();
  const mockOwner = createPendingOwner();
  let brandSessionPassed = null;
  let ownerSessionPassed = null;
  let userSessionPassed = null;

  const mockAdminModel = {
    findById: () => ({ lean: async () => mockAdmin, then: (resolve) => resolve(mockAdmin) }),
  };
  const mockBusOwnerModel = {
    findOne: async () => mockOwner,
    findOneAndUpdate: async (filter, update, opts) => {
      ownerSessionPassed = opts?.session;
      return { ...mockOwner, verificationStatus: "approved" };
    },
  };
  const mockUserModel = {
    findById: () => ({ lean: async () => ({ _id: mockOwner.user, role: "busOwner" }) }),
    findByIdAndUpdate: async (id, update, opts) => {
      userSessionPassed = opts?.session;
      return { _id: id, status: "active", isVerified: true };
    },
  };
  const mockBrandService = {
    ensureDefaultBrand: async ({ session: s }) => {
      brandSessionPassed = s;
      return { brand: { _id: "brand_abc", isDefault: true }, isNew: true };
    },
  };

  const service = createKycReviewService({
    Admin: mockAdminModel,
    BusOwner: mockBusOwnerModel,
    User: mockUserModel,
    defaultBrandService: mockBrandService,
    mongoose: { startSession: async () => session },
  });

  const result = await service.reviewKyc({ id: mockOwner._id, verificationStatus: "approved" }, validActor);

  assert.equal(result.status, "approved");
  assert.equal(brandSessionPassed, session);
  assert.equal(ownerSessionPassed, session);
  assert.equal(userSessionPassed, session);
  assert.deepEqual(operations, [
    "withTransaction:start",
    "withTransaction:commit",
    "session:end",
  ]);
});

test("kyc-review transaction: user update failure aborts transaction and leaves no uncommitted writes", async () => {
  const { session, operations } = makeMockSession();
  const mockOwner = createPendingOwner();

  const mockAdminModel = {
    findById: () => ({ lean: async () => mockAdmin, then: (resolve) => resolve(mockAdmin) }),
  };
  const mockBusOwnerModel = {
    findOne: async () => mockOwner,
    findOneAndUpdate: async () => ({ ...mockOwner, verificationStatus: "approved" }),
  };
  const mockUserModel = {
    findById: () => ({ lean: async () => ({ _id: mockOwner.user, role: "busOwner" }) }),
    findByIdAndUpdate: async () => {
      throw new Error("DB connection dropped during user sync");
    },
  };
  const mockBrandService = {
    ensureDefaultBrand: async () => ({ brand: { _id: "brand_abc", isDefault: true }, isNew: true }),
  };

  const service = createKycReviewService({
    Admin: mockAdminModel,
    BusOwner: mockBusOwnerModel,
    User: mockUserModel,
    defaultBrandService: mockBrandService,
    mongoose: { startSession: async () => session },
    logger: { info: () => {}, error: () => {}, warn: () => {} },
  });

  await assert.rejects(
    async () => service.reviewKyc({ id: mockOwner._id, verificationStatus: "approved" }, validActor),
    (err) => {
      assert(err instanceof KycReviewError);
      assert.equal(err.code, "KYC_REVIEW_USER_SYNC_FAILED");
      assert.equal(err.statusCode, 500);
      return true;
    }
  );

  assert.deepEqual(operations, [
    "withTransaction:start",
    "withTransaction:abort:KYC_REVIEW_USER_SYNC_FAILED",
    "session:end",
  ]);
});

test("kyc-review transaction: owner atomic transition failure (concurrent race) aborts transaction", async () => {
  const { session, operations } = makeMockSession();
  const mockOwner = createPendingOwner();

  const mockAdminModel = {
    findById: () => ({ lean: async () => mockAdmin, then: (resolve) => resolve(mockAdmin) }),
  };
  const mockBusOwnerModel = {
    findOne: async () => mockOwner,
    findOneAndUpdate: async () => null, // Concurrent request already transitioned the owner
  };
  const mockUserModel = {
    findById: () => ({ lean: async () => ({ _id: mockOwner.user, role: "busOwner" }) }),
    findByIdAndUpdate: async () => ({ _id: mockOwner.user }),
  };
  const mockBrandService = {
    ensureDefaultBrand: async () => ({ brand: { _id: "brand_abc", isDefault: true }, isNew: true }),
  };

  const service = createKycReviewService({
    Admin: mockAdminModel,
    BusOwner: mockBusOwnerModel,
    User: mockUserModel,
    defaultBrandService: mockBrandService,
    mongoose: { startSession: async () => session },
  });

  await assert.rejects(
    async () => service.reviewKyc({ id: mockOwner._id, verificationStatus: "approved" }, validActor),
    (err) => {
      assert(err instanceof KycReviewError);
      assert.equal(err.code, "KYC_REVIEW_INVALID_TRANSITION");
      assert.equal(err.statusCode, 409);
      return true;
    }
  );

  assert.deepEqual(operations, [
    "withTransaction:start",
    "withTransaction:abort:KYC_REVIEW_INVALID_TRANSITION",
    "session:end",
  ]);
});

test("kyc-review transaction: transaction commit failure propagates error cleanly and ends session", async () => {
  const { session, operations } = makeMockSession({ failOnCommit: true });
  const mockOwner = createPendingOwner();

  const mockAdminModel = {
    findById: () => ({ lean: async () => mockAdmin, then: (resolve) => resolve(mockAdmin) }),
  };
  const mockBusOwnerModel = {
    findOne: async () => mockOwner,
    findOneAndUpdate: async () => ({ ...mockOwner, verificationStatus: "approved" }),
  };
  const mockUserModel = {
    findById: () => ({ lean: async () => ({ _id: mockOwner.user, role: "busOwner" }) }),
    findByIdAndUpdate: async () => ({ _id: mockOwner.user }),
  };
  const mockBrandService = {
    ensureDefaultBrand: async () => ({ brand: { _id: "brand_abc", isDefault: true }, isNew: true }),
  };

  const service = createKycReviewService({
    Admin: mockAdminModel,
    BusOwner: mockBusOwnerModel,
    User: mockUserModel,
    defaultBrandService: mockBrandService,
    mongoose: { startSession: async () => session },
  });

  await assert.rejects(
    async () => service.reviewKyc({ id: mockOwner._id, verificationStatus: "approved" }, validActor),
    /Simulated transaction commit failure/
  );

  assert.deepEqual(operations, [
    "withTransaction:start",
    "withTransaction:abort_commit_error",
    "withTransaction:abort:Simulated transaction commit failure",
    "session:end",
  ]);
});

