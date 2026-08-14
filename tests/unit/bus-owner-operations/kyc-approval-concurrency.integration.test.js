"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");

const Admin = require("../../../models/adminModel");
const BusOwner = require("../../../models/busOwnerModel");
const User = require("../../../models/userModel");
const OperatorBrand = require("../../../models/operatorBrandModel");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");
const { KycReviewError } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.errors");

let replSet;

test.before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri(), { autoIndex: true });
  await OperatorBrand.init();
  await BusOwner.init();
  await User.init();
  await Admin.init();
});

test.after(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (replSet) {
    await replSet.stop();
  }
});

test.beforeEach(async () => {
  await Promise.all([
    Admin.deleteMany({}),
    BusOwner.deleteMany({}),
    User.deleteMany({}),
    OperatorBrand.deleteMany({}),
  ]);
});

async function setupTestData({ companyName = "Himalayan Roadways" } = {}) {
  const admin = await Admin.create({
    adminId: "SM-ADM-TESTADMIN",
    name: "Admin User",
    email: `admin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@shuvmarg.com`,
    password: "Password123!",
    role: "SUPER_ADMIN",
    lifecycleStatus: "ACTIVE",
    isActive: true,
  });

  const user = await User.create({
    name: "Owner User",
    phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
    password: "Password123!",
    role: "busOwner",
    roles: ["busOwner"],
    status: "inactive",
    isVerified: false,
  });

  const busOwner = await BusOwner.create({
    user: user._id,
    companyName,
    verificationStatus: "pending",
    companyRegistration: { documentUrls: ["company.pdf"] },
    taxRegistration: { documentUrls: ["tax.pdf"] },
    ownerIdentity: { documentUrls: ["citizenship.pdf"] },
  });

  const actor = {
    adminId: admin._id.toString(),
    tokenRole: "SUPER_ADMIN",
  };

  const service = createKycReviewService({
    Admin,
    BusOwner,
    User,
    OperatorBrand,
    mongoose,
  });

  return { admin, user, busOwner, actor, service };
}

test("concurrency integration: two simultaneous approval attempts result in exactly 1 winner, 1 HTTP 409, and exactly 1 default brand", async () => {
  const { busOwner, actor, service, user } = await setupTestData();

  // Execute two concurrent approval requests simultaneously
  const [resA, resB] = await Promise.allSettled([
    service.reviewKyc({ id: busOwner._id.toString(), verificationStatus: "approved" }, actor),
    service.reviewKyc({ id: busOwner._id.toString(), verificationStatus: "approved" }, actor),
  ]);

  const fulfilled = [resA, resB].filter((r) => r.status === "fulfilled");
  const rejected = [resA, resB].filter((r) => r.status === "rejected");

  assert.equal(fulfilled.length, 1, "Exactly one approval request must succeed");
  assert.equal(rejected.length, 1, "Exactly one approval request must fail");

  const rejectionError = rejected[0].reason;
  assert(rejectionError instanceof KycReviewError);
  assert.equal(rejectionError.code, "KYC_REVIEW_INVALID_TRANSITION");
  assert.equal(rejectionError.statusCode, 409);

  // Verify database state
  const ownerInDb = await BusOwner.findById(busOwner._id).lean();
  assert.equal(ownerInDb.verificationStatus, "approved");

  const userInDb = await User.findById(user._id).lean();
  assert.equal(userInDb.isVerified, true);
  assert.equal(userInDb.status, "active");

  // Verify winner's default brand is retained and NOT deleted by the losing request
  const brands = await OperatorBrand.find({ ownerId: user._id }).lean();
  assert.equal(brands.length, 1, "Exactly one default brand must exist");
  assert.equal(brands[0].isDefault, true);
  assert.equal(brands[0].status, "ACTIVE");
  assert.equal(brands[0].brandName, "Himalayan Roadways");
});

test("concurrency integration: user sync failure inside transaction rolls back owner approval and brand creation", async () => {
  const { busOwner, actor, user } = await setupTestData();

  const brokenUser = {
    findById: (id) => User.findById(id),
    findByIdAndUpdate: async () => {
      throw new Error("Simulated User DB sync network crash");
    },
  };

  const service = createKycReviewService({
    Admin,
    BusOwner,
    User: brokenUser,
    OperatorBrand,
    mongoose,
    logger: { info: () => {}, error: () => {}, warn: () => {} },
  });

  await assert.rejects(
    async () => service.reviewKyc({ id: busOwner._id.toString(), verificationStatus: "approved" }, actor),
    (err) => {
      assert(err instanceof KycReviewError);
      assert.equal(err.code, "KYC_REVIEW_USER_SYNC_FAILED");
      assert.equal(err.statusCode, 500);
      return true;
    }
  );

  // Assert atomic rollback
  const ownerInDb = await BusOwner.findById(busOwner._id).lean();
  assert.equal(ownerInDb.verificationStatus, "pending");

  const userInDb = await User.findById(user._id).lean();
  assert.equal(userInDb.isVerified, false);

  const brandCount = await OperatorBrand.countDocuments({ ownerId: user._id });
  assert.equal(brandCount, 0, "Brand creation must be rolled back by transaction abort");
});

test("concurrency integration: pre-existing default brand is reused idempotently upon approval without duplicates", async () => {
  const { busOwner, actor, user, service } = await setupTestData();

  // Create an existing default brand first
  const existingBrand = await OperatorBrand.create({
    ownerId: user._id,
    brandName: "Himalayan Roadways",
    normalizedName: "himalayan roadways",
    isDefault: true,
    source: "OWNER",
    status: "ACTIVE",
    kycStatus: "APPROVED",
  });

  const result = await service.reviewKyc({ id: busOwner._id.toString(), verificationStatus: "approved" }, actor);

  assert.equal(result.status, "approved");
  assert.equal(result.defaultBrand._id.toString(), existingBrand._id.toString());

  const brands = await OperatorBrand.find({ ownerId: user._id }).lean();
  assert.equal(brands.length, 1);
  assert.equal(brands[0]._id.toString(), existingBrand._id.toString());
});

test("concurrency integration: owner update failure rolls back brand creation and leaves owner in pending state", async () => {
  const { busOwner, actor, user } = await setupTestData();

  const brokenBusOwner = {
    findById: (id) => BusOwner.findById(id),
    findOne: (q) => BusOwner.findOne(q),
    findOneAndUpdate: async () => {
      throw new Error("Simulated BusOwner update database disk crash");
    },
  };

  const service = createKycReviewService({
    Admin,
    BusOwner: brokenBusOwner,
    User,
    OperatorBrand,
    mongoose,
    logger: { info: () => {}, error: () => {}, warn: () => {} },
  });

  await assert.rejects(
    async () => service.reviewKyc({ id: busOwner._id.toString(), verificationStatus: "approved" }, actor),
    /Simulated BusOwner update database disk crash/
  );

  // Assert atomic rollback: owner remains pending and no brand exists in DB
  const ownerInDb = await BusOwner.findById(busOwner._id).lean();
  assert.equal(ownerInDb.verificationStatus, "pending");

  const brandCount = await OperatorBrand.countDocuments({ ownerId: user._id });
  assert.equal(brandCount, 0, "Default brand creation must be aborted when owner update fails");
});
