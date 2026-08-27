'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../../../utils/logger');
const repository = require('../../../src/modules/agent/sellable-inventory/agent-sellable-inventory.repository');
const {
  BRAND_A, BRAND_B, USER_ID,
  assignment, availability, fareRule, harness, trip, service,
} = require('../../helpers/agent-sellable-inventory-harness');

test('agent sellable Trip inventory service', async (t) => {
  await t.test('ALL_BUSES returns the assigned brand upcoming Trip and availability', async () => {
    const h = harness();
    try {
      const result = await service.listSellableInventory(USER_ID, {});
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.kycStatus, 'VERIFIED_BASIC');
      const group = result.responseBody.data.inventory[0];
      assert.deepEqual(group.brand, { id: BRAND_A, brandName: 'Kaski Yatayat' });
      assert.equal(group.trips[0].tripId, `trip-${BRAND_A}`);
      assert.equal(group.trips[0].scheduleId, `recurring-${BRAND_A}`);
      assert.equal(group.trips[0].fare.baseFare, 1000);
      assert.deepEqual(group.trips[0].availability, {
        totalSeats: 2, availableCount: 1, availableSeatNumbers: ['A1'],
      });
    } finally { h.restore(); }
  });

  await t.test('W1 actual Trip query pins brandId and never scopes on ownerId', () => {
    const query = repository.buildSellableTripQuery(assignment(), {
      page: 1, limit: 20, now: new Date('2026-08-27T12:00:00.000Z'),
    });
    assert.deepEqual(query.getFilter(), {
      brandId: BRAND_A,
      status: { $in: ['scheduled', 'boarding'] },
      tripDate: { $gte: new Date('2026-08-27T00:00:00.000Z') },
      bookingClosesAt: { $gt: new Date('2026-08-27T12:00:00.000Z') },
      isActive: true,
    });
    assert.equal(query.getFilter().ownerId, undefined);
    assert.notEqual(query.projection(), undefined, 'Trip projection must be active');
    assert.equal(query.projection().ownerId, undefined);
  });

  await t.test('W3 query applies recurring Schedule narrowing before pagination', () => {
    const query = repository.buildSellableTripQuery(assignment(BRAND_A, {
      accessScope: 'SCHEDULES', allowedScheduleIds: [],
    }), { page: 1, limit: 20, now: new Date('2026-08-27T12:00:00.000Z') });
    assert.deepEqual(query.getFilter().scheduleId, { $in: [] });
  });

  await t.test('availability excludes seats held through the shared hold model', async () => {
    const held = availability();
    held.holds.push({ tripId: `trip-${BRAND_A}`, seatNumbers: ['a1'] });
    const h = harness({ findAvailabilityForTrips: () => held });
    try {
      const row = (await service.listSellableInventory(USER_ID, {}))
        .responseBody.data.inventory[0].trips[0];
      assert.deepEqual(row.availability, {
        totalSeats: 2, availableCount: 0, availableSeatNumbers: [],
      });
    } finally { h.restore(); }
  });

  await t.test('W7 assignment fan-out cap logs the exact dropped count', async () => {
    const rows = Array.from({ length: 101 }, (_, index) => assignment(BRAND_A, {
      _id: `assignment-${index}`,
    }));
    const h = harness({
      findSellableAssignments: () => rows,
      countSellableAssignments: () => 105,
      findTripsForAssignment: () => [],
    });
    const originalWarn = logger.warn;
    let logged;
    logger.warn = (_message, details) => { logged = details; };
    try {
      await service.listSellableInventory(USER_ID, {});
      assert.equal(h.calls.findTripsForAssignment.length, 100);
      assert.equal(logged.kept, 100);
      assert.equal(logged.dropped, 5);
    } finally {
      logger.warn = originalWarn;
      h.restore();
    }
  });

  await t.test('two active brand assignments never bleed Trips', async () => {
    const h = harness({
      findSellableAssignments: () => [assignment(BRAND_A), assignment(BRAND_B)],
      findTripsForAssignment: (row) => [trip(String(row.operatorId._id))],
      findFareRulesForTrips: (_ownerId, trips) => {
        const brandId = String(trips[0].brandId);
        return [fareRule(brandId)];
      },
      findAvailabilityForTrips: (tripIds) => {
        const brandId = String(tripIds[0]).replace('trip-', '');
        return availability(brandId);
      },
    });
    try {
      const inventory = (await service.listSellableInventory(USER_ID, {})).responseBody.data.inventory;
      assert.equal(inventory.length, 2);
      for (const group of inventory) {
        assert.equal(group.trips.length, 1);
        assert.ok(group.trips[0].tripId.endsWith(group.brand.id));
      }
    } finally { h.restore(); }
  });

  await t.test('W2 SUSPENDED assignment yields no Trips defensively', async () => {
    const h = harness({
      findSellableAssignments: () => [assignment(BRAND_A, { status: 'SUSPENDED' })],
    });
    try {
      const inventory = (await service.listSellableInventory(USER_ID, {})).responseBody.data.inventory;
      assert.deepEqual(inventory[0].trips, []);
      assert.equal(h.calls.findFareRulesForTrips.length, 0);
      assert.equal(h.calls.findAvailabilityForTrips.length, 0);
    } finally { h.restore(); }
  });
});
