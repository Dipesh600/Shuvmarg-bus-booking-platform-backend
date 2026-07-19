'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');

const db = require('../helpers/db');
const app = require('../helpers/app');
const OTP = require('../../models/otpModel');
const BusOwner = require('../../models/busOwnerModel');
const tokenService = require('../../utils/tokenService');
const verificationToken = require('../../utils/verificationToken');

let n = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const phone = () => `98655${String(++n).padStart(5, '0')}`;
const seedOtp = (p) => OTP.create({
  phone: p,
  otp: '123456',
  purpose: 'BUSOWNER_REGISTRATION',
  otpExpiry: new Date(Date.now() + 600000),
  isUsed: true,
});
const body = (p) => ({
  phone: p,
  name: 'Owner Name',
  companyName: 'Company Name',
  password: credential(),
  verificationToken: verificationToken.issueVerificationToken(p, 'BUSOWNER_REGISTRATION'),
});
const patch = (obj, name, fn) => {
  const orig = obj[name];
  obj[name] = fn;
  return () => { obj[name] = orig; };
};

test('bus-owner registration error characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('duplicate-key registration mappings are exact', async () => {
    const cases = [
      [{ phone: 1 }, 'Mobile number is already registered.'],
      [{ email: 1 }, 'Email is already registered.'],
      [{ other: 1 }, 'Value is already registered.'],
      [undefined, 'Value is already registered.'],
    ];
    for (const [keyPattern, message] of cases) {
      const p = phone();
      await seedOtp(p);
      const restore = patch(BusOwner, 'findOne', async () => {
        const err = new Error('dup');
        err.code = 11000;
        err.keyPattern = keyPattern;
        throw err;
      });
      try {
        const res = await request(app).post('/api/auth/busowner/register').send(body(p));
        assert.equal(res.status, 409);
        assert.deepEqual(res.body, { success: false, message });
      } finally { restore(); }
    }
  });

  await t.test('profile, token, user conversion and cookie failures map to generic 500', async () => {
    const cases = [
      [BusOwner.prototype, 'save', async () => { throw new Error('profile fail'); }],
      [tokenService, 'generateTokenPair', async () => { throw new Error('token fail'); }],
    ];
    for (const [obj, name, fn] of cases) {
      const p = phone();
      await seedOtp(p);
      const restore = patch(obj, name, fn);
      try {
        const res = await request(app).post('/api/auth/busowner/register').send(body(p));
        assert.equal(res.status, 500);
        assert.deepEqual(res.body, {
          success: false,
          message: 'Registration failed. Please try again.',
        });
      } finally { restore(); }
    }
  });

  await t.test('cookie failure maps to generic 500 after token generation', async () => {
    const p = phone();
    await seedOtp(p);
    const orig = app.response.cookie;
    app.response.cookie = () => { throw new Error('cookie fail'); };
    try {
      const res = await request(app).post('/api/auth/busowner/register').send(body(p));
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, {
        success: false,
        message: 'Registration failed. Please try again.',
      });
    } finally { app.response.cookie = orig; }
  });
});
