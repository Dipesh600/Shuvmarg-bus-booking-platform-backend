'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.policy'
);
const signature = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout.signature'
);
const {
  createPassengerEsewaCheckoutInitiationService,
} = require(
  '../../../src/modules/booking/passenger-esewa-checkout/passenger-esewa-checkout-initiation.service'
);

test('initiation signs and persists the server quote, never browser price', async () => {
  let saved;
  const service = createPassengerEsewaCheckoutInitiationService({
    readConfig: () => ({
      productCode: 'EPAYTEST',
      secretKey: 'secret',
      passengerUrl: 'https://passenger.example',
      paymentUrl: 'https://esewa.example/form',
    }),
    buildQuote: async (input) => {
      assert.equal(input.originalAmount, 1200);
      assert.equal(input.paymentAmount, 1200);
      return {
        ok: true,
        quote: {
          requestedSmMoney: 0,
          gatewayAmount: 1100,
          finalAmount: 1100,
          discountAmount: 100,
          smMoneyApplied: 0,
          couponUsed: 'coupon-1',
          appliedCouponCode: 'SAVE',
        },
      };
    },
    repository: {
      createAttempt: async (payload) => {
        saved = payload;
        return { ...payload, _id: 'attempt-1' };
      },
    },
    signature,
    policy: {
      ...policy,
      createTransactionUuid: () => 'SM-SECURE-1',
    },
  });

  const result = await service({
    userId: 'user-1',
    activeRole: 'passenger',
    hold: {
      _id: 'hold-1',
      tempBookingId: 'TEMP-1',
      tripId: 'trip-1',
      seatNumbers: ['a1'],
      originalAmount: 1200,
      expiresAt: new Date('2026-07-28T12:07:00Z'),
    },
    body: {
      originalAmount: 1,
      passengerDetails: [
        { name: 'Ram Shah', gender: 'M', seatNo: 'A1' },
      ],
      boardingPoint: { name: 'Kalanki', time: '08:00' },
      droppingPoint: { name: 'Pokhara', time: '15:00' },
    },
  });

  assert.equal(result.statusCode, 201);
  assert.equal(saved.originalAmount, 1200);
  assert.equal(saved.gatewayAmount, 1100);
  assert.equal(saved.formFields.total_amount, '1100');
  assert.equal(saved.formFields.transaction_uuid, 'SM-SECURE-1');
  assert.equal(
    saved.formFields.signed_field_names,
    'total_amount,transaction_uuid,product_code'
  );
  assert.equal(
    saved.formFields.success_url,
    'https://passenger.example/payment/esewa/success/SM-SECURE-1'
  );
  assert.equal(
    result.body.data.paymentUrl,
    'https://esewa.example/form'
  );
});
