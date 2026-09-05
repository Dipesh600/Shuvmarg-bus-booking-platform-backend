'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const RefreshToken = require('../../models/refreshTokenModel');
const tokens = require('../../utils/tokenService');
const loginPolicy = require('../../src/modules/auth/login/login.policy');

process.env.SECRET_KEY ||= 'test-only-multi-role-hardening-secret';
const app = require('../helpers/multi-role-hardening-app');
const get = (path, token) => request(app).get(path).set('Authorization', `Bearer ${token}`);

test('multi-role authorization and persistence', async t => {
  t.before(() => db.connect());
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());
  const createUser = () => User.create({ phone: '9801234567', name: 'Role Test',
    role: 'busOwner', roles: ['busOwner', 'passenger'], password: 'test-only-password', status: 'active' });

  await t.test('saving after revocation never restores the original role; other sessions survive', async () => {
    const user = await createUser();
    const owner = await tokens.generateTokenPair(user, { activeRole: 'busOwner' });
    const passenger = await tokens.generateTokenPair(user, { activeRole: 'passenger' });
    assert.equal((await get('/owner', owner.accessToken)).status, 200);
    await User.updateOne({ _id: user._id }, { $pull: { roles: 'busOwner' } });
    const updated = await User.findById(user._id);
    updated.name = 'Updated Name';
    await updated.save();
    assert.deepEqual((await User.findById(user._id)).roles, ['passenger']);
    assert.equal((await get('/owner', owner.accessToken)).body.errorCode, 'ROLE_REVOKED');
    assert.equal((await get('/passenger', passenger.accessToken)).status, 200);
    await assert.rejects(tokens.rotateRefreshToken(owner.refreshToken), /ROLE_REVOKED/);
    const rotated = await tokens.rotateRefreshToken(passenger.refreshToken);
    assert.equal(jwt.verify(rotated.accessToken, process.env.SECRET_KEY).activeRole, 'passenger');
    assert.equal(loginPolicy.resolveActiveRole(updated, ''), 'passenger');
    assert.equal(jwt.verify(tokens.signAccessToken(updated), process.env.SECRET_KEY).activeRole, 'passenger');
    assert.throws(() => tokens.signAccessToken(updated, 'busOwner'), /ROLE_REVOKED/);
  });

  await t.test('session role cannot use another held role without changing session', async () => {
    const user = await createUser();
    const passenger = tokens.signAccessToken(user, 'passenger');
    assert.equal((await get('/owner', passenger)).status, 403);
    assert.equal((await get('/passenger', passenger)).status, 200);
  });

  await t.test('empty roles block old sessions, new tokens, and login fallback', async () => {
    const user = await createUser();
    const pair = await tokens.generateTokenPair(user, { activeRole: 'busOwner' });
    await User.updateOne({ _id: user._id }, { roles: [] });
    const updated = await User.findById(user._id);
    assert.equal((await get('/owner', pair.accessToken)).body.errorCode, 'ROLE_REVOKED');
    await assert.rejects(tokens.rotateRefreshToken(pair.refreshToken), /ROLE_REVOKED/);
    assert.throws(() => tokens.signAccessToken(updated), /ROLE_REVOKED/);
    assert.throws(() => loginPolicy.resolveActiveRole(updated, ''), e => e.statusCode === 403);
    await assert.rejects(updated.save(), /at least one role/);
  });

  await t.test('missing legacy roles are initialized before validation, without requiring a new phone', async () => {
    const user = await User.create({ phone: '9801234567', role: 'passenger' });
    assert.deepEqual(user.roles, ['passenger']);
    await User.collection.updateOne({ _id: user._id }, { $unset: { roles: '' } });
    const legacy = await User.findById(user._id);
    assert.equal(legacy.roles, undefined);
    assert.equal((await get('/passenger', tokens.signAccessToken(legacy, 'passenger'))).status, 200);
    await legacy.save();
    assert.deepEqual((await User.findById(user._id)).roles, ['passenger']);
  });

  await t.test('a roleless token is rejected even for an existing user', async () => {
    const user = await createUser();
    const token = jwt.sign({ id: user._id, purpose: 'access' }, process.env.SECRET_KEY);
    assert.equal((await get('/passenger', token)).body.errorCode, 'ROLE_REVOKED');
  });

  for (const [patch, code] of [
    [{ status: 'inactive' }, 'ACCOUNT_INACTIVE'],
    [{ status: 'invited' }, 'ACCOUNT_NOT_ACTIVATED'],
    [{ status: 'banned' }, 'ACCOUNT_BANNED'],
    [{ deletedAt: new Date() }, 'ACCOUNT_DEACTIVATED'],
    [{ forcePasswordChange: true }, 'FORCE_PASSWORD_CHANGE'],
  ]) {
    await t.test(`refresh and access reject ${code}`, async () => {
      const user = await createUser();
      const pair = await tokens.generateTokenPair(user, { activeRole: 'passenger' });
      await User.updateOne({ _id: user._id }, patch);
      assert.equal((await get('/passenger', pair.accessToken)).body.errorCode, code);
      await assert.rejects(tokens.rotateRefreshToken(pair.refreshToken), new RegExp(code));
      assert.equal(await RefreshToken.countDocuments({ userId: user._id }), 0);
    });
  }

  await t.test('every ordinary account role is denied broadcast notifications', async () => {
    const user = await createUser();
    user.roles = ['passenger', 'busOwner', 'agent', 'driver', 'conductor'];
    for (const role of user.roles) {
      const response = await request(app).post('/notifications/notifyUser')
        .set('Authorization', `Bearer ${tokens.signAccessToken(user, role)}`).send({});
      assert.equal(response.status, 401, `${role} must not reach the broadcast handler`);
    }
  });

  await t.test('real private routes reject revoked sessions before their handlers', async () => {
    const user = await createUser();
    const token = tokens.signAccessToken(user, 'passenger');
    await User.updateOne({ _id: user._id }, { $pull: { roles: 'passenger' } });
    for (const [method, path] of [
      ['get', '/tickets/getMyTicketHistory'], ['post', '/tickets/cancelTicket'],
      ['post', '/tickets/cancelEstimate'], ['get', '/reviews/mine'],
      ['post', '/reviews/createReview'], ['get', '/referrals/history'],
      ['post', '/referrals/generateCode'], ['post', '/notifications/getDeviceInfo'],
    ]) {
      const response = await request(app)[method](path)
        .set('Authorization', `Bearer ${token}`);
      assert.equal(response.status, 403, path);
      assert.equal(response.body.errorCode, 'ROLE_REVOKED', path);
    }
  });

  await t.test('concurrent refresh requests produce exactly one replacement session', async () => {
    const user = await createUser();
    const pair = await tokens.generateTokenPair(user, { activeRole: 'passenger' });
    // Force both requests to read the old token before either can consume it.
    const original = RefreshToken.findOne;
    let reads = 0;
    let release;
    const barrier = new Promise(resolve => { release = resolve; });
    RefreshToken.findOne = async function (...args) {
      const doc = await original.apply(this, args);
      if (++reads === 2) release();
      await barrier;
      return doc;
    };
    try {
      const results = await Promise.allSettled([
        tokens.rotateRefreshToken(pair.refreshToken), tokens.rotateRefreshToken(pair.refreshToken),
      ]);
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.find(r => r.status === 'rejected').reason.message, 'INVALID_REFRESH_TOKEN');
      assert.equal(await RefreshToken.countDocuments({ userId: user._id }), 1);
    } finally { RefreshToken.findOne = original; }
  });
});
