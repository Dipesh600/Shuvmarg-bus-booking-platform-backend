"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mongoose, Admin, BusOwner, User, OperatorBrand, createKycReviewService, start, stop, clear, setup } = require("./kyc-approval-integration.fixtures");
test.before(start); test.after(stop); test.beforeEach(clear);

test("user sync failure rolls back brand and owner approval", async () => {
  const { owner, actor, user } = await setup();
  const service = createKycReviewService({ Admin, BusOwner, User: { findById: (id) => User.findById(id), findByIdAndUpdate: async () => { throw new Error("sync failure"); } }, OperatorBrand, mongoose, logger: { info() {}, error() {} } });
  await assert.rejects(() => service.reviewKyc({ id: owner._id.toString(), verificationStatus: "approved" }, actor), { code: "KYC_REVIEW_USER_SYNC_FAILED" });
  assert.equal((await BusOwner.findById(owner._id).lean()).verificationStatus, "pending"); assert.equal(await OperatorBrand.countDocuments({ ownerId: user._id }), 0);
});

test("owner update failure rolls back newly-created brand", async () => {
  const { owner, actor, user } = await setup();
  const service = createKycReviewService({ Admin, BusOwner: { findById: (id) => BusOwner.findById(id), findOne: (query) => BusOwner.findOne(query), findOneAndUpdate: async () => { throw new Error("update failure"); } }, User, OperatorBrand, mongoose, logger: { info() {}, error() {} } });
  await assert.rejects(() => service.reviewKyc({ id: owner._id.toString(), verificationStatus: "approved" }, actor), /update failure/);
  assert.equal((await BusOwner.findById(owner._id).lean()).verificationStatus, "pending"); assert.equal(await OperatorBrand.countDocuments({ ownerId: user._id }), 0);
});
