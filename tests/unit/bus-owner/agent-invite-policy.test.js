'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.policy');
const mapper = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.mapper');

test('operator agent create input', async (t) => {
  await t.test('name and phone are the whole required set', () => {
    const result = policy.validateCreateInput({ name: 'Ram Bahadur', phone: '9800000000' });
    assert.deepEqual(result.errors, []);
    assert.equal(result.name, 'Ram Bahadur');
    assert.equal(result.phone, '9800000000');
    assert.equal(result.outletType, null);
  });

  await t.test('name is required', () => {
    for (const body of [{}, { name: '' }, { name: '   ' }, { name: 42 }]) {
      const result = policy.validateCreateInput({ ...body, phone: '9800000000' });
      assert.ok(result.errors.includes('name is required.'), JSON.stringify(body));
    }
  });

  await t.test('phone is required', () => {
    for (const body of [{}, { phone: '' }, { phone: '  ' }, { phone: null }]) {
      const result = policy.validateCreateInput({ name: 'Ram Bahadur', ...body });
      assert.ok(result.errors.includes('phone is required.'), JSON.stringify(body));
    }
  });

  await t.test('name has a minimum and a maximum length', () => {
    assert.match(
      policy.validateCreateInput({ name: 'Ab', phone: '9800000000' }).errors[0],
      /at least 3 characters/,
    );
    assert.match(
      policy.validateCreateInput({
        name: 'x'.repeat(policy.MAX_NAME_LENGTH + 1),
        phone: '9800000000',
      }).errors[0],
      /200 characters or fewer/,
    );
  });

  await t.test('name and phone are trimmed', () => {
    const result = policy.validateCreateInput({ name: '  Ram  ', phone: ' 9800000000 ' });
    assert.equal(result.name, 'Ram');
    assert.equal(result.phone, '9800000000');
  });

  await t.test('outletType is optional but must be recognised when present', () => {
    assert.deepEqual(
      policy.validateCreateInput({ name: 'Ram Bahadur', phone: '9800000000', outletType: 'HOTEL' }).errors,
      [],
    );
    assert.deepEqual(
      policy.validateCreateInput({
        name: 'Ram Bahadur', phone: '9800000000', outletType: 'ticket_counter',
      }).errors,
      ['outletType is not a recognised outlet type.'],
    );
  });

  await t.test('nothing identity-bearing can be supplied by the owner', () => {
    // The owner supplies a name and a number. PAN, citizenship and bank details
    // belong to the agent, and we never need them: the operator pays them.
    const result = policy.validateCreateInput({
      name: 'Ram Bahadur',
      phone: '9800000000',
      panNumber: '123456789',
      citizenshipNumber: '12-34-56',
      bankAccountNumber: '0011002200',
      scope: 'PLATFORM',
      applicationStatus: 'APPROVED',
      code: 'SM-AG-HACKED',
      commissionRate: 40,
    });
    assert.deepEqual(Object.keys(result).sort(), ['errors', 'name', 'outletType', 'phone']);
  });

  await t.test('a non-object body yields required-field errors, not a crash', () => {
    for (const body of [undefined, null, 'x', 42, []]) {
      const result = policy.validateCreateInput(body);
      assert.equal(result.errors.length, 2, JSON.stringify(body));
    }
  });

  await t.test('prototype keys do not satisfy required fields', () => {
    const hostile = JSON.parse('{"__proto__":{"name":"pwned","phone":"9800000000"}}');
    const result = policy.validateCreateInput(hostile);
    assert.equal(result.errors.length, 2);
  });
});

test('Nepal mobile validation', async (t) => {
  await t.test('accepts 98 and 97 ten-digit numbers', () => {
    for (const phone of ['9800000000', '9741234567', '9851234567', '9861234567']) {
      assert.equal(policy.isValidNepalMobile(phone), true, phone);
    }
  });

  await t.test('rejects landlines, wrong lengths and other prefixes', () => {
    for (const phone of [
      '9600000000', '014567890', '980000000', '98000000000', '', 'abcdefghij',
      '98000000ab', '+9779800000000', '977-9800000000', '9800000000 ',
    ]) {
      assert.equal(policy.isValidNepalMobile(phone), false, JSON.stringify(phone));
    }
  });

  await t.test('rejects null and undefined without throwing', () => {
    assert.equal(policy.isValidNepalMobile(null), false);
    assert.equal(policy.isValidNepalMobile(undefined), false);
  });
});

