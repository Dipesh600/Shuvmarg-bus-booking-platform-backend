"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { actor, ids, sessionLog, reviewService } = require("./kyc-transaction-fixtures");

test("concurrent owner transition failure aborts the transaction", async () => {
  const { session, operations } = sessionLog(); const service = reviewService({ session, updateOwner: async () => null });
  await assert.rejects(() => service.reviewKyc({ id: ids.owner, verificationStatus: "approved" }, actor), { code: "KYC_REVIEW_INVALID_TRANSITION" });
  assert.deepEqual(operations, ["start", "abort:KYC_REVIEW_INVALID_TRANSITION", "end"]);
});

test("commit failure is returned and always ends the transaction session", async () => {
  const { session, operations } = sessionLog({ failOnCommit: true }); const service = reviewService({ session });
  await assert.rejects(() => service.reviewKyc({ id: ids.owner, verificationStatus: "approved" }, actor), /commit failure/);
  assert.deepEqual(operations, ["start", "abort:commit failure", "end"]);
});
