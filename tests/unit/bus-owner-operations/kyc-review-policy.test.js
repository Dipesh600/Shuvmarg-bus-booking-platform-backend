"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertKycReviewTransition, KYC_REVIEW_STATUS } = require("../../../src/modules/bus-owner/kyc-review/kyc-review.policy");

test("kyc-review-policy unit tests", async (t) => {
  await t.test("allows pending -> approved and pending -> rejected transitions", () => {
    assert.doesNotThrow(() =>
      assertKycReviewTransition({ currentStatus: KYC_REVIEW_STATUS.PENDING, targetStatus: KYC_REVIEW_STATUS.APPROVED })
    );
    assert.doesNotThrow(() =>
      assertKycReviewTransition({ currentStatus: KYC_REVIEW_STATUS.PENDING, targetStatus: KYC_REVIEW_STATUS.REJECTED })
    );
  });

  await t.test("rejects invalid target status with HTTP 400", () => {
    assert.throws(
      () => assertKycReviewTransition({ currentStatus: KYC_REVIEW_STATUS.PENDING, targetStatus: "draft" }),
      (err) => err.code === "KYC_REVIEW_INVALID_TARGET" && err.statusCode === 400
    );
  });

  await t.test("rejects approved -> approved, approved -> rejected, rejected -> approved, rejected -> rejected with HTTP 409", () => {
    const invalidTransitions = [
      { currentStatus: "approved", targetStatus: "approved" },
      { currentStatus: "approved", targetStatus: "rejected" },
      { currentStatus: "rejected", targetStatus: "approved" },
      { currentStatus: "rejected", targetStatus: "rejected" },
      { currentStatus: "draft", targetStatus: "approved" },
    ];

    for (const transition of invalidTransitions) {
      assert.throws(
        () => assertKycReviewTransition(transition),
        (err) => err.code === "KYC_REVIEW_INVALID_TRANSITION" && err.statusCode === 409
      );
    }
  });
});
