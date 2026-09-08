'use strict';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/payment-callback-harness');
const Authorization = require('../../models/paymentAuthorizationModel');
const { Counter } = require('../../src/shared/http/mongo-rate-limit-store');
const service = require('../../src/modules/wallet/payment-authorization/purchase-authorization.service');
let data, input, code, oldSecret;
before(async () => { oldSecret = process.env.SECRET_KEY; process.env.SECRET_KEY = 'payment-test-secret'; await h.start(); await Authorization.init(); });
after(async () => { await h.stop(); if (oldSecret === undefined) delete process.env.SECRET_KEY; else process.env.SECRET_KEY = oldSecret; });
beforeEach(async () => {
  data = await h.seed(); await Authorization.deleteMany({}); await Counter.deleteMany({ namespace: 'purchase-authorization-send' });
  input = { user: { _id: data.userId, phone: '9800000000', status: 'active', tokenVersion: 1 },
    hold: data.hold, body: { gateway: 'esewa', smMoneyToUse: 40 },
    quote: { finalAmount: 1000, smMoneyApplied: 40, gatewayAmount: 960 },
    send: async (_phone, message) => { code = message.match(/: (\d{6})\./)[1]; } };
});
async function approved() {
  const response = await service.requestAuthorization(input);
  assert.equal(JSON.stringify(response).includes(code), false);
  await service.approveAuthorization({ user: input.user, authorizationId: response.authorizationId, code });
  input.body.paymentAuthorizationId = response.authorizationId;
  return response.authorizationId;
}
test('approval authorizes only the original purchase and contains no reusable PIN', async () => {
  await approved();
  assert.equal((await service.verifyPurchaseAuthorization(input)).ok, true);
  assert.equal((await service.verifyPurchaseAuthorization(input)).ok, true);
  for (const changed of [
    { body: { ...input.body, gateway: 'wallet' } },
    { body: { ...input.body, passengerDetails: [{ name: 'changed' }] } },
    { quote: { ...input.quote, smMoneyApplied: 41 } },
    { hold: { ...data.hold.toObject(), tempBookingId: 'OTHER' } },
    { user: { ...input.user, tokenVersion: 2 } },
    { user: { ...input.user, phone: '9811111111' } },
  ]) await assert.rejects(service.verifyPurchaseAuthorization({ ...input, ...changed }));
});
test('wrong and expired codes cannot approve a purchase', async () => {
  const row = await service.requestAuthorization(input);
  const wrong = code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) await assert.rejects(service.approveAuthorization({ user: input.user, authorizationId: row.authorizationId, code: wrong }));
  await assert.rejects(service.approveAuthorization({ user: input.user, authorizationId: row.authorizationId, code }));
  assert.equal((await Authorization.findById(row.authorizationId)).approvedAt, null);
});
test('concurrent OTP replay approves once and send quotas cannot be bypassed by parallel requests', async () => {
  const row = await service.requestAuthorization(input);
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => service.approveAuthorization({ user: input.user, authorizationId: row.authorizationId, code })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const sends = await Promise.allSettled(Array.from({ length: 10 }, () => service.requestAuthorization(input)));
  assert.equal(sends.filter(r => r.status === 'fulfilled').length, 2);
});
test('delivery failure leaves no usable challenge; expired approval cannot spend', async () => {
  await assert.rejects(service.requestAuthorization({ ...input, send: async () => { throw new Error('SMS outage'); } }), { statusCode: 503 });
  assert.equal(await Authorization.countDocuments({}), 0);
  const id = await approved();
  await Authorization.updateOne({ _id: id }, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(service.verifyPurchaseAuthorization(input));
});

test('actual payment stage requires the approved purchase before any hold claim or debit', async () => {
  const { createPassengerBookingConfirmationPaymentStage } = require('../../src/modules/booking/passenger-booking-confirmation-orchestrator/passenger-booking-confirmation-payment-stage.service');
  let claims = 0, debits = 0;
  const stage = createPassengerBookingConfirmationPaymentStage({
    validatePassengerBookingConfirmationRequest: () => ({ ok: true }),
    buildPassengerBookingConfirmationQuote: async () => ({ ok: true, quote: input.quote }),
    claimPassengerHoldForConfirmation: async () => { claims++; return true; },
    debitPassengerSplitPayment: async () => { debits++; return { ok: true, debitEntryId: 'reserved' }; },
    verifyPassengerEsewaPayment: async () => ({ ok: true }),
    createPassengerBookingPaymentTransaction: async () => ({ transaction: {}, gatewayFeeRate: 0 }),
  });
  const req = { body: input.body, dbUser: input.user, bookingHold: input.hold, userInfo: { activeRole: 'passenger' } };
  assert.equal((await stage({ req, state: {} })).body.errorCode, 'PAYMENT_AUTHORIZATION_REQUIRED');
  assert.equal(claims, 0); assert.equal(debits, 0);
  await approved();
  assert.equal(await stage({ req, state: {} }), null);
  assert.equal(claims, 1); assert.equal(debits, 1);
});
