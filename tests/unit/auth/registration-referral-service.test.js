'use strict';
process.env.SECRET_KEY = 'test-only-secret-32chars-minimum!!';
process.env.VERIFICATION_TOKEN_SECRET = 'test-only-verification-secret!!';
process.env.SPARROW_SMS_TOKEN = 'test-stub';

const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../../../src/shared/errors/app-error');
const referralService = require('../../../src/modules/auth/registration/referral.service');

const makeRepo = (overrides = {}) => ({
  findUserByReferralCode: async () => ({ _id: 'ref_id', phone: '9800000099', totalReferrals: 0, yatrapoints: 5, save: async () => {} }),
  saveReferrerReward: async (u) => {},
  createReferralHistory: async () => {},
  ...overrides,
});

test('Unit: referral.service', async (t) => {
  await t.test('invalid format → AppError 400', async () => {
    await assert.rejects(
      () => referralService.resolveReferral('BAD!!', '9800000001', makeRepo()),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.match(err.responseBody.message, /format/i);
        return true;
      }
    );
  });

  await t.test('unknown code → AppError 400', async () => {
    await assert.rejects(
      () => referralService.resolveReferral('SHUV-UNK00', '9800000001', makeRepo({ findUserByReferralCode: async () => null })),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.match(err.responseBody.message, /invalid referral code/i);
        return true;
      }
    );
  });

  await t.test('self-referral → AppError 400', async () => {
    const phone = '9800000099';
    await assert.rejects(
      () => referralService.resolveReferral('SHUV-REF00', phone, makeRepo()),
      (err) => {
        assert.ok(err instanceof AppError);
        assert.equal(err.statusCode, 400);
        assert.match(err.responseBody.message, /yourself/i);
        return true;
      }
    );
  });

  await t.test('valid code → returns referredBy, yatrapoints=10, referrerUser', async () => {
    const result = await referralService.resolveReferral('SHUV-REF00', '9800000001', makeRepo());
    assert.ok(result.referredBy);
    assert.equal(result.yatrapoints, 10);
    assert.ok(result.referrerUser);
  });

  await t.test('createReferralHistoryRecord swallows failures', async () => {
    const repo = makeRepo({ createReferralHistory: async () => { throw new Error('DB down'); } });
    // Should not throw
    await assert.doesNotReject(() =>
      referralService.createReferralHistoryRecord(
        { referredUserId: 'u1', referrerUserId: 'u2', referralCode: 'SHUV-REF00', ipAddress: null, deviceInfo: null },
        repo
      )
    );
  });

  await t.test('applyReferrerReward increments totalReferrals and yatrapoints then saves', async () => {
    let saved = false;
    const referrer = { totalReferrals: 2, yatrapoints: 10, save: async () => { saved = true; } };
    const repo = { saveReferrerReward: async (u) => u.save() };
    await referralService.applyReferrerReward(referrer, repo);
    assert.equal(referrer.totalReferrals, 3);
    assert.equal(referrer.yatrapoints, 20);
    assert.ok(saved);
  });
});
