'use strict';
process.env.SECRET_KEY = 'identity-atomicity-test-only-secret';
process.env.VERIFICATION_TOKEN_SECRET = 'identity-proof-test-only-secret';
const { test, before, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const db = require('../helpers/transaction-db');
const smsPath = require.resolve('../../handlers/sparro-otp');
let smsCount = 0;
require.cache[smsPath] = { id: smsPath, filename: smsPath, loaded: true,
  exports: async () => { smsCount++; assert.equal(await Agent.countDocuments({}), 1); } };
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');
const admin = require('../../src/modules/agent/admin/conversion/agent-conversion.service');
const adminRepo = require('../../src/modules/agent/admin/conversion/agent-conversion.repository');
const invite = require('../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.service');
const inviteRepo = require('../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.repository');
const ownerId = new mongoose.Types.ObjectId();
const body = { name: 'Test Agent', phone: '9810000101', outletType: 'SOLO',
  district: 'Kathmandu', municipality: 'Kathmandu', placeName: 'Kalanki' };
const seed = () => User.create({ name: body.name, phone: body.phone, roles: ['passenger'],
  status: 'active', password: 'test-only-existing-hash', tokenVersion: 7 });
before(async () => { await db.connect(); await User.init(); await Agent.init(); });
beforeEach(async () => { await db.clearAll(); smsCount = 0; });
test.afterEach(() => mock.restoreAll());
after(() => db.disconnect());
for (const flow of ['admin', 'owner']) {
  const run = user => flow === 'admin' ? admin.makeUserAgent({ id: user._id }) : invite.createAgent(ownerId, body);
  test(`${flow}: profile failure rolls back the role; retry completes once`, async () => {
    const user = await seed();
    const repo = flow === 'admin' ? adminRepo : inviteRepo;
    const method = flow === 'admin' ? 'createAgentForUser' : 'createAgent';
    mock.method(repo, method, async () => { throw new Error('profile failure'); });
    await assert.rejects(run(user), /profile failure/);
    assert.deepEqual((await User.findById(user._id)).roles, ['passenger']);
    assert.equal(await Agent.countDocuments(), 0); assert.equal(smsCount, 0);
    mock.restoreAll();
    assert.equal((await run(user)).statusCode, 200);
    assert.equal(await Agent.countDocuments(), 1);
    const saved = await User.findById(user._id);
    assert.deepEqual(saved.roles, ['passenger', 'agent']); assert.equal(saved.tokenVersion, 7);
  });
  test(`${flow}: concurrent grants produce one profile and one successful response`, async () => {
    const user = await seed();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => run(user)));
    assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.statusCode === 200).length, 1);
    assert.equal(await Agent.countDocuments({ user: user._id }), 1);
  });
  test(`${flow}: unavailable accounts cannot receive a role`, async () => {
    const user = await seed(); await User.updateOne({ _id: user._id }, { $set: { status: 'banned' } });
    await assert.rejects(run(user), error => error.statusCode === 403);
    assert.equal(await Agent.countDocuments(), 0);
  });
}
test('new invitation rolls back identity on failure and sends SMS only after commit', async () => {
  mock.method(inviteRepo, 'createAgent', async () => { throw new Error('profile failure'); });
  await assert.rejects(invite.createAgent(ownerId, body), /profile failure/);
  assert.equal(await User.countDocuments(), 0); assert.equal(smsCount, 0);
  mock.restoreAll();
  assert.equal((await invite.createAgent(ownerId, body)).statusCode, 200);
  assert.equal(smsCount, 1); assert.equal(await User.countDocuments(), 1);
});
