"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { refundExpiryFilter, migrateRefundCreditExpiry } = require("../../scripts/migrateRefundCreditExpiry");

test("refund expiry migration is dry-run by default and narrowly scoped", async () => {
  let updateCalled = false;
  const model = {
    countDocuments: async filter => {
      assert.deepEqual(filter, { type: "REFUND", direction: "CREDIT", expires_at: { $ne: null } });
      return 4;
    },
    updateMany: async () => { updateCalled = true; },
  };
  assert.deepEqual(refundExpiryFilter(), {
    type: "REFUND", direction: "CREDIT", expires_at: { $ne: null },
  });
  assert.deepEqual(await migrateRefundCreditExpiry(model), {
    mode: "DRY_RUN", candidates: 4, modified: 0,
  });
  assert.equal(updateCalled, false);
});

test("explicit apply removes expiry from refund credits once", async () => {
  let update;
  const model = {
    countDocuments: async () => 2,
    updateMany: async (...args) => ((update = args), { matchedCount: 2, modifiedCount: 2 }),
  };
  assert.deepEqual(await migrateRefundCreditExpiry(model, { apply: true }), {
    mode: "APPLIED", candidates: 2, matched: 2, modified: 2,
  });
  assert.deepEqual(update, [refundExpiryFilter(), { $set: { expires_at: null } }]);
});
