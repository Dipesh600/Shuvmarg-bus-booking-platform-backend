'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const db = require('../helpers/db');
const app = require('../helpers/app');
const OTP = require('../../models/otpModel');

function issueValidToken(phone) {
  return jwt.sign(
    { phone, purpose: 'REGISTRATION', nonce: crypto.randomBytes(8).toString('hex') },
    process.env.VERIFICATION_TOKEN_SECRET,
    { expiresIn: '30m' }
  );
}

async function seedUsedOtp(phone, daysAgo = 0) {
  const staleTime = daysAgo > 0
    ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
    : new Date();
  await OTP.collection.findOneAndUpdate(
    { phone, purpose: 'REGISTRATION' },
    { $set: { otp: 'stub', otpExpiry: new Date(Date.now() + 300000),
      isUsed: true, attempts: 0, sendCount: 1, maxAttempts: 5,
      updatedAt: staleTime, createdAt: staleTime } },
    { upsert: true }
  );
}

const goodBody = (phone = '9800000020') => ({
  phone, name: 'Test User', address: 'Kathmandu', gender: 'male',
  password: 'StrongPass1', verificationToken: issueValidToken(phone),
});

test('Auth Registration: completeRegistration — required field validation', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('missing phone → 400 with "Phone is required!"', async () => {
    const { phone: _p, ...body } = goodBody();
    const res = await request(app).post('/api/completeRegistration').send(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.equal(res.body.message, 'Phone is required!');
  });

  await t.test('missing name → 400 with "Name is required!"', async () => {
    const phone = '9800000100';
    const { name: _n, ...body } = goodBody(phone);
    const res = await request(app).post('/api/completeRegistration').send(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Name is required!');
  });

  await t.test('missing password → 400 with "Password is required!"', async () => {
    const phone = '9800000101';
    const { password: _pw, ...body } = goodBody(phone);
    const res = await request(app).post('/api/completeRegistration').send(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Password is required!');
  });

  await t.test('missing address → 400 with "Address is required!"', async () => {
    const phone = '9800000102';
    const { address: _a, ...body } = goodBody(phone);
    const res = await request(app).post('/api/completeRegistration').send(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Address is required!');
  });

  await t.test('missing gender → 400 with "Gender is required!"', async () => {
    const phone = '9800000103';
    const { gender: _g, ...body } = goodBody(phone);
    const res = await request(app).post('/api/completeRegistration').send(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Gender is required!');
  });

  await t.test('priority: all absent → phone message first', async () => {
    const res = await request(app).post('/api/completeRegistration').send({});
    assert.equal(res.status, 400);
    assert.equal(res.body.message, 'Phone is required!');
  });
});

test('Auth Registration: completeRegistration — verification proof', async (t) => {
  t.before(async () => await db.connect());
  t.after(async () => await db.disconnect());
  t.beforeEach(async () => await db.clearAll());

  await t.test('missing verificationToken → 400', async () => {
    const { verificationToken: _vt, ...body } = goodBody('9800000110');
    const res = await request(app).post('/api/completeRegistration').send(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.status, false);
    assert.match(res.body.message, /verification token.*required/i);
  });

  await t.test('invalid verificationToken → 400', async () => {
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody('9800000111'), verificationToken: 'bad.token.here' });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /invalid verification token/i);
  });

  await t.test('token for another phone → 400', async () => {
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody('9800000112'), verificationToken: issueValidToken('9800000999') });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /does not match/i);
  });

  await t.test('token for wrong purpose → 400', async () => {
    const wrongToken = jwt.sign(
      { phone: '9800000113', purpose: 'BUSOWNER_REGISTRATION', nonce: 'x' },
      process.env.VERIFICATION_TOKEN_SECRET, { expiresIn: '30m' }
    );
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody('9800000113'), verificationToken: wrongToken });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /invalid verification token for this registration type/i);
  });

  await t.test('no used REGISTRATION OTP → 400', async () => {
    const phone = '9800000114';
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody(phone), verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /not verified/i);
  });

  await t.test('used OTP older than 30 min → 400', async () => {
    const phone = '9800000115';
    await seedUsedOtp(phone, 1);
    const res = await request(app).post('/api/completeRegistration')
      .send({ ...goodBody(phone), verificationToken: issueValidToken(phone) });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /expired/i);
  });
});
