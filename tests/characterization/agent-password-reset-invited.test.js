'use strict';

process.env.SECRET_KEY ||= 'test-only-secret-32chars-minimum!!';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const otpHelper = require('../../utils/otpHelper');

const patch = (obj, key, fn) => {
  const old = obj[key]; obj[key] = fn; return () => { obj[key] = old; };
};

test('invited agent recovery activates the account and signs it in', async () => {
  await db.connect();
  await db.clearAll();
  const phone = '9818299999';
  const user = await User.create({
    name: 'Invited Reset', phone,
    password: bcrypt.hashSync('OldPass123!', 10),
    role: 'agent', roles: ['agent'], status: 'invited',
    phoneVerified: false, isVerified: false, forcePasswordChange: true,
    temporaryCredentialIssuedAt: new Date(),
    temporaryCredentialExpiresAt: new Date(Date.now() + 60_000),
  });
  const restore = patch(otpHelper, 'verifyOTPCode', async () => ({ valid: true }));
  try {
    const res = await request(app).post('/api/auth/agent/resetPassword').send({
      phone, otp: '123456', newPassword: 'Recovered123!',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Account activated and password created. You are now signed in.');
    assert.equal(res.body.activeRole, 'agent');
    assert.equal(typeof res.body.accessToken, 'string');
    assert.match(res.headers['set-cookie'][0], /^agentRefreshToken=/);
    const fresh = await User.findById(user._id).select(
      '+password +temporaryCredentialIssuedAt +temporaryCredentialExpiresAt',
    );
    assert.equal(fresh.status, 'active');
    assert.equal(fresh.phoneVerified, true);
    assert.equal(fresh.isVerified, true);
    assert.equal(fresh.forcePasswordChange, false);
    assert.equal(fresh.temporaryCredentialIssuedAt, null);
    assert.equal(fresh.temporaryCredentialExpiresAt, null);
    assert.equal(await bcrypt.compare('Recovered123!', fresh.password), true);
  } finally {
    restore();
    await db.disconnect();
  }
});
