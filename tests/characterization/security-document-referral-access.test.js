'use strict';
process.env.SECRET_KEY = 'security-review-test-only-signing-key';
process.env.NODE_ENV = 'test';
const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Readable } = require('node:stream');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');
const auth = require('../../middleware/authMiddleware');
const guard = require('../../middleware/verifyRoleFromDB');
const { agentMiddleware } = require('../../middleware/checkRole');
const proxy = require('../../src/modules/shared/document-proxy');
const storage = require('../../src/modules/shared/document-proxy/document-proxy.storage');
const rewards = require('../../src/modules/referral/reward-lifecycle');
const app = express();
app.use(express.json());
app.get('/documents', auth, guard, agentMiddleware, proxy.viewDocument);
app.use('/referral', require('../../routes/referralRoutes/referralRoutes'));
let owner, other, token, fetched, referrals;
const sign = user => jwt.sign({ id: user._id, role: 'agent', activeRole: 'agent',
  purpose: 'access', tokenVersion: user.tokenVersion || 0 }, process.env.SECRET_KEY);
before(() => db.connect());
beforeEach(async () => {
  await db.clearAll(); fetched = []; referrals = [];
  owner = await User.create({ name: 'Agent A', phone: '9810000001', password: 'test-hash', role: 'agent', roles: ['agent'], status: 'active' });
  other = await User.create({ name: 'Agent B', phone: '9810000002', password: 'test-hash', role: 'agent', roles: ['agent'], status: 'active', referralCode: 'SHVB1234' });
  await Agent.collection.insertOne({ agentId: 'TEST-A', user: owner._id, documents: [{ fileKey: 'agents/a/own.pdf' },
    { fileKey: 'https://storage.example/agent_kyc/legacy.pdf?signature=old' }] });
  await Agent.collection.insertOne({ agentId: 'TEST-B', user: other._id, documents: [{ fileKey: 'agents/b/private.pdf' }] });
  token = sign(owner);
  mock.method(storage, 'fetchS3Object', async key => {
    fetched.push(key); return { ContentType: 'application/pdf', Body: Readable.from(['document']) };
  });
  mock.method(rewards, 'createReferral', async input => { referrals.push(input); return { status: 'ACTIVE' }; });
});
after(async () => { mock.restoreAll(); await db.disconnect(); });
test.afterEach(() => mock.restoreAll());
const read = key => request(app).get('/documents').query({ key }).set('Authorization', `Bearer ${token}`);

test('only currently stored owned documents reach storage, including legacy URLs', async () => {
  assert.equal((await read('agents/a/own.pdf')).status, 200);
  assert.equal((await read('agent_kyc/legacy.pdf')).status, 200);
  for (const key of ['agents/b/private.pdf', 'brands/b/drivers/d/license.pdf', 'disputes/proof.pdf', 'agents/a/removed.pdf']) {
    assert.equal((await read(key)).status, 403);
  }
  assert.deepEqual(fetched, ['agents/a/own.pdf', 'agent_kyc/legacy.pdf']);
});
test('deleted records, suspended agents and revoked roles lose document access', async () => {
  await Agent.updateOne({ user: owner._id }, { $set: { suspendedAt: new Date() } });
  assert.equal((await read('agents/a/own.pdf')).status, 403);
  await Agent.deleteOne({ user: owner._id });
  assert.equal((await read('agents/a/own.pdf')).status, 403);
  await User.collection.updateOne({ _id: owner._id }, { $set: { roles: [] } });
  assert.equal((await read('agents/a/own.pdf')).status, 403);
  assert.equal(fetched.length, 0);
});
test('document responses cannot be reused from a browser cache after revocation', async () => {
  assert.equal((await read('agents/a/own.pdf')).headers['cache-control'], 'private, no-store');
});
test('public referral mutation and cross-account targets fail before reward service', async () => {
  assert.equal((await request(app).post('/referral/applyCode').send({ referralCode: 'SHVB1234', userId: String(other._id) })).status, 401);
  assert.equal((await request(app).post('/referral/applyCode').set('Authorization', `Bearer ${token}`)
    .send({ referralCode: 'SHVB1234', userId: String(other._id) })).status, 403);
  assert.equal(referrals.length, 0);
});
test('authenticated referral uses actor identity; restricted accounts cannot apply', async () => {
  const res = await request(app).post('/referral/applyCode').set('Authorization', `Bearer ${token}`).send({ referralCode: 'SHVB1234' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(String(referrals[0].referredUserId), String(owner._id));
  await User.updateOne({ _id: owner._id }, { $set: { status: 'banned' } });
  assert.equal((await request(app).post('/referral/applyCode').set('Authorization', `Bearer ${token}`).send({ referralCode: 'SHVB1234' })).status, 403);
  assert.equal(referrals.length, 1);
});
