'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const BusOwner = require('../../models/busOwnerModel');
const OTP = require('../../models/otpModel');
const tokenService = require('../../utils/tokenService');
const verificationToken = require('../../utils/verificationToken');

let n = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const phone = () => `98455${String(++n).padStart(5, '0')}`;
const seedOtp = (p, updatedAt = new Date()) => OTP.create({
  phone: p,
  otp: '123456',
  purpose: 'BUSOWNER_REGISTRATION',
  otpExpiry: new Date(Date.now() + 600000),
  isUsed: true,
  updatedAt,
});
const body = (p, extra = {}) => ({
  phone: p,
  name: '  New Operator  ',
  companyName: '  Road Lines  ',
  password: credential(),
  verificationToken: verificationToken.issueVerificationToken(p, 'BUSOWNER_REGISTRATION'),
  ...extra,
});
const post = (payload) => request(app).post('/api/auth/busowner/register').send(payload);

test('bus-owner registration new-user characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('required fields, lengths, token, OTP presence and recency are exact', async () => {
    assert.deepEqual((await post({})).body, { success: false, message: 'Phone is required.' });
    assert.deepEqual((await post({ phone: phone() })).body, { success: false, message: 'Name is required.' });
    assert.deepEqual((await post({ phone: phone(), name: 'Name' })).body, {
      success: false,
      message: 'Company name is required.',
    });
    assert.deepEqual((await post({ phone: phone(), name: ' a ', companyName: 'Company' })).body, {
      success: false,
      message: 'Name must be at least 3 characters.',
    });
    assert.deepEqual((await post({ phone: phone(), name: 'Name', companyName: ' x ' })).body, {
      success: false,
      message: 'Company name must be at least 3 characters.',
    });
    const p = phone();
    assert.equal((await post({ ...body(p), verificationToken: 'bad' })).status, 400);
    const p2 = phone();
    assert.deepEqual((await post(body(p2))).body, {
      success: false,
      message: 'Phone not verified. Please complete OTP verification first.',
    });
    const p3 = phone();
    const old = new Date(Date.now() - 31 * 60 * 1000);
    await seedOtp(p3);
    await OTP.collection.updateOne({ phone: p3 }, { $set: { updatedAt: old } });
    assert.deepEqual((await post(body(p3))).body, {
      success: false,
      message: 'OTP verification has expired. Please verify your phone again.',
    });
  });

  await t.test('new user validation, persistence, profile, token and cookie behavior', async () => {
    const p = phone();
    await seedOtp(p);
    await User.create({
      name: 'Email Owner',
      phone: phone(),
      email: 'used@example.com',
      role: 'passenger',
      roles: ['passenger'],
      password: await bcrypt.hash(credential(), 10),
    });
    const duplicateEmail = await post(body(p, { email: ' USED@EXAMPLE.COM ' }));
    assert.equal(duplicateEmail.status, 409);
    assert.deepEqual(duplicateEmail.body, {
      success: false,
      message: 'This email address is already registered.',
    });

    const weakPhone = phone();
    await seedOtp(weakPhone);
    const weak = await post(body(weakPhone, { password: 'weak' }));
    assert.equal(weak.status, 400);
    assert.equal(Array.isArray(weak.body.errors), true);

    const successPhone = phone();
    await seedOtp(successPhone);
    const res = await post(body(successPhone, {
      email: ' OWNER@EXAMPLE.COM ',
      address: '  Kathmandu  ',
    }));
    assert.equal(res.status, 201);
    assert.equal(res.body.message, 'Registration successful. Submit your KYC documents to activate your account.');
    assert.equal(res.body.activeRole, 'busOwner');
    assert.equal(res.body.isUpgrade, false);
    assert.equal(res.body.refreshToken, undefined);
    assert.equal(res.body.user.password, undefined);
    assert.ok(res.body.accessToken);
    assert.ok((res.headers['set-cookie'] || []).find((c) => /refreshToken=.*HttpOnly.*SameSite=Lax/i.test(c)));

    const user = await User.findOne({ phone: successPhone }).select('+password');
    assert.equal(user.name, 'New Operator');
    assert.equal(user.email, 'owner@example.com');
    assert.equal(user.address, 'Kathmandu');
    assert.equal(user.role, 'busOwner');
    assert.deepEqual(user.roles, ['busOwner']);
    assert.equal(user.status, 'active');
    assert.equal(user.phoneVerified, true);
    assert.equal(user.isVerified, false);
    assert.notEqual(user.password, res.body.user.password);
    const profile = await BusOwner.findOne({ user: user._id });
    assert.equal(profile.companyName, 'Road Lines');
    assert.equal(profile.verificationStatus, 'pending');
    const refresh = await request(app).post('/api/auth/busowner/refresh')
      .set('Cookie', res.headers['set-cookie']);
    assert.equal(refresh.status, 200);
    assert.equal(typeof tokenService.generateTokenPair, 'function');
  });
});
