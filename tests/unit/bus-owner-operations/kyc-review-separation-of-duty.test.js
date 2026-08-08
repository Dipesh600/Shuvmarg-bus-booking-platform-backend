"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeEmail,
  normalizePhone,
  assertReviewerIsIndependent,
} = require("../../../src/modules/bus-owner/kyc-review/kyc-review-separation-of-duty.policy");

test("kyc-review-separation-of-duty unit tests", async (t) => {
  await t.test("normalizeEmail handles case sensitivity and whitespace", () => {
    assert.equal(normalizeEmail("  Admin@Example.com "), "admin@example.com");
    assert.equal(normalizeEmail(""), null);
    assert.equal(normalizeEmail(null), null);
  });

  await t.test("normalizePhone handles Nepal format variations", () => {
    assert.equal(normalizePhone("+9779801234567"), "9801234567");
    assert.equal(normalizePhone("9779801234567"), "9801234567");
    assert.equal(normalizePhone("09801234567"), "9801234567");
    assert.equal(normalizePhone("980-123-4567"), "9801234567");
    assert.equal(normalizePhone(null), null);
  });

  await t.test("throws 409 when reviewer._id equals busOwner.user", () => {
    const reviewer = { _id: "507f1f77bcf86cd799439011" };
    const busOwner = { user: "507f1f77bcf86cd799439011" };
    assert.throws(
      () => assertReviewerIsIndependent({ reviewer, busOwner, busOwnerUser: {} }),
      (err) => err.code === "KYC_REVIEW_SELF_APPROVAL_FORBIDDEN" && err.statusCode === 409
    );
  });

  await t.test("throws 409 on normalized email match", () => {
    const reviewer = { email: "Owner@Express.com" };
    const busOwnerUser = { email: "owner@express.com " };
    assert.throws(
      () => assertReviewerIsIndependent({ reviewer, busOwner: {}, busOwnerUser }),
      (err) => err.code === "KYC_REVIEW_SELF_APPROVAL_FORBIDDEN" && err.statusCode === 409
    );
  });

  await t.test("throws 409 on normalized phone match", () => {
    const reviewer = { phoneNumber: "+9779801234567" };
    const busOwnerUser = { phone: "09801234567" };
    assert.throws(
      () => assertReviewerIsIndependent({ reviewer, busOwner: {}, busOwnerUser }),
      (err) => err.code === "KYC_REVIEW_SELF_APPROVAL_FORBIDDEN" && err.statusCode === 409
    );
  });

  await t.test("passes when identities are different", () => {
    const reviewer = { _id: "admin-1", email: "admin@shuvmarg.com", phoneNumber: "9800000000" };
    const busOwner = { user: "owner-1" };
    const busOwnerUser = { email: "owner@express.com", phone: "9811111111" };
    assert.doesNotThrow(() => assertReviewerIsIndependent({ reviewer, busOwner, busOwnerUser }));
  });

  await t.test("passes when emails or phones are missing on both sides without false match", () => {
    const reviewer = { _id: "admin-1", email: null, phoneNumber: null };
    const busOwner = { user: "owner-1" };
    const busOwnerUser = { email: null, phone: null };
    assert.doesNotThrow(() => assertReviewerIsIndependent({ reviewer, busOwner, busOwnerUser }));
  });
});
