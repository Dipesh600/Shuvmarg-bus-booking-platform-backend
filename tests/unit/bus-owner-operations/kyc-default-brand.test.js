"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createKycReviewService } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.service");

const ids = { owner: "507f1f77bcf86cd799439011", user: "507f1f77bcf86cd799439012", admin: "507f1f77bcf86cd799439013" };
const actor = { adminId: ids.admin, tokenRole: "SUPER_ADMIN" };
function owner(overrides = {}) { return { _id: ids.owner, user: ids.user, companyName: "Himalayan Travels", verificationStatus: "pending", companyRegistration: { documentUrls: ["company.pdf"] }, taxRegistration: { documentUrls: ["tax.pdf"] }, ownerIdentity: { documentUrls: ["citizenship.pdf"] }, ...overrides }; }
function serviceFor(mockOwner, defaultBrandService, target = "approved") {
  return createKycReviewService({
    Admin: { findById: () => ({ lean: async () => ({ _id: ids.admin, role: "SUPER_ADMIN" }) }) },
    BusOwner: { findOne: async () => mockOwner, findOneAndUpdate: async () => ({ ...mockOwner, verificationStatus: target }) },
    User: { findById: () => ({ lean: async () => ({ _id: ids.user, role: "busOwner" }) }), findByIdAndUpdate: async () => ({ _id: ids.user }) },
    defaultBrandService,
  });
}

test("approval requires a company name before any default brand work", async () => {
  const review = serviceFor(owner({ companyName: "" }), { ensureDefaultBrand: async () => assert.fail("must not create") });
  await assert.rejects(() => review.reviewKyc({ id: ids.owner, verificationStatus: "approved" }, actor), { code: "KYC_REVIEW_MISSING_COMPANY_NAME" });
});

test("rejection does not provision a default brand", async () => {
  let called = false; const review = serviceFor(owner(), { ensureDefaultBrand: async () => { called = true; } }, "rejected");
  const result = await review.reviewKyc({ id: ids.owner, verificationStatus: "rejected", rejectionReason: "Incomplete documents" }, actor);
  assert.equal(result.status, "rejected"); assert.equal(called, false); assert.equal(result.defaultBrand, null);
});

test("brand failure prevents the owner approval write", async () => {
  let updated = false; const mockOwner = owner();
  const review = createKycReviewService({ Admin: { findById: () => ({ lean: async () => ({ _id: ids.admin, role: "SUPER_ADMIN" }) }) }, BusOwner: { findOne: async () => mockOwner, findOneAndUpdate: async () => { updated = true; } }, User: { findById: () => ({ lean: async () => ({ _id: ids.user }) }) }, defaultBrandService: { ensureDefaultBrand: async () => { throw new Error("database failure"); } }, logger: { error() {}, info() {} } });
  await assert.rejects(() => review.reviewKyc({ id: ids.owner, verificationStatus: "approved" }, actor), { code: "KYC_REVIEW_DEFAULT_BRAND_FAILED" });
  assert.equal(updated, false);
});
