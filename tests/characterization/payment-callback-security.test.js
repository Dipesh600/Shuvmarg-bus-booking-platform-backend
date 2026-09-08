"use strict";
const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const h = require("../helpers/payment-callback-harness");
let data;
before(h.start); after(h.stop); beforeEach(async () => { data = await h.seed(); });
const request = (responseData, extra = {}) => data.request({ transactionUuid: "CALLBACK-TEST", responseData, ...extra });
async function unchanged() {
  assert.equal(await h.fixture.Booking.countDocuments({}), 0);
  assert.equal(await h.fixture.Ledger.countDocuments({ type: "DEBIT" }), 1);
  assert.equal(await h.fixture.Ledger.countDocuments({ type: "DEBIT_REVERSAL" }), 0);
  assert.equal((await h.fixture.ledgerService.computeSpendableBalance(data.userId)).display, 60);
}
test("forged callbacks, invalid numbers and one-paisa mismatches cannot reach booking", async () => {
  const attacks = [h.callback({}, "wrong-key"), "not-json", h.callback({ transaction_uuid: "OTHER" }),
    h.callback({ product_code: "OTHER" }), ...["NaN", "Infinity", "960.001", "960.01", "959.99", "9,60", "9.6e2"].map(total_amount => h.callback({ total_amount }))];
  for (const callback of attacks) {
    assert.equal((await request(callback)).statusCode, 400);
    assert.equal((await h.Attempt.findById(data.attempt._id)).status, "INITIATED");
    await unchanged();
  }
  assert.equal(data.state.providerCalls, 0);
});
test("a signed COMPLETE callback cannot override authoritative provider state", async () => {
  for (const changed of [{ status: "PENDING" }, { total_amount: "960.01" }, { total_amount: "NaN" }, { total_amount: "960.001" }, { transaction_uuid: "OTHER" }, { product_code: "OTHER" }]) {
    data.state.provider = { status: "COMPLETE", transaction_uuid: "CALLBACK-TEST", product_code: "EPAYTEST", total_amount: "960.00", ...changed };
    assert.equal((await request(h.callback())).statusCode, 202);
    await unchanged();
  }
  assert.equal(data.state.bookings, 0);
});
test("foreign users cannot finalize another customer's payment", async () => {
  const result = await data.request({ transactionUuid: "CALLBACK-TEST", responseData: h.callback(), userId: data.userId }, new mongoose.Types.ObjectId());
  assert.equal(result.statusCode, 404); assert.equal(data.state.providerCalls, 0); await unchanged();
});
test("concurrent web/mobile callback replay produces one booking and one debit", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => request(h.callback(), { paymentAmount: 1, smMoneyApplied: 0, gateway: "wallet", scheduleId: "forged" })));
  assert.ok(results.some(result => result.statusCode === 201));
  assert.ok(results.every(result => [201, 409].includes(result.statusCode)));
  assert.equal(data.state.providerCalls, 1); assert.equal(data.state.bookings, 1);
  assert.equal(await h.fixture.Booking.countDocuments({}), 1);
  assert.equal(await h.fixture.Ledger.countDocuments({ type: "DEBIT" }), 1);
  const saved = await h.fixture.Booking.findOne();
  assert.equal(saved.totalAmount, 1000); assert.equal(saved.gatewayAmount, 960); assert.equal(saved.smMoneyUsed, 40);
  const replay = await request(h.callback());
  assert.equal(String(replay.body.data.bookingId), String(saved._id));
  assert.equal(data.state.bookings, 1);
});
test("missing mobile callback data still requires provider verification", async () => {
  data.state.provider.status = "NOT_FOUND";
  assert.equal((await request(undefined)).statusCode, 202); await unchanged();
  data.state.provider.status = "COMPLETE";
  assert.equal((await request(undefined)).statusCode, 201);
  assert.equal(data.state.providerCalls, 2); assert.equal(data.state.bookings, 1);
});
test("merchant or environment changes cannot repurpose an existing payment", async () => {
  await h.Attempt.updateOne({ _id: data.attempt._id }, { $set: { paymentEnvironment: "live" } });
  assert.equal((await request(h.callback())).statusCode, 503);
  await h.Attempt.updateOne({ _id: data.attempt._id }, { $set: { paymentEnvironment: "sandbox", productCode: "OTHER" } });
  assert.equal((await request(h.callback())).statusCode, 503);
  assert.equal(data.state.providerCalls, 0); await unchanged();
});
