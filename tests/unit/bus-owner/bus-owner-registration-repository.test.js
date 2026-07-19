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
