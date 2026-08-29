'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const enums = require('../../../../src/shared/identity/agent-enums');

test('agent enums vocabulary', async (t) => {
  await t.test('scopes are exactly PLATFORM and OPERATOR', () => {
    assert.deepEqual(Object.keys(enums.AGENT_SCOPES).sort(), ['OPERATOR', 'PLATFORM']);
    assert.equal(enums.AGENT_SCOPES.PLATFORM, 'PLATFORM');
    assert.equal(enums.AGENT_SCOPES.OPERATOR, 'OPERATOR');
  });

  await t.test('enum objects are frozen so a caller cannot add a scope at runtime', () => {
    assert.throws(() => { enums.AGENT_SCOPES.GOD = 'GOD'; }, TypeError);
    assert.throws(() => { enums.OUTLET_TYPES.X = 'X'; }, TypeError);
    assert.equal(enums.AGENT_SCOPES.GOD, undefined);
  });

  await t.test('isAgentScope accepts known scopes and rejects everything else', () => {
    assert.equal(enums.isAgentScope('PLATFORM'), true);
    assert.equal(enums.isAgentScope('OPERATOR'), true);
    assert.equal(enums.isAgentScope('platform'), false);
    assert.equal(enums.isAgentScope(''), false);
    assert.equal(enums.isAgentScope(null), false);
    assert.equal(enums.isAgentScope(undefined), false);
  });

  await t.test('prototype keys are not scopes — Map lookup, not object lookup', () => {
    // On a plain object these resolve truthy off the prototype chain, which is
    // how a validator becomes a bypass.
    assert.equal(enums.isAgentScope('constructor'), false);
    assert.equal(enums.isAgentScope('__proto__'), false);
    assert.equal(enums.isAgentScope('toString'), false);
    assert.equal(enums.isOutletType('constructor'), false);
    assert.equal(enums.isOutletType('__proto__'), false);
  });

  await t.test('outlet types cover the five shopfronts, SOLO not "individual"', () => {
    assert.deepEqual(
      Object.keys(enums.OUTLET_TYPES).sort(),
      ['HOTEL', 'MOBILE_SHOP', 'SOLO', 'TICKET_COUNTER', 'TRAVEL_AGENCY'],
    );
    assert.equal(enums.isOutletType('SOLO'), true);
    assert.equal(enums.isOutletType('individual'), false);
  });
});

