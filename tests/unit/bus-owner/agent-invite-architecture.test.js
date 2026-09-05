'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const moduleDir = path.join(ROOT, 'src/modules/bus-owner/agent-invite');
const sources = fs.readdirSync(moduleDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(moduleDir, name), 'utf8'))
  .join('\n');

test('X3 owner creation has no KYC-review, wallet, settlement or commission writer', () => {
  for (const forbidden of [
    'agent-kyc-review', 'agentWallet', 'agentSettlement', 'commissionAmount',
  ]) assert.equal(sources.includes(forbidden), false, forbidden);
});

test('X5 the existing create repository uses save so code hooks run', () => {
  const repository = fs.readFileSync(path.join(moduleDir, 'bus-owner-agent-invite.repository.js'), 'utf8');
  assert.match(repository, /new Agent\(agentData\)\.save\(\{ session \}\)/);
  assert.equal(repository.includes('insertMany'), false);
});

test('X2 client fields never become policy output and deprecated agentType is not read', () => {
  const policy = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.policy');
  const result = policy.validateCreateInput({
    name: 'Ram Bahadur', phone: '9800000000', outletType: 'SOLO', district: 'Kaski',
    municipality: 'Pokhara', placeName: 'Lakeside', scope: 'PLATFORM',
    applicationStatus: 'APPROVED', agentType: 'DEFAULT', isPermanentlyRejected: true,
    agentCode: 'SM-AG-HACKED', code: 'SM-AG-HACKED', adminNotes: 'elevate me',
  });
  for (const field of [
    'scope', 'applicationStatus', 'agentType', 'isPermanentlyRejected',
    'agentCode', 'code', 'adminNotes',
  ]) {
    assert.equal(Object.hasOwn(result, field), false);
  }
  assert.equal(sources.includes('agent.kycStatus'), false);
});

test('placeName only tightens OPERATOR derivation, not PLATFORM registration', () => {
  const verification = require('../../../src/shared/identity/agent-verification');
  assert.equal(verification.REQUIRED_OUTLET_FIELDS.includes('placeName'), true);
  assert.equal(verification.deriveOperatorKycStatus({
    scope: 'PLATFORM', applicationStatus: 'DRAFT', placeName: null,
  }, { phoneVerified: true }), null);
});
