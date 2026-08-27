'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = require('../../../src/shared/agent-sales/agent-sales.mapper');

test('Y4 sale response is a field-by-field owned-customer allowlist', () => {
  const response = mapper.toSalesResponse({
    rows: [{
      _id: 'sale-1', passengerName: 'Sita', passengerPhone: '9800000000',
      ticketPrice: 900, paymentMode: 'CASH', conductorStatus: 'PENDING', createdAt: 'now',
      ownerId: 'owner-secret', adminNotes: 'note-secret', bankAccount: 'bank-secret', pan: 'pan-secret',
      booking: { seats: ['A1'], status: 'booked', bookedFrom: 'KTM', bookedTo: 'PKR' },
      trip: { _id: 'trip-1', routeId: 'route-1', tripDate: 'date', departureTime: '07:00' },
      route: { routeName: 'Kathmandu - Pokhara' },
    }],
    page: 1, limit: 20, total: 1,
  });
  assert.deepEqual(Object.keys(response.data[0]).sort(), [
    'boardingPoint', 'conductorStatus', 'droppingPoint', 'passengerName',
    'passengerPhone', 'paymentMode', 'seats', 'soldAt', 'status',
    'ticketPrice', 'trip',
  ]);
  const json = JSON.stringify(response);
  for (const secret of ['owner-secret', 'note-secret', 'bank-secret', 'pan-secret']) {
    assert.equal(json.includes(secret), false);
  }
});

test('Y4 customers de-duplicate into name-phone summaries', () => {
  const response = mapper.toCustomersResponse({
    rows: [{ _id: { name: 'Sita', phone: '9800000000' }, saleCount: 3, lastSoldAt: 'now' }],
    page: 1, limit: 20, total: 1,
  });
  assert.deepEqual(response.data, [{
    passengerName: 'Sita', passengerPhone: '9800000000', saleCount: 3, lastSoldAt: 'now',
  }]);
});
