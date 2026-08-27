'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/modules/bus-owner/agent-assignment-options/agent-assignment-options.mapper');
const parse = require('../../../src/modules/bus-owner/agent-assignment-options/agent-assignment-options.parse');
const repository = require('../../../src/modules/bus-owner/agent-assignment-options/agent-assignment-options.repository');
const service = require('../../../src/modules/bus-owner/agent-assignment-options/agent-assignment-options.service');

const OWNER = '507f1f77bcf86cd799439011';
const BRAND = '507f1f77bcf86cd799439012';

test('assignment options reject malformed brands before any database call', async () => {
  const original = repository.findOwnedBrand;
  let calls = 0;
  repository.findOwnedBrand = async () => { calls += 1; };
  try {
    assert.ok(parse.parseQuery({}).errors.length);
    assert.ok(parse.parseQuery({ brandId: 'attacker' }).errors.length);
    assert.deepEqual(parse.parseQuery({ brandId: BRAND }), { brandId: BRAND, errors: [] });
    await assert.rejects(service.listOptions(OWNER, { brandId: 'attacker' }), (error) => {
      assert.equal(error.statusCode, 400);
      return true;
    });
    assert.equal(calls, 0);
  } finally {
    repository.findOwnedBrand = original;
  }
});

test('assignment option queries pin both brand and token owner', () => {
  assert.deepEqual(repository.findOwnedBrand(OWNER, BRAND).getFilter(), {
    _id: BRAND, ownerId: OWNER,
  });
  assert.deepEqual(repository.findActiveSchedules(OWNER, BRAND).getFilter(), {
    ownerId: OWNER, brandId: BRAND, status: 'ACTIVE',
  });
});

test('route choices come from modern schedule variants and are deduplicated', () => {
  const variant = { _id: 'variant-1', code: 'KTM-PKR-01', name: 'Via Muglin', direction: 'FORWARD' };
  const schedules = [
    { _id: 'schedule-1', variantId: variant, busId: { _id: 'bus-1', busName: 'A', busNumber: '1' },
      departureTime: '07:00', arrivalTime: '13:00', recurrence: 'DAILY', daysOfWeek: [] },
    { _id: 'schedule-2', variantId: variant, busId: { _id: 'bus-2', busName: 'B', busNumber: '2' },
      departureTime: '08:00', arrivalTime: '14:00', recurrence: 'DAILY', daysOfWeek: [] },
  ];
  const response = mapper.toResponse({ brand: { _id: BRAND, brandName: 'Sajha' }, schedules });
  assert.equal(response.data.routes.length, 1);
  assert.equal(response.data.routes[0].id, 'variant-1');
  assert.equal(response.data.schedules.length, 2);
});
