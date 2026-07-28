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

test('Auth user detail profile contract', async (t) => {
  await db.connect();
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('returns exact success body and removes only legacy point fields', async () => {
    const u = await User.create({
      name: 'Detail User', phone: '9644441111', password: 'Password1',
      role: 'passenger', roles: ['passenger'], status: 'active',
      isVerified: true, phoneVerified: true, rewardPoints: 7,
      referralPoints: 8, referralCode: 'SHUV-DETAIL', totalReferrals: 3,
      yatrapoints: 12, tokenVersion: 4,
    });
    const res = await request(app).get('/api/getUserDetail')
      .set('Authorization', `Bearer ${access(u)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, true);
    assert.equal(res.body.message, 'User details fetched successfully');
    assert.equal(res.body.data.rewardPoints, undefined);
    assert.equal(res.body.data.referralPoints, undefined);
    assert.equal(res.body.data.referralCode, 'SHUV-DETAIL');
    assert.equal(res.body.data.totalReferrals, 3);
    assert.equal(res.body.data.yatrapoints, 12);
    assert.equal(res.body.data.phone, '9644441111');
    assert.equal(res.body.data.status, 'active');
    assert.equal(res.body.data.tokenVersion, 4);
    assert.equal(res.body.data.password, undefined);
    assert.equal(res.body.data.createdAt, undefined);
  });
});
