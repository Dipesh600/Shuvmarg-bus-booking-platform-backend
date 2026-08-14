"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { actor, ids, sessionLog, reviewService } = require("./kyc-transaction-fixtures");

test("KYC approval propagates one session through brand, owner, and user writes", async () => {
  const { session, operations } = sessionLog(); let seen = [];
  const service = reviewService({ session, ensureBrand: async ({ session: value }) => { seen.push(value); return { brand: { _id: "brand" } }; }, updateOwner: async (_, __, options) => { seen.push(options.session); return { _id: ids.owner, user: ids.user, verificationStatus: "approved" }; }, updateUser: async (_, __, options) => { seen.push(options.session); return { _id: ids.user }; } });
  await service.reviewKyc({ id: ids.owner, verificationStatus: "approved" }, actor);
  assert.deepEqual(seen, [session, session, session]); assert.deepEqual(operations, ["start", "commit", "end"]);
});

test("user sync failure aborts the KYC transaction", async () => {
  const { session, operations } = sessionLog(); const service = reviewService({ session, updateUser: async () => { throw new Error("connection lost"); } });
  await assert.rejects(() => service.reviewKyc({ id: ids.owner, verificationStatus: "approved" }, actor), { code: "KYC_REVIEW_USER_SYNC_FAILED" });
  assert.deepEqual(operations, ["start", "abort:KYC_REVIEW_USER_SYNC_FAILED", "end"]);
});
