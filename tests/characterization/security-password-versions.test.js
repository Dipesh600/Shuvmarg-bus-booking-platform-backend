'use strict';
process.env.SECRET_KEY = 'security-review-test-only-signing-key';
process.env.NODE_ENV = 'test';
const { test, before, beforeEach, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const express = require('express');
const request = require('supertest');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const RefreshToken = require('../../models/refreshTokenModel');
const tokens = require('../../utils/tokenService');
const update = require('../../src/modules/auth/update-password/update-password.service');
const force = require('../../src/modules/auth/force-password/force-password.service');
const repository = require('../../src/modules/auth/force-password/force-password.repository');
const login = require('../../src/modules/auth/login/login.service');
const agentLogin = require('../../src/modules/agent/auth/login/agent-login.service');
const app = express();
app.get('/protected', require('../../middleware/authMiddleware'), require('../../middleware/verifyRoleFromDB'), (req, res) => res.json({ ok: true }));
let user;
before(() => db.connect());
beforeEach(async () => {
  await db.clearAll();
  user = await User.create({ name: 'Security User', phone: '9810000001',
    password: await bcrypt.hash('OldPass1', 4), roles: ['passenger', 'agent'], role: 'passenger',
    status: 'active', phoneVerified: true, tokenVersion: 4, temporaryCredentialVersion: 7 });
});
after(async () => { mock.restoreAll(); await db.disconnect(); });
test.afterEach(() => mock.restoreAll());
const claims = extra => ({ id: String(user._id), purpose: 'FORCE_PASSWORD_CHANGE',
  activeRole: 'passenger', credentialVersion: 7, tokenVersion: 4, ...extra });
const submit = payload => force.changeForcePassword({ tempToken: jwt.sign(payload, process.env.SECRET_KEY), newPassword: 'NewPass1' });

test('password update immediately rejects old access and refresh sessions', async () => {
  const pair = await tokens.generateTokenPair(user, { activeRole: 'passenger' });
  assert.equal((await request(app).get('/protected').set('Authorization', `Bearer ${pair.accessToken}`)).status, 200);
  await update.updatePassword({ userId: user._id, oldPassword: 'OldPass1', newPassword: 'NewPass1' });
  assert.equal((await request(app).get('/protected').set('Authorization', `Bearer ${pair.accessToken}`)).status, 401);
  assert.equal(await RefreshToken.countDocuments({ userId: user._id }), 0);
  assert.equal((await User.findById(user._id)).tokenVersion, 5);
});

test('generic and agent login issue the current recovery and session versions', async () => {
  await User.updateOne({ _id: user._id }, { $set: { forcePasswordChange: true } });
  for (const result of [
    await login.authenticate({ emailOrPhone: user.phone, password: 'OldPass1', appSource: 'passenger' }),
    await agentLogin.login({ rawPhone: user.phone, password: 'OldPass1' }),
  ]) {
    const decoded = jwt.verify(result.responseBody.tempToken, process.env.SECRET_KEY);
    assert.equal(decoded.credentialVersion, 7);
    assert.equal(decoded.tokenVersion, 4);
    assert.ok(['passenger', 'agent'].includes(decoded.activeRole));
  }
});

test('missing, malformed and stale recovery claims cannot change a password', async () => {
  await User.updateOne({ _id: user._id }, { $set: { forcePasswordChange: true } });
  const invalid = [claims({ credentialVersion: undefined }), claims({ tokenVersion: undefined }),
    claims({ credentialVersion: '7' }), claims({ credentialVersion: 6 }), claims({ tokenVersion: 3 }),
    claims({ activeRole: 'driver' })];
  for (const payload of invalid) await assert.rejects(() => submit(payload), err => [401, 403].includes(err.statusCode));
  const stored = await User.findById(user._id).select('+password');
  assert.equal(await bcrypt.compare('OldPass1', stored.password), true);
  assert.equal(stored.forcePasswordChange, true);
});

for (const change of [
  { $inc: { temporaryCredentialVersion: 1 } }, { $inc: { tokenVersion: 1 } },
  { $set: { status: 'banned' } }, { $set: { deletedAt: new Date() } },
  { $set: { roles: ['agent'] } }, { $set: { temporaryCredentialExpiresAt: new Date(0) } },
]) {
  test(`recovery write rejects a state change after validation: ${JSON.stringify(change)}`, async () => {
    await User.updateOne({ _id: user._id }, { $set: { forcePasswordChange: true } });
    const save = repository.saveForcedPasswordChange;
    mock.method(repository, 'saveForcedPasswordChange', async (...args) => {
      await User.collection.updateOne({ _id: user._id }, change);
      return save(...args);
    });
    await assert.rejects(() => submit(claims()), err => err.statusCode === 401);
    assert.equal(await bcrypt.compare('OldPass1', (await User.findById(user._id).select('+password')).password), true);
  });
}

test('a current recovery token is consumed once and revokes previous sessions', async () => {
  await User.updateOne({ _id: user._id }, { $set: { forcePasswordChange: true } });
  const result = await submit(claims());
  assert.equal(result.statusCode, 200);
  assert.equal((await User.findById(user._id)).tokenVersion, 5);
  await assert.rejects(() => submit(claims()), err => err.statusCode === 400);
});
