'use strict';

/**
 * tests/unit/booking/passenger-post-payment-trip-validation-repository.test.js
 * Unit tests for passenger post-payment trip validation repository.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createPassengerPostPaymentTripValidationRepository,
} = require('../../../src/modules/booking/passenger-post-payment-trip-validation/passenger-post-payment-trip-validation.repository.js');

test('passengerPostPaymentTripValidationRepository unit tests', async (t) => {

  await t.test('1. rejects missing Trip dependency', () => {
    assert.throws(
      () => createPassengerPostPaymentTripValidationRepository({}),
      /createPassengerPostPaymentTripValidationRepository requires Trip with findById/
    );
  });

  await t.test('2-5. calls Trip.findById with exact scheduleId, invokes .lean() once, and returns result/null', async () => {
    let capturedId = null;
    let leanCalled = 0;
    const dummyTrip = { _id: 'sched_1', status: 'scheduled' };

    const repo = createPassengerPostPaymentTripValidationRepository({
      Trip: {
        findById: (id) => {
          capturedId = id;
          return {
            lean: async () => {
              leanCalled++;
              return dummyTrip;
            },
          };
        },
      },
    });

    const res = await repo.findTripById('sched_1');
    assert.equal(capturedId, 'sched_1');
    assert.equal(leanCalled, 1);
    assert.deepEqual(res, dummyTrip);

    const repoNull = createPassengerPostPaymentTripValidationRepository({
      Trip: {
        findById: () => ({ lean: async () => null }),
      },
    });
    const resNull = await repoNull.findTripById('missing_id');
    assert.equal(resNull, null);
  });

  await t.test('6 & 7. propagates findById and lean errors', async () => {
    const repoFindErr = createPassengerPostPaymentTripValidationRepository({
      Trip: {
        findById: () => { throw new Error('FindById Error'); },
      },
    });
    await assert.rejects(async () => repoFindErr.findTripById('s1'), { message: 'FindById Error' });

    const repoLeanErr = createPassengerPostPaymentTripValidationRepository({
      Trip: {
        findById: () => ({ lean: async () => { throw new Error('Lean Error'); } }),
      },
    });
    await assert.rejects(async () => repoLeanErr.findTripById('s1'), { message: 'Lean Error' });
  });
});
