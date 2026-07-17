'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../../../src/modules/auth/profile/profile.service');
const repository = require('../../../src/modules/auth/profile/profile.repository');
const picture = require('../../../src/modules/auth/profile/profile-picture.service');

const file = { mimetype: 'image/png', size: 10, data: Buffer.from('img') };
const restoreMap = (pairs) => () => pairs.forEach(([obj, key, old]) => { obj[key] = old; });
const patch = (pairs) => {
  const originals = pairs.map(([obj, key, fn]) => {
    const old = obj[key]; obj[key] = fn; return [obj, key, old];
  });
  return restoreMap(originals);
};
const bodyOf = async (promise) => {
  try { await promise; } catch (error) { return error.responseBody; }
  throw new Error('expected throw');
};

test('profile service preserves contracts, ordering and failure mapping', async (t) => {
  await t.test('updateProfilePicture order, save behavior and Cloudinary mapping', async () => {
    const order = [];
    const user = { _id: 'u1', profilePicture: 'old' };
    const restore = patch([
      [repository, 'findById', async (id) => { order.push(`find:${id}`); return user; }],
      [picture, 'uploadStandaloneProfilePicture', async (id, pic) => {
        order.push(`upload:${id}:${pic.mimetype}`); return { secure_url: 'new' };
      }],
      [repository, 'saveProfilePicture', async (u, url) => { order.push(`save:${url}`); u.profilePicture = url; }],
    ]);
    try {
      const res = await service.updateProfilePicture({ userId: 'u1', profilePic: file });
      assert.deepEqual(order, ['find:u1', 'upload:u1:image/png', 'save:new']);
      assert.deepEqual(res.responseBody, { success: true, message: 'Profile picture updated successfully' });
      assert.equal(user.profilePicture, 'new');
    } finally { restore(); }
    assert.equal((await bodyOf(service.updateProfilePicture({ userId: null, profilePic: file }))).message,
      'Unauthorized: User not authenticated');
    assert.equal((await bodyOf(service.updateProfilePicture({ userId: 'u1' }))).message,
      'Profile picture is required');
  });

  await t.test('updateProfile preserves operation order and updateData rules', async () => {
    const order = [];
    const user = { profilePicture: 'old' };
    const restore = patch([
      [repository, 'findById', async () => { order.push('find'); return user; }],
      [picture, 'uploadProfileUpdatePicture', async () => { order.push('upload'); return { secure_url: 'new' }; }],
      [repository, 'updateProfile', async (id, data) => { order.push(['update', id, data]); return { saved: data }; }],
    ]);
    try {
      const res = await service.updateProfile({
        userId: 'u2', name: '  Ann  ', address: '  Long Road  ',
        gender: 'FEMALE', profilePic: file,
      });
      assert.deepEqual(order, [
        'find',
        'upload',
        ['update', 'u2', {
          name: 'Ann', address: 'Long Road', gender: 'female', profilePicture: 'new',
        }],
      ]);
      assert.deepEqual(res.responseBody, {
        status: true, message: 'Profile updated successfully', data: { saved: order[2][2] },
      });
    } finally { restore(); }
  });

  await t.test('updateProfile expected failures and inner upload catch', async () => {
    let calls = 0;
    let restore = patch([[repository, 'findById', async () => { calls += 1; return null; }]]);
    try {
      assert.equal((await bodyOf(service.updateProfile({ userId: 'u', name: 'ab' }))).message, 'User not found');
      assert.equal(calls, 1);
    } finally { restore(); }
    restore = patch([
      [repository, 'findById', async () => ({ profilePicture: 'old' })],
      [picture, 'uploadProfileUpdatePicture', async () => { const e = new Error('http'); e.http_code = 499; throw e; }],
    ]);
    try {
      const body = await bodyOf(service.updateProfile({ userId: 'u', profilePic: file }));
      assert.deepEqual(body, { status: false, message: 'Failed to upload profile picture' });
    } finally { restore(); }
  });

  await t.test('outer mappings preserve validation, http_code and generic 500 bodies', async () => {
    const validation = new Error('bad');
    validation.name = 'ValidationError';
    validation.errors = { a: { message: 'A' }, b: { message: 'B' } };
    for (const [error, expected] of [
      [validation, { status: false, message: 'Validation error', errors: ['A', 'B'] }],
      [Object.assign(new Error('outer'), { http_code: 422 }), { status: false, message: 'Cloudinary error: outer' }],
      [new Error('boom'), { status: false, message: 'Internal server error' }],
    ]) {
      const restore = patch([
        [repository, 'findById', async () => ({ profilePicture: 'old' })],
        [repository, 'updateProfile', async () => { throw error; }],
      ]);
      try {
        const body = await bodyOf(service.updateProfile({ userId: 'u', name: 'Valid' }));
        assert.deepEqual(body, expected);
      } finally { restore(); }
    }
  });

  await t.test('getUserDetail projection result, sanitization and failure mapping', async () => {
    let toObjectCalled = false;
    const restore = patch([[repository, 'findByIdWithDetailProjection', async () => ({
      toObject: () => {
        toObjectCalled = true;
        return { rewardPoints: 1, referralPoints: 2, referralCode: 'R', phone: '9' };
      },
    })]]);
    try {
      const res = await service.getUserDetail({ userId: 'u3' });
      assert.equal(toObjectCalled, true);
      assert.deepEqual(res.responseBody.data, { referralCode: 'R', phone: '9' });
    } finally { restore(); }
    assert.equal((await bodyOf(service.getUserDetail({ userId: null }))).message,
      'Unauthorized: User not authenticated');
    const fail = patch([[repository, 'findByIdWithDetailProjection', async () => { throw new Error('db'); }]]);
    try {
      assert.deepEqual(await bodyOf(service.getUserDetail({ userId: 'u' })),
        { status: false, message: 'Internal server error' });
    } finally { fail(); }
  });
});
