'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');

const access = (u) => jwt.sign({
  id: u._id, role: 'passenger', activeRole: 'passenger',
  roles: ['passenger'], purpose: 'access', tokenVersion: u.tokenVersion ?? 0,
}, process.env.SECRET_KEY);

test('Auth profile update success contracts', async (t) => {
  await db.connect();
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('updates trimmed fields, lowercase gender, exact body shape and projection', async () => {
    const u = await User.create({
      name: 'Old Name', address: 'Old Address', gender: 'male',
      phone: '9655551111', password: 'Password1', role: 'passenger',
      roles: ['passenger'], status: 'active', isVerified: true,
      phoneVerified: true, profilePicture: 'https://old/p.png',
      referralCode: 'SHUV-PROFILE',
    });
    const res = await request(app).patch('/api/updateProfile')
      .set('Authorization', `Bearer ${access(u)}`)
      .send({ name: '  New Name  ', address: '  New Address  ', gender: 'FEMALE', extra: 'ignored' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.equal(res.body.message, 'Profile updated successfully');
    assert.equal(res.body.data.name, 'New Name');
    assert.equal(res.body.data.address, 'New Address');
    assert.equal(res.body.data.gender, 'female');
    assert.equal(res.body.data.profilePicture, 'https://old/p.png');
    for (const field of ['password', '_id', 'phone', 'role', 'rewardPoints', 'referralCode']) {
      assert.equal(res.body.data[field], undefined);
    }
    const stored = await User.findById(u._id);
    assert.equal(stored.name, 'New Name');
    assert.equal(stored.address, 'New Address');
    assert.equal(stored.gender, 'female');
    assert.equal(stored.profilePicture, 'https://old/p.png');
    assert.equal(stored.extra, undefined);
  });
});
