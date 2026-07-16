'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const OTP = require('../../models/otpModel');
const ReferralHistory = require('../../models/referralModel');

function issueValidToken(phone) {
  return jwt.sign(
    { phone, purpose: 'REGISTRATION', nonce: crypto.randomBytes(8).toString('hex') },
    process.env.VERIFICATION_TOKEN_SECRET,
    { expiresIn: '30m' }
  );
}

async function seedUsedOtp(phone) {
  await OTP.findOneAndUpdate(
    { phone, purpose: 'REGISTRATION' },
    { otp: 'stub', otpExpiry: new Date(Date.now() + 300000),
      isUsed: true, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

const makeBody = (phone, extra = {}) => ({
  phone, name: 'New User', address: 'Pokhara', gender: 'female',
  password: 'StrongPass1', verificationToken: issueValidToken(phone),
  ...extra,
});

test('Auth Registration: referral flow in completeRegistration', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('invalid referral code format → 400', async () => {
    const phone = '9800000030';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration')
      .send(makeBody(phone, { referralCode: 'BAD!!' }));
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.match(res.body.message, /invalid referral code format/i);
  });

  await t.test('unknown referral code → 400', async () => {
    const phone = '9800000031';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration')
      .send(makeBody(phone, { referralCode: 'SHUV-UNK00' }));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /invalid referral code/i);
  });

  await t.test('valid referral → new user yatrapoints=10, referredBy equals referrer ID', async () => {
    const referrer = await User.create({
      phone: '9800000098', name: 'Referrer', address: 'KTM', gender: 'male',
      password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'],
      referralCode: 'SHUV-REF98', yatrapoints: 5, totalReferrals: 0,
    });
    const phone = '9800000040';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration')
      .send(makeBody(phone, { referralCode: 'SHUV-REF98' }));
    assert.equal(res.status, 201);
    const newUser = await User.findById(res.body.data.userId);
    assert.equal(newUser.yatrapoints, 10);
    assert.equal(newUser.referredBy.toString(), referrer._id.toString());
  });

  await t.test('valid referral → referrer yatrapoints +10, totalReferrals +1', async () => {
    const referrer = await User.create({
      phone: '9800000097', name: 'Ref2', address: 'KTM', gender: 'male',
      password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'],
      referralCode: 'SHUV-REF97', yatrapoints: 5, totalReferrals: 0,
    });
    const phone = '9800000041';
    await seedUsedOtp(phone);
    await request(app).post('/api/completeRegistration').send(makeBody(phone, { referralCode: 'SHUV-REF97' }));
    const updated = await User.findById(referrer._id);
    assert.equal(updated.yatrapoints, 15);
    assert.equal(updated.totalReferrals, 1);
  });

  await t.test('valid referral → exactly one ReferralHistory record with exact fields', async () => {
    const referrer = await User.create({
      phone: '9800000096', name: 'Ref3', address: 'KTM', gender: 'male',
      password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'],
      referralCode: 'SHUV-REF96', yatrapoints: 0, totalReferrals: 0,
    });
    const phone = '9800000042';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration')
      .set('User-Agent', 'TestBrowser/2.0')
      .send(makeBody(phone, { referralCode: 'SHUV-REF96' }));
    assert.equal(res.status, 201);

    const records = await ReferralHistory.find({ referrerUserId: referrer._id });
    assert.equal(records.length, 1);
    const h = records[0];
    const newUser = await User.findById(res.body.data.userId);
    assert.equal(h.referredUserId.toString(), newUser._id.toString());
    assert.equal(h.referrerUserId.toString(), referrer._id.toString());
    assert.equal(h.referredUserPoints, 10);
    assert.equal(h.referrerPoints, 10);
    assert.equal(h.usedReferralCode, 'SHUV-REF96');
    assert.equal(h.status, 'completed');
    assert.equal(h.rewardType, 'refral_point');
    assert.equal(h.pointsCredited, true);
    assert.ok(h.metadata.deviceInfo === 'TestBrowser/2.0');
    assert.ok(
      h.metadata.ipAddress === '::ffff:127.0.0.1' || h.metadata.ipAddress === '127.0.0.1',
      `expected loopback IP, got: ${h.metadata.ipAddress}`
    );
  });

  await t.test('referral-history DB failure is swallowed — registration still 201', async () => {
    const referrer = await User.create({
      phone: '9800000095', name: 'RefFour', address: 'KTM', gender: 'male',
      password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'],
      referralCode: 'SHUV-REF95', yatrapoints: 0, totalReferrals: 0,
    });
    const phone = '9800000043';
    await seedUsedOtp(phone);
    // Patch the repository method that createReferralHistoryRecord ultimately calls
    const repository = require('../../src/modules/auth/registration/registration.repository');
    const orig = repository.createReferralHistory;
    repository.createReferralHistory = async () => { throw new Error('DB down'); };
    try {
      const res = await request(app).post('/api/completeRegistration')
        .send(makeBody(phone, { referralCode: 'SHUV-REF95' }));
      assert.equal(res.status, 201, 'registration must succeed even when history fails');
    } finally {
      repository.createReferralHistory = orig;
    }
  });
});
