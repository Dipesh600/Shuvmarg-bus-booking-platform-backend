'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../../../models/userModel');
const Agent = require('../../../models/agentModel');
const OTP = require('../../../models/otpModel');
const PartnerLead = require('../../../models/PartnerLead');
const repository = require('../../../src/modules/agent/auth/registration/agent-registration.repository');
const leadRepository = require('../../../src/modules/agent/auth/registration/agent-registration-lead.repository');

const patch = (obj, key, fn) => {
  const old = obj[key];
  obj[key] = fn;
  return () => { obj[key] = old; };
};

test('agent-registration repository preserves exact query contracts', async () => {
  const calls = [];
  const restores = [
    patch(Agent, 'findOne', (filter) => {
      calls.push(['agent-find', filter]);
      return { select: (s) => ({ lean: () => { calls.push(['select-lean', s]); return 'agent'; } }) };
    }),
    patch(OTP, 'findOne', (filter) => { calls.push(['otp', filter]); return 'otp'; }),
    patch(User, 'findOne', (filter) => { calls.push(['email', filter]); return 'user'; }),
    patch(User, 'findByIdAndUpdate', (...args) => { calls.push(['upgrade', ...args]); return 'up'; }),
    patch(Agent, 'findOneAndUpdate', (...args) => { calls.push(['agent-upsert', ...args]); return 'doc'; }),
    patch(PartnerLead, 'findOneAndUpdate', (...args) => { calls.push(['lead-upsert', ...args]); return 'lead'; }),
    patch(PartnerLead, 'updateMany', (...args) => { calls.push(['lead-convert', ...args]); return 'lead2'; }),
  ];
  try {
    assert.equal(repository.findAgentIdByUser('u1'), 'agent');
    assert.equal(repository.findConsumedOtp('p'), 'otp');
    assert.equal(repository.findUserByEmail('e'), 'user');
    const d = new Date('2026-01-01T00:00:00Z');
    repository.upgradeUserToAgent('u2', 'hash', d);
    repository.upsertAgentProfile('u3');
    leadRepository.upsertOtpVerifiedLead('p');
    leadRepository.convertOtpVerifiedLead('p', 'Name');
    assert.deepEqual(calls[0], ['agent-find', { user: 'u1' }]);
    assert.deepEqual(calls[1], ['select-lean', '_id']);
    assert.deepEqual(calls[2], ['otp', { phone: 'p', purpose: 'AGENT_REGISTRATION', isUsed: true }]);
    assert.deepEqual(calls[3], ['email', { email: 'e' }]);
    assert.deepEqual(calls[4], ['upgrade', 'u2', {
      $addToSet: { roles: 'agent' },
      $set: { 'roleActivatedAt.agent': d, password: 'hash' },
    }, { new: true }]);
    assert.deepEqual(calls[5], ['agent-upsert', { user: 'u3' }, {
      $setOnInsert: { user: 'u3', applicationStatus: 'DRAFT' },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }]);
    assert.equal(calls[6][0], 'lead-upsert');
    assert.equal(calls[7][0], 'lead-convert');
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
