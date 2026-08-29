"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { permitsCashSale } = require("../../../../src/shared/identity/agent-assignment-terms");
const repository = require("../../../../src/modules/agent/seat-hold/agent-seat-hold.repository");

test("cash-sale permission is deny-by-default and enforces the inclusive seat cap", () => {
  assert.equal(permitsCashSale(null, 1), false);
  assert.equal(permitsCashSale({ permissions: {} }, 1), false);
  assert.equal(permitsCashSale({ permissions: { canSellCash: false, maxSeatsPerBooking: null } }, 1), false);
  assert.equal(permitsCashSale({ permissions: { canSellCash: true, maxSeatsPerBooking: null } }, 50), true);
  assert.equal(permitsCashSale({ permissions: { canSellCash: true, maxSeatsPerBooking: 2 } }, 2), true);
  assert.equal(permitsCashSale({ permissions: { canSellCash: true, maxSeatsPerBooking: 2 } }, 3), false);
  assert.equal(permitsCashSale({ permissions: { canSellCash: true, maxSeatsPerBooking: 2 } }, 0), false);
});

test("seat-hold assignment query really projects the permissions subdocument", () => {
  const query = repository.findActiveAssignments("agent-id", "operator-id");
  assert.equal(query.projection().permissions, 1);
});
