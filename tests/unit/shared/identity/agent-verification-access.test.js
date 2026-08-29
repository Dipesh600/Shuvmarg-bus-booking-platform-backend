'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { isAgentVerificationCleared } = require('../../../../src/shared/identity/agent-verification');

test('isAgentVerificationCleared', async (t) => {
  await t.test('an OPERATOR agent clears at VERIFIED_BASIC', () => {
    assert.equal(
      isAgentVerificationCleared({ scope: 'OPERATOR', applicationStatus: 'VERIFIED_BASIC' }),
      true,
    );
  });

  await t.test('a PLATFORM agent does NOT clear at VERIFIED_BASIC', () => {
    // The status is not even legal for the scope. A platform agent sells any
    // operator's inventory, so a proven phone is not enough — they need the
    // reviewed document set that APPROVED stands for.
    assert.equal(
      isAgentVerificationCleared({ scope: 'PLATFORM', applicationStatus: 'VERIFIED_BASIC' }),
      false,
    );
  });

  await t.test('APPROVED clears at every scope — the rule this replaced', () => {
    assert.equal(
      isAgentVerificationCleared({ scope: 'PLATFORM', applicationStatus: 'APPROVED' }),
      true,
    );
    assert.equal(
      isAgentVerificationCleared({ scope: 'OPERATOR', applicationStatus: 'APPROVED' }),
      true,
    );
  });

  await t.test('a legacy OPERATOR_LINKED agent at APPROVED keeps its access', () => {
    // The regression this allowance exists to prevent. These rows are written by
    // the admin setup wizard, carry no `scope`, and reach /profile today. A
    // scope-only rule would resolve them to OPERATOR, find SELLABLE_KYC_STATUSES
    // .OPERATOR === ['VERIFIED_BASIC'], and 403 every one of them.
    assert.equal(
      isAgentVerificationCleared({ agentType: 'OPERATOR_LINKED', applicationStatus: 'APPROVED' }),
      true,
    );
  });

  await t.test('a legacy DEFAULT agent at APPROVED keeps its access', () => {
    assert.equal(
      isAgentVerificationCleared({ agentType: 'DEFAULT', applicationStatus: 'APPROVED' }),
      true,
    );
  });

  await t.test('no status in progress clears', () => {
    for (const applicationStatus of ['DRAFT', 'PHONE_VERIFIED', 'PENDING', 'MORE_INFO']) {
      for (const scope of ['OPERATOR', 'PLATFORM']) {
        assert.equal(
          isAgentVerificationCleared({ scope, applicationStatus }),
          false,
          `${scope}/${applicationStatus} must not clear`,
        );
      }
    }
  });

  await t.test('a closed account never clears, at either scope', () => {
    for (const scope of ['OPERATOR', 'PLATFORM']) {
      for (const applicationStatus of ['SUSPENDED', 'REJECTED']) {
        assert.equal(
          isAgentVerificationCleared({ scope, applicationStatus }),
          false,
          `${scope}/${applicationStatus} must not clear`,
        );
      }
    }
  });

  await t.test('an unreadable agent does not clear', () => {
    assert.equal(isAgentVerificationCleared(null), false);
    assert.equal(isAgentVerificationCleared(undefined), false);
    assert.equal(isAgentVerificationCleared({}), false);
    // An unrecognised scope falls back to PLATFORM, which demands APPROVED.
    assert.equal(
      isAgentVerificationCleared({ scope: 'GOD', applicationStatus: 'VERIFIED_BASIC' }),
      false,
    );
  });

  await t.test('a prototype key is not a status', () => {
    assert.equal(
      isAgentVerificationCleared({ scope: 'OPERATOR', applicationStatus: 'constructor' }),
      false,
    );
    assert.equal(
      isAgentVerificationCleared({ scope: 'constructor', applicationStatus: 'VERIFIED_BASIC' }),
      false,
    );
  });
});
