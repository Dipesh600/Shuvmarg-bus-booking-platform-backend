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
const verificationToken = require('../../utils/verificationToken');

let n = 0;
const credential = () => `${crypto.randomBytes(24).toString('hex')}A1`;
const phone = () => `98555${String(++n).padStart(5, '0')}`;
const seedOtp = (p) => OTP.create({
  phone: p,
  otp: '123456',
  purpose: 'BUSOWNER_REGISTRATION',
  otpExpiry: new Date(Date.now() + 600000),
  isUsed: true,
});
const payload = (p, extra = {}) => ({
  phone: p,
  name: 'Ignored Name',
  companyName: 'New Company',
  verificationToken: verificationToken.issueVerificationToken(p, 'BUSOWNER_REGISTRATION'),
  ...extra,
});

test('bus-owner registration upgrade characterization', async (t) => {
  t.before(async () => db.connect());
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('existing user upgrades without replacing password or profile fields', async () => {
    const p = phone();
    const originalHash = await bcrypt.hash(credential(), 10);
    const user = await User.create({
      name: 'Existing Passenger',
      phone: p,
      email: 'existing@example.com',
      address: 'Old Address',
      password: originalHash,
      role: 'passenger',
      roles: ['passenger'],
      status: 'inactive',
    });
    await BusOwner.create({
      user: user._id,
      companyName: 'Existing Co',
      verificationStatus: 'approved',
    });
    await seedOtp(p);
    const res = await request(app).post('/api/auth/busowner/register').send(payload(p, {
      name: 'Changed',
      email: 'changed@example.com',
      address: 'Changed',
      password: credential(),
    }));
    assert.equal(res.status, 201);
    assert.equal(res.body.message, 'Bus operator role added. Submit your KYC documents to activate your account.');
    assert.equal(res.body.isUpgrade, true);
    assert.equal(res.body.activeRole, 'busOwner');
    const fresh = await User.findById(user._id).select('+password');
    assert.equal(fresh.password, originalHash);
    assert.equal(fresh.name, 'Existing Passenger');
    assert.equal(fresh.email, 'existing@example.com');
    assert.equal(fresh.address, 'Old Address');
    assert.equal(fresh.role, 'passenger');
    assert.equal(fresh.status, 'inactive');
    assert.equal(fresh.roles.includes('busOwner'), true);
    assert.ok(fresh.roleActivatedAt.get('busOwner'));
    const profile = await BusOwner.findOne({ user: user._id });
    assert.equal(profile.companyName, 'Existing Co');
    assert.equal(profile.verificationStatus, 'approved');
  });

  await t.test('missing password is accepted for upgrade and existing busOwner is rejected', async () => {
    const p = phone();
    await User.create({
      name: 'Passenger',
      phone: p,
      role: 'passenger',
      roles: ['passenger'],
      password: await bcrypt.hash(credential(), 10),
    });
    await seedOtp(p);
    const ok = await request(app).post('/api/auth/busowner/register').send(payload(p));
    assert.equal(ok.status, 201);

    const ownerPhone = phone();
    await User.create({
      name: 'Owner',
      phone: ownerPhone,
      role: 'busOwner',
      roles: ['busOwner'],
      password: await bcrypt.hash(credential(), 10),
    });
    await seedOtp(ownerPhone);
    const denied = await request(app).post('/api/auth/busowner/register').send(payload(ownerPhone));
    assert.equal(denied.status, 409);
    assert.deepEqual(denied.body, {
      success: false,
      message: 'This mobile number is already registered as a bus operator.',
      errorCode: 'ROLE_ALREADY_REGISTERED',
    });
  });
});
