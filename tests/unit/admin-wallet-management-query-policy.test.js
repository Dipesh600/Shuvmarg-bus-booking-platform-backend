"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const userQuery = require(
  "../../src/modules/admin/wallet-management/wallet-user-query.service.js"
);
const ledger = require(
  "../../src/modules/admin/wallet-management/global-ledger-feed.service.js"
);

test("wallet lookup selects ObjectId, phone, or name strategy", () => {
  assert.deepEqual(
    userQuery.userFilter("507f1f77bcf86cd799439011"),
    { _id: "507f1f77bcf86cd799439011" }
  );
  assert.deepEqual(userQuery.userFilter("+977 (980) 000-0000"), {
    phone: { $regex: "9779800000000", $options: "i" },
  });
  assert.deepEqual(userQuery.userFilter("Dipesh"), {
    name: { $regex: "Dipesh", $options: "i" },
  });
});

test("global ledger filters preserve every public category", () => {
  assert.deepEqual(ledger.ledgerFilter("all"), {});
  assert.deepEqual(ledger.ledgerFilter("cashback"), {
    type: { $in: ["CASHBACK", "CASHBACK_CLAWBACK"] },
  });
  assert.deepEqual(ledger.ledgerFilter("referral"), {
    type: { $in: ["REFERRAL_LOCKED", "REFERRAL_UNLOCK"] },
  });
  assert.deepEqual(ledger.ledgerFilter("spent"), {
    type: { $in: ["DEBIT", "DEBIT_REVERSAL"] },
  });
  assert.deepEqual(ledger.ledgerFilter("admin"), {
    type: { $in: ["ADMIN_CREDIT", "ADMIN_DEBIT"] },
  });
  assert.deepEqual(ledger.ledgerFilter("refunds"), { type: "REFUND" });
  assert.deepEqual(ledger.ledgerFilter("unknown"), {});
});