test('agent KYC state machines', async (t) => {
  await t.test('the enum is the union of both scope machines', () => {
    const union = Object.values(enums.KYC_STATUSES).sort();
    const combined = [...new Set([
      ...enums.SCOPE_KYC_STATUSES.OPERATOR,
      ...enums.SCOPE_KYC_STATUSES.PLATFORM,
    ])].sort();
    assert.deepEqual(union, combined);
  });

  await t.test('both machines start at DRAFT and can end at SUSPENDED', () => {
    for (const scope of ['OPERATOR', 'PLATFORM']) {
      assert.ok(enums.SCOPE_KYC_STATUSES[scope].includes('DRAFT'), `${scope} DRAFT`);
      assert.ok(enums.SCOPE_KYC_STATUSES[scope].includes('SUSPENDED'), `${scope} SUSPENDED`);
    }
  });

  await t.test('a PLATFORM status is illegal on an OPERATOR agent and vice versa', () => {
    assert.equal(enums.isKycStatusLegalForScope('OPERATOR', 'VERIFIED_BASIC'), true);
    assert.equal(enums.isKycStatusLegalForScope('OPERATOR', 'APPROVED'), false);
    assert.equal(enums.isKycStatusLegalForScope('OPERATOR', 'PENDING'), false);
    assert.equal(enums.isKycStatusLegalForScope('PLATFORM', 'APPROVED'), true);
    assert.equal(enums.isKycStatusLegalForScope('PLATFORM', 'VERIFIED_BASIC'), false);
  });

  await t.test('an unknown scope makes every status illegal, not every status legal', () => {
    assert.equal(enums.isKycStatusLegalForScope('WHATEVER', 'APPROVED'), false);
    assert.equal(enums.isKycStatusLegalForScope(null, 'DRAFT'), false);
    assert.equal(enums.isKycStatusLegalForScope('__proto__', 'DRAFT'), false);
  });

  await t.test('exactly one status per scope clears an agent to sell', () => {
    assert.deepEqual([...enums.SELLABLE_KYC_STATUSES.OPERATOR], ['VERIFIED_BASIC']);
    assert.deepEqual([...enums.SELLABLE_KYC_STATUSES.PLATFORM], ['APPROVED']);
  });

  await t.test('isKycSellable is deny-by-default', () => {
    assert.equal(enums.isKycSellable('OPERATOR', 'VERIFIED_BASIC'), true);
    assert.equal(enums.isKycSellable('PLATFORM', 'APPROVED'), true);
    // Every other combination, including the cross-scope ones.
    assert.equal(enums.isKycSellable('OPERATOR', 'APPROVED'), false);
    assert.equal(enums.isKycSellable('PLATFORM', 'VERIFIED_BASIC'), false);
    assert.equal(enums.isKycSellable('OPERATOR', 'DRAFT'), false);
    assert.equal(enums.isKycSellable('OPERATOR', 'SUSPENDED'), false);
    assert.equal(enums.isKycSellable('PLATFORM', 'SUSPENDED'), false);
    assert.equal(enums.isKycSellable(undefined, undefined), false);
    assert.equal(enums.isKycSellable('__proto__', 'APPROVED'), false);
  });
});

test('legacy dual-read', async (t) => {
  await t.test('scopeOf prefers the new field and falls back to agentType', () => {
    assert.equal(enums.scopeOf({ scope: 'OPERATOR', agentType: 'DEFAULT' }), 'OPERATOR');
    assert.equal(enums.scopeOf({ agentType: 'OPERATOR_LINKED' }), 'OPERATOR');
    assert.equal(enums.scopeOf({ agentType: 'DEFAULT' }), 'PLATFORM');
  });

  await t.test('scopeOf defaults an unrecognised or empty agent to PLATFORM', () => {
    // PLATFORM is the schema default, so an old row with neither field reads as
    // what it has always been.
    assert.equal(enums.scopeOf({}), 'PLATFORM');
    assert.equal(enums.scopeOf(null), 'PLATFORM');
    assert.equal(enums.scopeOf({ agentType: 'NONSENSE' }), 'PLATFORM');
    assert.equal(enums.scopeOf({ scope: 'NONSENSE' }), 'PLATFORM');
  });

  await t.test('outletTypeOf maps every legacy operationType', () => {
    assert.equal(enums.outletTypeOf({ operationType: 'ticket_counter' }), 'TICKET_COUNTER');
    assert.equal(enums.outletTypeOf({ operationType: 'travel_agent' }), 'TRAVEL_AGENCY');
    assert.equal(enums.outletTypeOf({ operationType: 'mobile_shop' }), 'MOBILE_SHOP');
    assert.equal(enums.outletTypeOf({ operationType: 'hotel' }), 'HOTEL');
    assert.equal(enums.outletTypeOf({ operationType: 'individual' }), 'SOLO');
  });

  await t.test('"other" has no outlet equivalent and maps to null, not a guess', () => {
    assert.equal(enums.outletTypeOf({ operationType: 'other' }), null);
    assert.equal(enums.outletTypeOf({}), null);
    assert.equal(enums.outletTypeOf(null), null);
    assert.equal(enums.outletTypeOf({ operationType: '__proto__' }), null);
  });

  await t.test('outletTypeOf prefers the new field', () => {
    assert.equal(
      enums.outletTypeOf({ outletType: 'HOTEL', operationType: 'ticket_counter' }),
      'HOTEL',
    );
  });
});
