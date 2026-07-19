'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const User = require('../../models/userModel');
const PartnerLead = require('../../models/PartnerLead');
const otpHelper = require('../../utils/otpHelper');

let n = 0;
const phone = () => `98255${String(++n).padStart(5, '0')}`;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const user = async (fields) => User.create({
  password: await bcrypt.hash(credential(), 10),
  ...fields,
});
const patchVerify = (fn) => {
  const orig = otpHelper.verifyOTPCode;
  otpHelper.verifyOTPCode = fn;
  return () => { otpHelper.verifyOTPCode = orig; };
};
const post = (body) => request(app).post('/api/auth/busowner/verifyOTP').send(body);

test('bus-owner registration verifyOTP characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('input validation and OTP helper failure are exact', async () => {
    assert.equal((await post({})).status, 400);
    const short = await post({ phone: phone(), otp: '12-34' });
    assert.equal(short.status, 400);
    assert.deepEqual(short.body, { success: false, message: 'Verification code must be 6 digits.' });
    const restore = patchVerify(async () => ({ valid: false, error: 'Bad code' }));
    try {
      const res = await post({ phone: phone(), otp: '123456' });
      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { success: false, message: 'Bad code' });
    } finally { restore(); }
  });

  await t.test('sanitizes OTP, rejects role race, and returns bound token without roles', async () => {
    const calls = [];
    let restore = patchVerify(async (...args) => {
      calls.push(args);
      return { valid: true };
    });
    try {
      const p = phone();
      const res = await post({ phone: p, otp: '12-34 56' });
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, false);
      assert.equal(res.body.userName, null);
      assert.equal(res.body.existingRoles, undefined);
      assert.ok(res.body.verificationToken);
      const decoded = jwt.verify(res.body.verificationToken, process.env.VERIFICATION_TOKEN_SECRET);
      assert.equal(decoded.phone, p);
      assert.equal(decoded.purpose, 'BUSOWNER_REGISTRATION');
      assert.deepEqual(calls[0], [p, '123456', 'BUSOWNER_REGISTRATION']);
      await new Promise((resolve) => setImmediate(resolve));
      const lead = await PartnerLead.findOne({ phone: p, leadType: 'otp_verified', entityType: 'busOwner' });
      assert.equal(lead.phoneVerified, true);
      assert.equal(lead.source, 'busowner_app');
    } finally { restore(); }

    restore = patchVerify(async () => ({ valid: true }));
    try {
      const p = phone();
      await user({ name: 'Owner', phone: p, role: 'busOwner', roles: ['busOwner'] });
      const res = await post({ phone: p, otp: '123456' });
      assert.equal(res.status, 409);
      assert.deepEqual(res.body, {
        success: false,
        message: 'This mobile number is already registered as a bus operator.',
        errorCode: 'ROLE_ALREADY_REGISTERED',
      });
    } finally { restore(); }
  });

  await t.test('existing user response and non-fatal lead rejection are preserved', async () => {
    const restoreVerify = patchVerify(async () => ({ valid: true }));
    const orig = PartnerLead.findOneAndUpdate;
    PartnerLead.findOneAndUpdate = () => Promise.reject(new Error('lead down'));
    try {
      const p = phone();
      await user({ name: 'Existing', phone: p, role: 'passenger', roles: ['passenger'] });
      const res = await post({ phone: p, otp: '123456' });
      assert.equal(res.status, 200);
      assert.equal(res.body.exists, true);
      assert.equal(res.body.userName, 'Existing');
      assert.ok(res.body.verificationToken);
    } finally {
      PartnerLead.findOneAndUpdate = orig;
      restoreVerify();
    }
  });
});
