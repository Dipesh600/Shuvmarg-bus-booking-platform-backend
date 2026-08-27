'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../../..');
const dirs = [
  'src/shared/agent-sales', 'src/modules/agent/sales-history',
  'src/modules/bus-owner/agent-sales',
];
const sources = dirs.flatMap((dir) => fs.readdirSync(path.join(ROOT, dir))
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(ROOT, dir, name), 'utf8'))).join('\n');

test('Y3 sales read slice contains no database write or money machinery', () => {
  for (const forbidden of [
    '.create(', '.updateOne(', '.updateMany(', '.findOneAndUpdate(', '.deleteOne(',
    '.save(', 'AgentSettlement', 'AgentWallet', 'commissionAmount:', 'settlementId:',
  ]) assert.equal(sources.includes(forbidden), false, forbidden);
});

test('Y6 only explicit AppErrors become 4xx; unknown errors are rethrown', () => {
  assert.match(sources, /error instanceof AppError/);
  assert.match(sources, /throw error/);
  assert.equal(sources.includes('error.statusCode || 400'), false);
});

test('required read indexes exist on the live schemas', () => {
  const AgentBooking = require('../../../../models/agentBookingModel');
  const Booking = require('../../../../models/bookTicketModel');
  const has = (model, expected) => model.schema.indexes().some(([fields]) =>
    Object.entries(expected).every(([key, value]) => fields[key] === value));
  assert.equal(has(AgentBooking, { agentId: 1, createdAt: -1 }), true);
  assert.equal(has(Booking, { agentId: 1, createdAt: -1 }), true);
});
