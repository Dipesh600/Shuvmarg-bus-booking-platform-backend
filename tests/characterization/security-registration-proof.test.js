'use strict';
process.env.SECRET_KEY = 'registration-proof-test-only-secret';
process.env.VERIFICATION_TOKEN_SECRET = 'registration-proof-test-only-verification-secret';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const fs = require('node:fs');
const db = require('../helpers/db');
const verification = require('../../utils/verificationToken');
const proof = require('../../src/shared/auth/registration-proof');
before(async () => { await db.connect(); await proof.ConsumedProof.init(); });
beforeEach(() => db.clearAll());
after(() => db.disconnect());
for (const purpose of ['REGISTRATION', 'AGENT_REGISTRATION', 'BUSOWNER_REGISTRATION']) {
  test(`${purpose}: exactly one of twenty concurrent completions can consume the proof`, async () => {
    const token = verification.issueVerificationToken('9810000101', purpose);
    const results = await Promise.allSettled(Array.from({ length: 20 }, () => proof.consume(token, '9810000101', purpose)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    for (const r of results.filter(r => r.status === 'rejected')) {
      assert.equal(r.reason.statusCode, 409); assert.equal(r.reason.responseBody.errorCode, 'VERIFICATION_ALREADY_USED');
    }
    const stored = await proof.ConsumedProof.findOne().lean();
    assert.ok(stored.expiresAt > new Date()); assert.equal(stored._id.includes(token), false);
    await proof.consume(verification.issueVerificationToken('9810000101', purpose), '9810000101', purpose);
  });
}
test('wrong phone, purpose and expired proofs do not consume storage', async () => {
  const token = verification.issueVerificationToken('9810000101', 'REGISTRATION');
  await assert.rejects(proof.consume(token, '9810000102', 'REGISTRATION'));
  await assert.rejects(proof.consume(token, '9810000101', 'AGENT_REGISTRATION'));
  const expired = jwt.sign({ phone: '9810000101', purpose: 'REGISTRATION', nonce: 'test' },
    process.env.VERIFICATION_TOKEN_SECRET, { expiresIn: -1 });
  await assert.rejects(proof.consume(expired, '9810000101', 'REGISTRATION'));
  assert.equal(await proof.ConsumedProof.countDocuments(), 0);
});
test('every completion flow reserves its proof before the first mutation', () => {
  for (const [path, mutation] of [
    ['auth/registration/complete-registration.service', 'const resolution = await _resolveReferral'],
    ['agent/auth/registration/agent-registration-completion.service', 'const savedUser ='],
    ['bus-owner/auth/registration/bus-owner-registration-completion.service', 'const savedUser ='],
  ]) {
    const source = fs.readFileSync(require.resolve(`../../src/modules/${path}`), 'utf8');
    assert.ok(source.indexOf('await registrationProof.consume(') < source.lastIndexOf(mutation));
  }
});
