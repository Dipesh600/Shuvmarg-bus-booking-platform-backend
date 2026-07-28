'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration.repository');
const leadRepository = require('../../../src/modules/bus-owner/auth/registration/bus-owner-registration-lead.repository');
const User = require('../../../models/userModel');
const BusOwner = require('../../../models/busOwnerModel');
const OTP = require('../../../models/otpModel');
const PartnerLead = require('../../../models/PartnerLead');

const patch = (obj, name, fn, restores) => {
  const orig = obj[name];
  obj[name] = fn;
  restores.push(() => { obj[name] = orig; });
};

test('bus-owner registration repositories preserve exact query contracts', async (t) => {
  await t.test('OTP, email, upgrade and BusOwner lookup queries', async () => {
    const restores = [];
    const calls = [];
    patch(OTP, 'findOne', (q) => calls.push(['otp', q]), restores);
    patch(User, 'findOne', (q) => calls.push(['email', q]), restores);
    patch(User, 'findByIdAndUpdate', (...args) => calls.push(['upgrade', args]), restores);
    patch(BusOwner, 'findOne', (q) => calls.push(['profile', q]), restores);
    try {
      repository.findConsumedOtp('p');
      repository.findUserByEmail('e');
      repository.upgradeUserToBusOwner('id', 'now');
      repository.findBusOwnerByUser('id');
      assert.deepEqual(calls, [
        ['otp', { phone: 'p', purpose: 'BUSOWNER_REGISTRATION', isUsed: true }],
        ['email', { email: 'e' }],
        ['upgrade', ['id', {
          $addToSet: { roles: 'busOwner' },
          $set: { 'roleActivatedAt.busOwner': 'now' },
        }, { new: true }]],
        ['profile', { user: 'id' }],
      ]);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('lead repository exact upsert and conversion queries', () => {
    const restores = [];
    const calls = [];
    patch(PartnerLead, 'findOneAndUpdate', (...args) => calls.push(['upsert', args]), restores);
    patch(PartnerLead, 'updateMany', (...args) => calls.push(['convert', args]), restores);
    try {
      leadRepository.upsertOtpVerifiedLead('p');
      leadRepository.convertOtpVerifiedLead('p');
      assert.deepEqual(calls[0], ['upsert', [{
        phone: 'p',
        leadType: 'otp_verified',
        entityType: 'busOwner',
      }, {
        phone: 'p',
        leadType: 'otp_verified',
        entityType: 'busOwner',
        phoneVerified: true,
        source: 'busowner_app',
        $setOnInsert: { status: 'new' },
      }, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }]]);
      assert.deepEqual(calls[1], ['convert', [{
        phone: 'p',
        leadType: 'otp_verified',
        entityType: 'busOwner',
      }, { $set: { status: 'converted' } }]]);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});

// ── New password-guard repository operations ──────────────────────────────────

test('bus-owner registration repositories — passwordless upgrade operations', async (t) => {
  await t.test('R1: hasUsablePassword uses User.exists with correct password filter', () => {
    const restores = [];
    const calls = [];
    patch(User, 'exists', (q) => { calls.push(q); return Promise.resolve(null); }, restores);
    try {
      repository.hasUsablePassword('user-abc');
      assert.deepEqual(calls[0], {
        _id: 'user-abc',
        password: { $exists: true, $type: 'string', $ne: '' },
      });
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('R2: upgradePasswordlessUserToBusOwner uses conditional passwordless filter', () => {
    const restores = [];
    const calls = [];
    patch(User, 'findOneAndUpdate', (...args) => { calls.push(args); return null; }, restores);
    const now = new Date('2025-06-01');
    try {
      repository.upgradePasswordlessUserToBusOwner({
        userId: 'uid-p',
        hashedPassword: 'hashed!',
        activatedAt: now,
      });
      const [filter, update, options] = calls[0];
      // Filter must target the specific user AND verify it is passwordless
      assert.equal(filter._id, 'uid-p');
      assert.ok(Array.isArray(filter.$or), '$or must be present to guard against overwriting');
      // $or must include all three passwordless forms
      const conditions = filter.$or.map(JSON.stringify);
      assert.ok(conditions.some((c) => c.includes('"$exists":false')), '$exists:false must be a condition');
      assert.ok(conditions.some((c) => c.includes('"null"') || c.includes('null')), 'null must be a condition');
      // Update must set password AND role in one operation
      assert.deepEqual(update.$addToSet, { roles: 'busOwner' });
      assert.equal(update.$set.password, 'hashed!');
      assert.deepEqual(update.$set['roleActivatedAt.busOwner'], now);
      assert.equal(options.new, true);
    } finally { restores.reverse().forEach((fn) => fn()); }
  });

  await t.test('R3: upgradePasswordlessUserToBusOwner does NOT use findByIdAndUpdate (no password guard)', () => {
    // findByIdAndUpdate has no filter for passwordless state — it would overwrite any existing hash.
    // Confirm the repository uses findOneAndUpdate with the conditional filter instead.
    const calls = [];
    const restores = [];
    patch(User, 'findByIdAndUpdate', (...args) => {
      calls.push(args);
      return null;
    }, restores);
    patch(User, 'findOneAndUpdate', (...args) => null, restores);
    try {
      repository.upgradePasswordlessUserToBusOwner({
        userId: 'uid-q',
        hashedPassword: 'h',
        activatedAt: new Date(),
      });
      assert.equal(calls.length, 0, 'findByIdAndUpdate must NOT be used for passwordless upgrade');
    } finally { restores.reverse().forEach((fn) => fn()); }
  });
});