test('the invited User', async (t) => {
  const now = new Date('2026-01-01T00:00:00.000Z');
  const built = () => policy.invitedAgentUser({
    name: 'Ram Bahadur',
    phone: '9800000000',
    hashedPassword: '$2a$12$abcdefghijklmnopqrstuv',
    now,
  });

  await t.test('starts at status "invited", which login refuses', () => {
    // This is the security boundary: the owner chose the password, so the
    // account must be unusable until the agent activates it themselves.
    assert.equal(built().status, 'invited');
    assert.notEqual(built().status, 'active');
  });

  await t.test('is flagged to force a password change', () => {
    assert.equal(built().forcePasswordChange, true);
  });

  await t.test('is not treated as verified on the owner\'s word', () => {
    // The owner typed the number. The agent has not proved they hold it.
    assert.equal(built().phoneVerified, false);
    assert.equal(built().isVerified, false);
  });

  await t.test('holds the agent role and only the agent role', () => {
    assert.deepEqual(built().roles, ['agent']);
    assert.equal(built().role, 'agent');
  });

  await t.test('stores the hash it was given, never a plaintext password', () => {
    assert.equal(built().password, '$2a$12$abcdefghijklmnopqrstuv');
    assert.equal(Object.hasOwn(built(), 'tempPassword'), false);
  });
});

test('the new Agent identity', async (t) => {
  const built = () => policy.newOperatorAgent({
    userId: '507f1f77bcf86cd799439013',
    ownerId: '507f1f77bcf86cd799439011',
    outletType: 'TICKET_COUNTER',
  });

  await t.test('is OPERATOR scope at DRAFT', () => {
    assert.equal(built().scope, 'OPERATOR');
    // DRAFT, not PHONE_VERIFIED: no proof of the phone has happened yet.
    assert.equal(built().applicationStatus, 'DRAFT');
  });

  await t.test('records provenance but no selling right', () => {
    assert.equal(built().createdByOwnerId, '507f1f77bcf86cd799439011');
    // No linkedOperatorId, no commission: those are terms of an assignment.
    assert.equal(Object.hasOwn(built(), 'linkedOperatorId'), false);
    assert.equal(Object.hasOwn(built(), 'commissionRate'), false);
    assert.equal(Object.hasOwn(built(), 'busAccessScope'), false);
  });

  await t.test('never presets a code — the model hook allocates it', () => {
    assert.equal(Object.hasOwn(built(), 'code'), false);
    assert.equal(Object.hasOwn(built(), 'agentId'), false);
  });
});

test('invite SMS', async (t) => {
  const body = (brandName) => policy.smsBody({
    name: 'Ram Bahadur',
    phone: '9800000000',
    tempPassword: 'A1B2C3D4E5', // ggignore
    brandName,
  });

  await t.test('carries the phone and the temp password', () => {
    assert.match(body(), /9800000000/);
    assert.match(body(), /A1B2C3D4E5/);
  });

  await t.test('names the brand when there is one, and omits it cleanly when not', () => {
    assert.match(body('Kaski Yatayat'), /by Kaski Yatayat/);
    assert.doesNotMatch(body(), /by undefined|by null/);
  });

  await t.test('tells the agent to change the password', () => {
    assert.match(body(), /change your password/i);
  });
});

test('create response', async (t) => {
  const built = (overrides = {}) => mapper.toCreatedResponse({
    agent: {
      _id: '507f1f77bcf86cd799439020',
      code: 'SM-AG-7K4QP2X',
      agentId: 'SHV-AG-KTM-001',
      scope: 'OPERATOR',
      outletType: 'TICKET_COUNTER',
      applicationStatus: 'DRAFT',
    },
    userId: '507f1f77bcf86cd799439013',
    name: 'Ram Bahadur',
    phone: '9800000000',
    brand: null,
    isUpgrade: false,
    smsSent: true,
    ...overrides,
  });

  await t.test('returns the agent code — the point of the call', () => {
    assert.equal(built().data.agentCode, 'SM-AG-7K4QP2X');
  });

  await t.test('never returns the temp password', () => {
    const serialised = JSON.stringify(built());
    assert.doesNotMatch(serialised, /tempPassword|password/i);
  });

  await t.test('flags that the agent, not the owner, must activate', () => {
    assert.equal(built().data.requiresAgentActivation, true);
    // An existing account is already activated, so there is nothing to wait for.
    assert.equal(built({ isUpgrade: true }).data.requiresAgentActivation, false);
  });

  await t.test('reports SMS delivery honestly', () => {
    assert.equal(built({ smsSent: false }).data.smsSent, false);
    // The code is still returned, so a failed SMS is recoverable by the owner.
    assert.equal(built({ smsSent: false }).data.agentCode, 'SM-AG-7K4QP2X');
  });

  await t.test('includes the brand only when one was verified', () => {
    assert.equal(built().data.brand, null);
    assert.deepEqual(
      built({ brand: { _id: '507f1f77bcf86cd799439030', name: 'Kaski Yatayat' } }).data.brand,
      { id: '507f1f77bcf86cd799439030', name: 'Kaski Yatayat' },
    );
  });
});
