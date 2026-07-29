'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('public booking endpoints use bounded request resources', () => {
  const source = read('index.js');

  assert.match(source, /seatAvailabilityLimiter/);
  assert.match(
    source,
    /app\.use\("\/api\/ticket\/getSeats", seatAvailabilityLimiter\)/
  );
  assert.match(source, /express\.json\(\{ limit: "1mb" \}\)/);
  assert.match(source, /express\.urlencoded\(\{ extended: true, limit: "1mb" \}\)/);
  assert.doesNotMatch(source, /express\.json\(\{ limit: "50mb" \}\)/);
});

test('public seat mapper never exposes ownership metadata', () => {
  const source = read(
    'src/modules/booking/trip-seat-availability/trip-seat-availability.mapper.js'
  );

  assert.doesNotMatch(source, /bookedBy/);
  assert.doesNotMatch(source, /bookedAt/);
  assert.doesNotMatch(source, /\.\.\.seats/);
});
