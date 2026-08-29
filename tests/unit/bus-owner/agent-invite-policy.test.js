'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const policy = require('../../../src/modules/bus-owner/agent-invite/bus-owner-agent-invite.policy');

test('operator agent create input', async (t) => {
  const valid = {
    name: 'Ram Bahadur', phone: '9800000000', outletType: 'SOLO',
    district: 'Kathmandu', municipality: 'Kathmandu Metropolitan', placeName: 'Kalanki',
  };

  await t.test('X4 name, phone and complete place are the required set', () => {
    const result = policy.validateCreateInput(valid);
    assert.deepEqual(result.errors, []);
    assert.equal(result.name, 'Ram Bahadur');
    assert.equal(result.phone, '9800000000');
    assert.equal(result.outletType, 'SOLO');
    assert.equal(result.placeName, 'Kalanki');
  });

  await t.test('name is required', () => {
    for (const body of [{ name: undefined }, { name: '' }, { name: '   ' }, { name: 42 }]) {
      const result = policy.validateCreateInput({ ...valid, ...body });
      assert.ok(result.errors.includes('name is required.'), JSON.stringify(body));
    }
  });

  await t.test('phone is required', () => {
    for (const body of [{ phone: undefined }, { phone: '' }, { phone: '  ' }, { phone: null }]) {
      const result = policy.validateCreateInput({ ...valid, ...body });
      assert.ok(result.errors.includes('phone is required.'), JSON.stringify(body));
    }
  });

  await t.test('name has a minimum and a maximum length', () => {
    assert.match(
      policy.validateCreateInput({ ...valid, name: 'Ab' }).errors[0],
      /at least 3 characters/,
    );
    assert.match(
      policy.validateCreateInput({
        ...valid, name: 'x'.repeat(policy.MAX_NAME_LENGTH + 1),
      }).errors[0],
      /200 characters or fewer/,
    );
  });

  await t.test('name and phone are trimmed', () => {
    const result = policy.validateCreateInput({ ...valid, name: '  Ram  ', phone: ' 9800000000 ' });
    assert.equal(result.name, 'Ram');
    assert.equal(result.phone, '9800000000');
  });

  await t.test('X4 every place field is mandatory and outletType is recognised', () => {
    for (const field of ['outletType', 'district', 'municipality', 'placeName']) {
      const result = policy.validateCreateInput({ ...valid, [field]: '' });
      assert.ok(result.errors.includes(`${field} is required.`), field);
    }
    assert.deepEqual(
      policy.validateCreateInput({
        ...valid, outletType: 'ticket_counter',
      }).errors,
      ['outletType is not a recognised outlet type.'],
    );
  });

  await t.test('nothing identity-bearing can be supplied by the owner', () => {
    // The owner supplies a name and a number. PAN, citizenship and bank details
    // belong to the agent, and we never need them: the operator pays them.
    const result = policy.validateCreateInput({
      ...valid,
      panNumber: '123456789',
      citizenshipNumber: '12-34-56',
      bankAccountNumber: '0011002200',
      scope: 'PLATFORM',
      applicationStatus: 'APPROVED',
      code: 'SM-AG-HACKED',
      commissionRate: 40,
    });
    assert.deepEqual(Object.keys(result).sort(), [
      'district', 'errors', 'municipality', 'name', 'outletType', 'phone', 'placeName',
    ]);
  });

  await t.test('a non-object body yields required-field errors, not a crash', () => {
    for (const body of [undefined, null, 'x', 42, []]) {
      const result = policy.validateCreateInput(body);
      assert.equal(result.errors.length, 6, JSON.stringify(body));
    }
  });

  await t.test('prototype keys do not satisfy required fields', () => {
    const hostile = JSON.parse('{"__proto__":{"name":"pwned","phone":"9800000000"}}');
    const result = policy.validateCreateInput(hostile);
    assert.equal(result.errors.length, 6);
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
