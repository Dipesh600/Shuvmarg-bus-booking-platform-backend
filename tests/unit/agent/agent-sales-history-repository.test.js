'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../../../src/shared/agent-sales/agent-sales.repository');

const AGENT = '507f1f77bcf86cd799439011';
const BRAND_A = '507f1f77bcf86cd799439012';

test('Y1 AgentBooking agentId is the first sales predicate', () => {
  const pipeline = repository.salePipeline({ agentId: AGENT, page: 1, limit: 20 });
  assert.equal(String(pipeline[0].$match.agentId), AGENT);
  assert.equal(pipeline[1].$lookup.from, 'bookings');
  assert.equal(pipeline[1].$lookup.pipeline[0].$match.bookedVia, 'AGENT');
  const projection = pipeline.find((stage) => stage.$project)?.$project;
  for (const forbidden of ['ownerId', 'adminNotes', 'commissionAmount', 'settlementId']) {
    assert.equal(projection[forbidden], undefined);
  }
});

test('Y2 operator brand scope is applied to both Booking and Trip joins before pagination', () => {
  const pipeline = repository.salePipeline({
    agentId: AGENT, brandIds: [BRAND_A], page: 1, limit: 20,
  });
  const bookingMatch = pipeline[1].$lookup.pipeline[0].$match;
  const tripMatch = pipeline[3].$lookup.pipeline[0].$match;
  assert.deepEqual(bookingMatch.brandId.$in.map(String), [BRAND_A]);
  assert.deepEqual(tripMatch.brandId.$in.map(String), [BRAND_A]);
  assert.ok(pipeline.findIndex((stage) => stage.$facet) > 3);
});

test('Y4 customer identity is exactly passengerName plus passengerPhone', () => {
  const pipeline = repository.customerPipeline({ agentId: AGENT, page: 1, limit: 20 });
  const group = pipeline.find((stage) => stage.$group).$group;
  assert.deepEqual(group._id, { name: '$passengerName', phone: '$passengerPhone' });
  assert.equal(group.saleCount.$sum, 1);
  assert.equal(group.lastSoldAt.$max, '$createdAt');
  assert.ok(pipeline.some((stage) => stage.$limit === repository.MAX_CUSTOMER_SALES));
});
