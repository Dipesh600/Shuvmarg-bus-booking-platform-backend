'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(full) : (entry.name.endsWith('.js') ? [full] : []);
});

test('V4 agent cash path imports no platform money machinery', () => {
  const files = [
    ...walk(path.join(ROOT, 'src/modules/agent/cash-sale')),
    ...walk(path.join(ROOT, 'src/modules/agent/seat-hold')),
  ];
  const forbidden = [
    'passenger-booking-payment-transaction', 'passenger-esewa-', 'passenger-wallet-payment',
    'passenger-split-payment', 'agentSettlementModel', 'agentWalletTransactionModel',
  ];
  const violations = files.flatMap((file) => forbidden
    .filter((name) => fs.readFileSync(file, 'utf8').includes(name))
    .map((name) => `${path.relative(ROOT, file)}:${name}`));
  assert.deepEqual(violations, []);
});

test('V5 the shared repository remains the only Booking.create production site', () => {
  const files = ['src', 'controllers', 'routes'].flatMap((dir) => walk(path.join(ROOT, dir)));
  const writers = files.filter((file) => /return Booking\.create\(payload\)/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(writers.map((file) => path.relative(ROOT, file)), [
    'src/modules/booking/passenger-booking-persistence/passenger-booking-persistence.repository.js',
  ]);
});

test('V8 agent sale reuses passenger hold, commitment and rollback modules', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/modules/agent/cash-sale/index.js'), 'utf8');
  assert.match(source, /passenger-booking-persistence/);
  assert.match(source, /passenger-seat-hold/);
  assert.match(source, /passenger-seat-commitment/);
});

test('V7 commit honors the hold snapshot instead of rechecking assignment status', () => {
  const source = fs.readFileSync(path.join(ROOT, 'src/modules/agent/cash-sale/agent-cash-sale.repository.js'), 'utf8');
  assert.equal(source.includes('AgentAssignment'), false);
  assert.match(source, /authorizedBrandId/);
});
