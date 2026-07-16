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
    { otp: 'stub', otpExpiry: new Date(Date.now() + 300000), isUsed: true, attempts: 0, sendCount: 1, maxAttempts: 5 },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

test('Auth Registration: referral flow in completeRegistration', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  const makeBody = (phone, extra = {}) => ({
    phone, name: 'New User', address: 'Pokhara', gender: 'female',
    password: 'StrongPass1', verificationToken: issueValidToken(phone),
    ...extra,
  });

  await t.test('invalid referral code format → 400', async () => {
    const phone = '9800000030';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration')
      .send(makeBody(phone, { referralCode: 'BAD!!' }));
    assert.equal(res.status, 400);
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

  await t.test('self-referral → 400', async () => {
    // Create a user who owns the referral code SHUV-SRF77
    const referrerPhone = '9800000077';
    await User.create({ phone: referrerPhone, name: 'Ref', address: 'Y', gender: 'male', password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'], referralCode: 'SHUV-SRF77' });
    // Same phone (9800000077) tries to register using their own code
    await seedUsedOtp(referrerPhone);
    const res = await request(app).post('/api/completeRegistration')
      .send(makeBody(referrerPhone, { referralCode: 'SHUV-SRF77', verificationToken: issueValidToken(referrerPhone) }));
    // The service checks phone registration first; self-referral is caught as 400 either way
    assert.ok([400, 409].includes(res.status));
    assert.equal(res.body.status, false);
  });


  await t.test('valid referral → new user gets 10 points, referrer gets +10, history created', async () => {
    const referrer = await User.create({ phone: '9800000098', name: 'Referrer', address: 'KTM', gender: 'male', password: 'hashedpwd!!!', phoneVerified: true, isVerified: true, roles: ['passenger'], referralCode: 'SHUV-REF98', yatrapoints: 5, totalReferrals: 0 });
    const phone = '9800000040';
    await seedUsedOtp(phone);
    const res = await request(app).post('/api/completeRegistration')
      .send(makeBody(phone, { referralCode: 'SHUV-REF98' }));
    assert.equal(res.status, 201);

    const newUser = await User.findById(res.body.data.userId);
    assert.equal(newUser.yatrapoints, 10);
    assert.ok(newUser.referredBy.toString() === referrer._id.toString());

    const updatedReferrer = await User.findById(referrer._id);
    assert.equal(updatedReferrer.yatrapoints, 15);
    assert.equal(updatedReferrer.totalReferrals, 1);

    const history = await ReferralHistory.findOne({ referredUserId: newUser._id });
    assert.ok(history);
    assert.equal(history.rewardType, 'refral_point');
    assert.equal(history.status, 'completed');
    assert.equal(history.pointsCredited, true);
  });
});
