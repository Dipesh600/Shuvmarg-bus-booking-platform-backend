"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDefaultBrandService, normalizeBrandName } = require("../../../src/modules/bus-owner/kyc-review/kyc-default-brand.service");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");
const { KycReviewError } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.errors");

test("normalizeBrandName trims and collapses whitespace to lowercase", () => {
  assert.equal(normalizeBrandName("  Himalayan   Express  Pvt Ltd  "), "himalayan express pvt ltd");
  assert.equal(normalizeBrandName(""), "");
  assert.equal(normalizeBrandName(null), "");
});

test("ensureDefaultBrand: creates brand with correct fields and flags", async () => {
  const store = [];
  function MockOperatorBrand(doc) {
    Object.assign(this, doc);
    this._id = "brand_123";
    this.brandCode = "OB-KTM001";
    this.save = async () => {
      store.push(this);
      return this;
    };
  }
  MockOperatorBrand.findOne = (query) => ({
    async lean() {
      return store.find((b) => b.ownerId === query.ownerId && b.isDefault === query.isDefault) || null;
    },
  });

  const service = createDefaultBrandService({
    OperatorBrand: MockOperatorBrand,
    clock: () => new Date("2026-08-14T00:00:00Z"),
  });

  const result = await service.ensureDefaultBrand({
    ownerId: "owner_abc",
    companyName: "Himalayan Travels Pvt. Ltd.",
    adminId: "admin_123",
  });

  assert.equal(result.isNew, true);
  assert.equal(result.brand.brandName, "Himalayan Travels Pvt. Ltd.");
  assert.equal(result.brand.normalizedName, "himalayan travels pvt. ltd.");
  assert.equal(result.brand.isDefault, true);
  assert.equal(result.brand.source, "KYC_APPROVAL");
  assert.equal(result.brand.status, "ACTIVE");
  assert.equal(result.brand.kycStatus, "APPROVED");
  assert.equal(result.brand.approvedBy, "admin_123");
  assert.equal(store.length, 1);
});

test("ensureDefaultBrand: idempotent call returns existing default brand without creating duplicate", async () => {
  const store = [
    {
      _id: "brand_existing",
      ownerId: "owner_abc",
      brandName: "Himalayan Travels Pvt. Ltd.",
      normalizedName: "himalayan travels pvt. ltd.",
      isDefault: true,
      status: "ACTIVE",
      brandCode: "OB-KTM001",
    },
  ];

  const MockOperatorBrand = function (doc) {
    Object.assign(this, doc);
    this._id = "brand_new";
    this.save = async () => {
      store.push(this);
      return this;
    };
  };
  MockOperatorBrand.findOne = (query) => ({
    async lean() {
      return store.find((b) => b.ownerId === query.ownerId && b.isDefault === query.isDefault) || null;
    },
  });

  const service = createDefaultBrandService({
    OperatorBrand: MockOperatorBrand,
  });

  const result = await service.ensureDefaultBrand({
    ownerId: "owner_abc",
    companyName: "Himalayan Travels Pvt. Ltd.",
    adminId: "admin_123",
  });

  assert.equal(result.isNew, false);
  assert.equal(result.brand._id, "brand_existing");
  assert.equal(store.length, 1);
});

test("ensureDefaultBrand: recovers from concurrent duplicate key error", async () => {
  let findCount = 0;
  const existingBrand = {
    _id: "brand_concurrent_winner",
    ownerId: "owner_abc",
    brandName: "Himalayan Travels Pvt. Ltd.",
    isDefault: true,
    status: "ACTIVE",
  };

  const MockOperatorBrand = function (doc) {
    Object.assign(this, doc);
    this.save = async () => {
      const err = new Error("E11000 duplicate key error");
      err.code = 11000;
      throw err;
    };
  };
  MockOperatorBrand.findOne = () => ({
    async lean() {
      findCount++;
      return findCount > 1 ? existingBrand : null;
    },
  });

  const service = createDefaultBrandService({
    OperatorBrand: MockOperatorBrand,
  });

  const result = await service.ensureDefaultBrand({
    ownerId: "owner_abc",
    companyName: "Himalayan Travels Pvt. Ltd.",
    adminId: "admin_123",
  });

  assert.equal(result.isNew, false);
  assert.equal(result.brand._id, "brand_concurrent_winner");
});

