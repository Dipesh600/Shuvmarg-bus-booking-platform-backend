'use strict';
process.env.SECRET_KEY = 'role-grant-security-test-only-secret';
process.env.VERIFICATION_TOKEN_SECRET = 'role-grant-proof-test-only-secret';
const { test, before, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const Agent = require('../../models/agentModel');
const OTP = require('../../models/otpModel');
const verification = require('../../utils/verificationToken');
const agent = require('../../src/modules/agent/auth/registration/agent-registration-completion.service');
const owner = require('../../src/modules/bus-owner/auth/registration/bus-owner-registration-completion.service');
const agentRepo = require('../../src/modules/agent/auth/registration/agent-registration.repository');
const ownerRepo = require('../../src/modules/bus-owner/auth/registration/bus-owner-registration.repository');
const adminOwner = require('../../src/modules/admin/bus-owner-management/admin-owner-identity.service');
let user;
before(() => db.connect());
beforeEach(async () => {
  await db.clearAll();
  user = await User.create({ name: 'Existing Person', phone: '9810000001', status: 'active',
    roles: ['passenger'], role: 'passenger', password: await bcrypt.hash('OldPass1', 4), tokenVersion: 5 });
  for (const purpose of ['AGENT_REGISTRATION', 'BUSOWNER_REGISTRATION']) {
    await OTP.create({ phone: user.phone, purpose, otp: 'test-only-hash',
      otpExpiry: new Date(Date.now() + 300000), isUsed: true });
  }
});
after(async () => { mock.restoreAll(); await db.disconnect(); });
test.afterEach(() => mock.restoreAll());
const input = (role, password = 'NewPass1') => ({ phone: user.phone, name: user.name,
  companyName: 'Test Bus Operator', password,
  verificationToken: verification.issueVerificationToken(user.phone, role === 'agent' ? 'AGENT_REGISTRATION' : 'BUSOWNER_REGISTRATION') });

test('adding agent access preserves shared credentials even if a new password is supplied', async () => {
  await agent.register(input('agent'));
  const stored = await User.findById(user._id).select('+password');
  assert.equal(await bcrypt.compare('OldPass1', stored.password), true);
  assert.equal(await bcrypt.compare('NewPass1', stored.password), false);
  assert.equal(stored.tokenVersion, 5);
  assert.deepEqual(stored.roles.sort(), ['agent', 'passenger']);
});
test('agent access can be added without a new password when one already exists', async () => {
  const request = input('agent'); delete request.password;
  assert.equal((await agent.register(request)).statusCode, 201);
});
test('passwordless upgrade sets a password and revokes prior sessions', async () => {
  await User.collection.updateOne({ _id: user._id }, { $unset: { password: '' } });
  await agent.register(input('agent'));
  const stored = await User.findById(user._id).select('+password');
  assert.equal(await bcrypt.compare('NewPass1', stored.password), true);
  assert.equal(stored.tokenVersion, 6);
});

for (const role of ['agent', 'busOwner']) {
  for (const state of [{ status: 'banned' }, { status: 'inactive' },
    { status: 'invited' }, { deletedAt: new Date() }, { forcePasswordChange: true }]) {
    test(`${role} rejects proof issued before account restriction ${Object.keys(state)}`, async () => {
      const request = input(role);
      await User.collection.updateOne({ _id: user._id }, { $set: state });
      await assert.rejects(() => (role === 'agent' ? agent : owner).register(request));
      assert.equal((await User.findById(user._id)).roles.includes(role), false);
      assert.equal(await Agent.countDocuments({ user: user._id }), 0);
    });
  }
  test(`${role} grant rechecks restrictions at the final database write`, async () => {
    const repository = role === 'agent' ? agentRepo : ownerRepo;
    const name = role === 'agent' ? 'upgradeUserToAgent' : 'upgradeUserToBusOwner';
    const grant = repository[name];
    mock.method(repository, name, async (...args) => {
      await User.collection.updateOne({ _id: user._id }, { $set: { status: 'banned' } });
      return grant(...args);
    });
    await assert.rejects(() => (role === 'agent' ? agent : owner).register(input(role)), err => err.statusCode === 403);
    assert.equal((await User.findById(user._id)).roles.includes(role), false);
  });
}
test('adding owner role preserves forced password recovery and credential versions', async () => {
  await User.updateOne({ _id: user._id }, { $set: { forcePasswordChange: true, temporaryCredentialVersion: 8 } });
  await adminOwner.addOwnerRoleToExistingUser(user);
  const stored = await User.findById(user._id).select('+temporaryCredentialVersion');
  assert.equal(stored.forcePasswordChange, true);
  assert.equal(stored.temporaryCredentialVersion, 8);
  assert.equal(stored.tokenVersion, 5);
});
