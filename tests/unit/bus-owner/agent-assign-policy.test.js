'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../src/modules/bus-owner/agent-assign/bus-owner-agent-assign.policy');

const BRAND_ID = '507f1f77bcf86cd799439030';
const OWNER_ID = '507f1f77bcf86cd799439011';
const AGENT_ID = '507f1f77bcf86cd799439022';
const VALID_CODE = 'SM-AG-MAVSKNF';

const input = (over = {}) => ({ agentCode: VALID_CODE, brandId: BRAND_ID, ...over });

test('assign input validation', async (t) => {
  await t.test('accepts a code and a brand with no terms at all', () => {
    const result = policy.validateAssignInput(input());
    assert.deepEqual(result.errors, []);
    assert.equal(result.agentCode, VALID_CODE);
    assert.equal(result.brandId, BRAND_ID);
    // No terms supplied means nothing to store, so the schema defaults stand.
    assert.deepEqual(result.permissions, {});
    assert.equal(result.commission, undefined);
  });

  await t.test('trims surrounding whitespace from a pasted code', () => {
    assert.equal(policy.validateAssignInput(input({ agentCode: `  ${VALID_CODE} ` })).agentCode, VALID_CODE);
  });

  await t.test('requires both the code and the brand', () => {
    assert.match(policy.validateAssignInput(input({ agentCode: '' })).errors[0], /agentCode is required/);
    assert.match(policy.validateAssignInput(input({ brandId: '' })).errors[0], /brandId is required/);
    // Unlike the invite endpoint, where brandId is optional: an assignment names
    // the inventory it opens up.
    assert.match(policy.validateAssignInput({ agentCode: VALID_CODE }).errors[0], /brandId is required/);
  });

  await t.test('refuses a brandId that is not an id', () => {
    assert.match(policy.validateAssignInput(input({ brandId: 'brand-1' })).errors[0], /not a valid id/);
  });

  await t.test('survives a body that is not an object', () => {
    for (const body of [undefined, null, 'agentCode=X', 42]) {
      const result = policy.validateAssignInput(body);
      assert.equal(result.errors.length, 2);
    }
  });

  await t.test('a malformed code is not judged here — the lookup decides', () => {
    // Shape validation only. Whether the code exists, and whether its check
    // symbol is right, is settled by the code filter and the database.
    assert.deepEqual(policy.validateAssignInput(input({ agentCode: 'not-a-code' })).errors, []);
  });

  await t.test('collects every complaint rather than stopping at the first', () => {
    const result = policy.validateAssignInput({
      brandId: 'nope',
      accessScope: 'ROUTES',
      permissions: { canSellCash: 'yes' },
    });
    assert.ok(result.errors.length >= 4, `expected several errors, got ${result.errors.length}`);
  });
});

test('new assignment record', async (t) => {
  const now = new Date('2026-08-27T10:00:00.000Z');
  const build = (over = {}) => policy.newAssignment({
    agentId: AGENT_ID,
    brandId: BRAND_ID,
    ownerId: OWNER_ID,
    input: policy.validateAssignInput(input(over)),
    now,
  });

  await t.test('is INVITED, never ACTIVE', () => {
    const record = build();
    assert.equal(record.status, 'INVITED');
    assert.equal(record.invitedBy, OWNER_ID);
    assert.equal(record.invitedAt, now);
  });

  await t.test('expires seven days after the invite', () => {
    assert.equal(build().expiresAt.toISOString(), '2026-09-03T10:00:00.000Z');
  });

  await t.test('writes ownerId from the caller, not from the body', () => {
    const record = policy.newAssignment({
      agentId: AGENT_ID,
      brandId: BRAND_ID,
      ownerId: OWNER_ID,
      input: policy.validateAssignInput(input({ ownerId: 'someone-else', status: 'ACTIVE' })),
      now,
    });
    assert.equal(record.ownerId, OWNER_ID);
    assert.equal(record.status, 'INVITED');
  });

  await t.test('names the brand as the operator', () => {
    assert.equal(build().operatorId, BRAND_ID);
    assert.equal(build().agentId, AGENT_ID);
  });

  await t.test('omits permissions and commission when none were chosen', () => {
    const record = build();
    assert.ok(!('permissions' in record), 'permissions must be absent so schema defaults apply');
    assert.ok(!('operatorCommission' in record), 'commission must be absent so schema defaults apply');
  });

  await t.test('carries the terms that were chosen', () => {
    const record = build({
      accessScope: 'ROUTES',
      allowedRouteIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'],
      permissions: { canSellOnline: false },
      commission: { mode: 'FLAT_PER_SEAT', value: 50 },
    });
    assert.equal(record.accessScope, 'ROUTES');
    assert.deepEqual(record.allowedRouteIds, ['aaaaaaaaaaaaaaaaaaaaaaaa']);
    assert.deepEqual(record.permissions, { canSellOnline: false });
    assert.deepEqual(record.operatorCommission, { mode: 'FLAT_PER_SEAT', value: 50 });
  });

  await t.test('carries no timestamps beyond the invite ones', () => {
    const record = build();
    for (const field of ['acceptedAt', 'declinedAt', 'revokedAt', 'suspendedAt', 'revokedBy']) {
      assert.ok(!(field in record), `${field} must not be settable at invite time`);
    }
  });
});