test("kyc-review: approval fails when companyName is missing", async () => {
  const mockOwner = {
    _id: "507f1f77bcf86cd799439011",
    user: "507f1f77bcf86cd799439012",
    companyName: "",
    verificationStatus: "pending",
    companyRegistration: { documentUrls: ["doc1"] },
    ownerIdentity: { documentUrls: ["doc2"] },
    taxRegistration: { documentUrls: ["doc3"] },
  };

  const mockAdmin = {
    _id: "507f1f77bcf86cd799439013",
    role: "SUPER_ADMIN",
  };

  const service = createKycReviewService({
    Admin: {
      findById: () => ({
        lean: async () => mockAdmin,
        then: (resolve) => resolve(mockAdmin),
      }),
    },
    BusOwner: {
      findOne: async () => mockOwner,
      findById: async () => mockOwner,
    },
    User: {
      findById: () => ({ select: () => ({ async lean() { return { _id: mockOwner.user, role: "busOwner" }; } }) }),
    },
    defaultBrandService: {
      ensureDefaultBrand: async () => assert.fail("Should not reach default brand creation"),
    },
  });

  await assert.rejects(
    async () =>
      service.reviewKyc(
        { id: "507f1f77bcf86cd799439011", verificationStatus: "approved" },
        { adminId: "507f1f77bcf86cd799439013", tokenRole: "SUPER_ADMIN" }
      ),
    (err) => {
      assert(err instanceof KycReviewError);
      assert.equal(err.code, "KYC_REVIEW_MISSING_COMPANY_NAME");
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
});

test("kyc-review: rejection does not provision a default brand", async () => {
  let brandCreated = false;
  const mockOwner = {
    _id: "507f1f77bcf86cd799439011",
    user: "507f1f77bcf86cd799439012",
    companyName: "Himalayan Travels",
    verificationStatus: "pending",
  };

  const mockAdmin = {
    _id: "507f1f77bcf86cd799439013",
    role: "SUPER_ADMIN",
  };

  const service = createKycReviewService({
    Admin: {
      findById: () => ({
        lean: async () => mockAdmin,
        then: (resolve) => resolve(mockAdmin),
      }),
    },
    BusOwner: {
      findOne: async () => mockOwner,
      findOneAndUpdate: async () => ({
        ...mockOwner,
        verificationStatus: "rejected",
        rejectionReason: "Incomplete docs",
        user: mockOwner.user,
      }),
    },
    User: {
      findById: () => ({ select: () => ({ async lean() { return { _id: mockOwner.user, role: "busOwner" }; } }) }),
      findByIdAndUpdate: async () => ({}),
    },
    defaultBrandService: {
      ensureDefaultBrand: async () => {
        brandCreated = true;
      },
    },
  });

  const result = await service.reviewKyc(
    { id: "507f1f77bcf86cd799439011", verificationStatus: "rejected", rejectionReason: "Incomplete documents provided" },
    { adminId: "507f1f77bcf86cd799439013", tokenRole: "SUPER_ADMIN" }
  );

  assert.equal(result.status, "rejected");
  assert.equal(brandCreated, false);
  assert.equal(result.defaultBrand, null);
});

test("kyc-review: default brand creation failure leaves owner unapproved and performs zero owner updates", async () => {
  let updateCalled = false;
  const mockOwner = {
    _id: "507f1f77bcf86cd799439011",
    user: "507f1f77bcf86cd799439012",
    companyName: "Himalayan Travels",
    verificationStatus: "pending",
    companyRegistration: { documentUrls: ["company.pdf"] },
    taxRegistration: { documentUrls: ["tax.pdf"] },
    ownerIdentity: { documentUrls: ["citizenship.pdf"] },
  };

  const mockAdmin = {
    _id: "507f1f77bcf86cd799439013",
    role: "SUPER_ADMIN",
  };

  const service = createKycReviewService({
    Admin: {
      findById: () => ({
        lean: async () => mockAdmin,
        then: (resolve) => resolve(mockAdmin),
      }),
    },
    BusOwner: {
      findOne: async () => mockOwner,
      findOneAndUpdate: async () => {
        updateCalled = true;
        return {
          ...mockOwner,
          verificationStatus: "approved",
        };
      },
    },
    User: {
      findById: () => ({ select: () => ({ async lean() { return { _id: mockOwner.user, role: "busOwner" }; } }) }),
      findByIdAndUpdate: async () => ({}),
    },
    defaultBrandService: {
      ensureDefaultBrand: async () => {
        throw new Error("Simulated database failure during brand creation");
      },
    },
  });

  await assert.rejects(
    async () =>
      service.reviewKyc(
        { id: "507f1f77bcf86cd799439011", verificationStatus: "approved" },
        { adminId: "507f1f77bcf86cd799439013", tokenRole: "SUPER_ADMIN" }
      ),
    (err) => {
      assert(err instanceof KycReviewError);
      assert.equal(err.code, "KYC_REVIEW_DEFAULT_BRAND_FAILED");
      assert.equal(err.statusCode, 500);
      return true;
    }
  );

  // Crucial check: owner approval was never written
  assert.equal(updateCalled, false);
});

