"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require(
  "../../src/modules/admin/wallet-management/wallet-adjustment.policy.js"
);

test("manual adjustment validation preserves exact failures", () => {
  assert.equal(policy.validateAdjustment({}), "userId is required");
  assert.equal(policy.validateAdjustment({ userId: "u", type: "x" }),
    "type must be 'credit' or 'debit'");
  assert.equal(policy.validateAdjustment({
    userId: "u", type: "credit", amount: 0,
  }), "amount must be a positive number");
  assert.equal(policy.validateAdjustment({
    userId: "u", type: "credit", amount: 10, purpose: "invalid",
  }), "purpose must be one of: admin_adjustment, bonus, promotional, reversal");
  assert.match(policy.validateAdjustment({
    userId: "u", type: "credit", amount: 10,
    purpose: "bonus", remarks: "short",
  }), /permanent audit record/);
  assert.equal(policy.validateAdjustment({
    userId: "u", type: "debit", amount: "10.5",
    purpose: "reversal", remarks: "a valid audit remark",
  }), null);
});

test("freeze validation preserves exact failures", () => {
  assert.equal(policy.validateStatusChange({}), "userId is required");
  assert.equal(policy.validateStatusChange({
    userId: "u", action: "invalid",
  }), "action must be 'freeze' or 'unfreeze'");
  assert.equal(policy.validateStatusChange({
    userId: "u", action: "freeze", remarks: "short",
  }), "remarks is required (min 10 chars). Explain why this wallet is being " +
    "freezed.");
  assert.equal(policy.validateStatusChange({
    userId: "u", action: "unfreeze", remarks: "valid audit remarks",
  }), null);
});
