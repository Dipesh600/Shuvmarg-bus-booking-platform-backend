'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../helpers/app');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const cloudinary = require('../../handlers/cloudinary');

const file = (type, size = 10) => ({
  filename: `p.${type.split('/')[1]}`,
  contentType: type,
  buffer: Buffer.alloc(size, 'a'),
});
const access = (u) => jwt.sign({
  id: u._id, role: 'passenger', activeRole: 'passenger',
  roles: ['passenger'], purpose: 'access', tokenVersion: u.tokenVersion ?? 0,
}, process.env.SECRET_KEY);
const user = () => User.create({
  name: 'Profile User', phone: `98${Math.random().toString().slice(2, 10)}`,
  password: 'Password1', role: 'passenger', roles: ['passenger'],
  status: 'active', isVerified: true, phoneVerified: true,
  referralCode: 'SHUV-PROFILE',
});
const patchUpload = (fn) => {
  const old = cloudinary.uploader.upload;
  cloudinary.uploader.upload = fn;
  return () => { cloudinary.uploader.upload = old; };
};

test('Auth profile picture characterization', async (t) => {
  await db.connect();
  t.after(async () => db.disconnect());
  t.beforeEach(async () => db.clearAll());

  await t.test('UpdateProfilePic auth, file rules, upload options and success body', async () => {
    const noAuth = await request(app).put('/api/UpdateProfilePic');
    assert.equal(noAuth.status, 401);
    const u = await user();
    const calls = [];
    const restore = patchUpload(async (uri, opts) => {
      calls.push({ uri, opts });
      return { secure_url: 'https://cdn.example/profile.png' };
    });
    try {
      const missing = await request(app).put('/api/UpdateProfilePic')
        .set('Authorization', `Bearer ${access(u)}`);
      assert.deepEqual(missing.body, { status: false, message: 'Profile picture is required' });
      for (const type of ['image/jpeg', 'image/png', 'image/gif']) {
        const res = await request(app).put('/api/UpdateProfilePic')
          .set('Authorization', `Bearer ${access(u)}`)
          .attach('profilePic', file(type).buffer, file(type));
        assert.equal(res.status, 200);
        assert.deepEqual(res.body, { success: true, message: 'Profile picture updated successfully' });
      }
      const webp = await request(app).put('/api/UpdateProfilePic')
        .set('Authorization', `Bearer ${access(u)}`)
        .attach('profilePic', file('image/webp').buffer, file('image/webp'));
      assert.equal(webp.status, 400);
      assert.equal(webp.body.message, 'Invalid file type. Only JPEG, PNG, and GIF are allowed');
      assert.match(calls[0].uri, /^data:image\/jpeg;base64,/);
      assert.equal(calls[0].opts.folder, 'profile_picture');
      assert.match(calls[0].opts.public_id, new RegExp(`^user_${u._id}_\\d+$`));
      assert.equal(calls[0].opts.overwrite, true);
      assert.equal(calls[0].opts.transformation, undefined);
      const stored = await User.findById(u._id);
      assert.equal(stored.profilePicture, 'https://cdn.example/profile.png');
    } finally {
      restore();
    }
  });

  await t.test('UpdateProfilePic maps Cloudinary http_code and generic upload errors', async () => {
    const u = await user();
    let restore = patchUpload(async () => {
      const err = new Error('quota'); err.http_code = 499; throw err;
    });
    try {
      const res = await request(app).put('/api/UpdateProfilePic')
        .set('Authorization', `Bearer ${access(u)}`)
        .attach('profilePic', file('image/png').buffer, file('image/png'));
      assert.equal(res.status, 499);
      assert.deepEqual(res.body, { status: false, message: 'Cloudinary error: quota' });
    } finally {
      restore();
    }
    restore = patchUpload(async () => { throw new Error('boom'); });
    try {
      const res = await request(app).put('/api/UpdateProfilePic')
        .set('Authorization', `Bearer ${access(u)}`)
        .attach('profilePic', file('image/png').buffer, file('image/png'));
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { status: false, message: 'Internal server error' });
    } finally {
      restore();
    }
  });

  await t.test('updateProfile file path accepts WebP, enforces 5MB, and maps upload failure', async () => {
    const u = await user();
    const calls = [];
    const restore = patchUpload(async (uri, opts) => {
      calls.push({ uri, opts });
      return { secure_url: 'https://cdn.example/update.webp' };
    });
    try {
      const res = await request(app).patch('/api/updateProfile')
        .set('Authorization', `Bearer ${access(u)}`)
        .attach('profilePic', file('image/webp').buffer, file('image/webp'));
      assert.equal(res.status, 200);
      assert.equal(res.body.data.profilePicture, 'https://cdn.example/update.webp');
      assert.match(calls[0].uri, /^data:image\/webp;base64,/);
      assert.deepEqual(calls[0].opts.transformation, [
        { width: 400, height: 400, crop: 'fill', quality: 'auto' },
      ]);
      const tooLarge = await request(app).patch('/api/updateProfile')
        .set('Authorization', `Bearer ${access(u)}`)
        .attach('profilePic', file('image/png', 5 * 1024 * 1024 + 1).buffer, file('image/png'));
      assert.equal(tooLarge.status, 400);
      assert.equal(tooLarge.body.message, 'File size too large. Maximum 5MB allowed');
    } finally {
      restore();
    }
    const failRestore = patchUpload(async () => { const e = new Error('cloud'); e.http_code = 418; throw e; });
    try {
      const res = await request(app).patch('/api/updateProfile')
        .set('Authorization', `Bearer ${access(u)}`)
        .attach('profilePic', file('image/png').buffer, file('image/png'));
      assert.equal(res.status, 500);
      assert.deepEqual(res.body, { status: false, message: 'Failed to upload profile picture' });
    } finally {
      failRestore();
    }
  });
});
