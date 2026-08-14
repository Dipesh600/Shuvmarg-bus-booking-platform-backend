"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { BusOwner, User, OperatorBrand, start, stop, clear, setup } = require("./kyc-approval-integration.fixtures");
test.before(start); test.after(stop); test.beforeEach(clear);

test("simultaneous approvals leave one approved owner and one default brand", async () => {
  const { owner, actor, service, user } = await setup();
  const results = await Promise.allSettled([service.reviewKyc({ id: owner._id.toString(), verificationStatus: "approved" }, actor), service.reviewKyc({ id: owner._id.toString(), verificationStatus: "approved" }, actor)]);
  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(results.filter((item) => item.status === "rejected")[0].reason.code, "KYC_REVIEW_INVALID_TRANSITION");
  assert.equal((await BusOwner.findById(owner._id).lean()).verificationStatus, "approved");
  assert.equal((await User.findById(user._id).lean()).isVerified, true);
  assert.equal((await OperatorBrand.find({ ownerId: user._id }).lean()).length, 1);
});

test("existing default brand is reused during approval", async () => {
  const { owner, actor, user, service } = await setup();
  const brand = await OperatorBrand.create({ ownerId: user._id, brandName: "Himalayan Roadways", normalizedName: "himalayan roadways", isDefault: true, source: "OWNER", status: "ACTIVE", kycStatus: "APPROVED" });
  const result = await service.reviewKyc({ id: owner._id.toString(), verificationStatus: "approved" }, actor);
  assert.equal(result.defaultBrand._id.toString(), brand._id.toString()); assert.equal(await OperatorBrand.countDocuments({ ownerId: user._id }), 1);
});
