"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const RefundPolicy = require("../../models/refundPolicyModel");
const { calculateRefund } = require("../../services/refundCalculatorService");
const { toMinorUnits } = require("../../src/shared/money");
const { verifyEsewaPayment } = require("../../services/esewaVerificationService");
const axios = require("axios");

test("saved refund rules survive later policy changes and preserve paisa and split totals", async t => {
  t.mock.method(RefundPolicy, "find", () => { throw new Error("Current policy must not replace saved policy"); });
  const result = await calculateRefund({ totalAmount: 100.05, smMoneyUsed: 33.35, gatewayAmount: 66.70,
    tripDate: new Date("2099-01-01"), departureTime: "10:00", policySnapshot: { version: 1, rules: [
      { _id: "saved-rule", policyName: "Saved policy", minHours: 0, maxHours: null, refundPercentage: 20 },
    ] } });
  assert.equal(result.refundAmount, 20.01);
  assert.equal(result.cancellationCharge, 80.04);
  assert.equal(result.smRefundAmount, 6.67);
  assert.equal(result.gatewayRefundAmount, 13.34);
  assert.equal(result.appliedPolicy.id, "saved-rule");
});

test("invalid amounts cannot enter financial arithmetic", () => {
  for (const value of [NaN, Infinity, -1, "10bad", "1e2", "", null, {}, 1.001]) {
    assert.throws(() => toMinorUnits(value));
  }
  assert.equal(toMinorUnits(0.1 + 0.2), 30);
});

test("provider success requires every identity field and an exact paisa amount", async t => {
  const original = process.env.ESEWA_PRODUCT_CODE;
  process.env.ESEWA_PRODUCT_CODE = "EPAYTEST";
  t.after(() => { if (original === undefined) delete process.env.ESEWA_PRODUCT_CODE; else process.env.ESEWA_PRODUCT_CODE = original; });
  const valid = { status: "COMPLETE", transaction_uuid: "payment-one", product_code: "EPAYTEST", total_amount: 100 };
  let response;
  t.mock.method(axios, "get", async () => ({ data: response }));
  for (const changed of [{ transaction_uuid: undefined }, { product_code: undefined }, { total_amount: 99.99 }, { total_amount: 100.01 }]) {
    response = { ...valid, ...changed };
    assert.equal((await verifyEsewaPayment("payment-one", 100)).verified, false);
  }
  response = valid;
  assert.equal((await verifyEsewaPayment("payment-one", 100)).verified, true);
});

test('refund boundaries use the server UTC timetable regardless of process timezone', async () => {
  const { buildDepartureDate } = require('../../services/refundCalculatorService');
  assert.equal(buildDepartureDate('2099-01-01', '00:15').toISOString(), '2099-01-01T00:15:00.000Z');
  for (const time of ['25:00', '12:60', '', undefined, '10pm']) assert.throws(() => buildDepartureDate('2099-01-01', time), /Invalid departure/);
  const input = { totalAmount: 100, paymentMethod: 'ESEWA', tripDate: '2099-01-01', departureTime: '12:00',
    policySnapshot: { version: 1, rules: [
      { _id: "near", minHours: 0, maxHours: 12, refundPercentage: 50 },
      { _id: "early", minHours: 12, maxHours: null, refundPercentage: 100 },
    ] } };
  assert.equal((await calculateRefund({ ...input, currentTime: new Date('2099-01-01T00:00:00Z') })).refundAmount, 100);
  assert.equal((await calculateRefund({ ...input, currentTime: new Date('2099-01-01T00:00:00.001Z') })).refundAmount, 50);
});
