'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const repository = require('../../../src/modules/agent/sellable-inventory/agent-sellable-inventory.repository');
const {
  BRAND_A, BRAND_B, OWNER_ID, USER_ID,
  assignment, bus, fareRule, harness, schedule, service,
} = require('../../helpers/agent-sellable-inventory-harness');

test('agent sellable inventory service', async (t) => {
  await t.test('ACTIVE ALL_BUSES returns exactly the assigned brand schedule', async () => {
    const h = harness();
    try {
      const result = await service.listSellableInventory(USER_ID, {});
      assert.equal(result.statusCode, 200);
      assert.equal(result.responseBody.data.kycStatus, 'VERIFIED_BASIC');
      assert.equal(result.responseBody.data.inventory.length, 1);
      const group = result.responseBody.data.inventory[0];
      assert.deepEqual(group.brand, { id: BRAND_A, brandName: 'Kaski Yatayat' });
      assert.equal(group.schedules[0].scheduleId, `schedule-${BRAND_A}`);
      assert.equal(group.schedules[0].fare.baseFare, 1000);
    } finally { h.restore(); }
  });

  await t.test('U1 actual Buse query pins brandId, with owner only as consistency', () => {
    const filter = repository.buildApprovedBusQuery(assignment()).getFilter();
    assert.deepEqual(filter, {
      brandId: BRAND_A,
      ownerId: OWNER_ID,
      approvalStatus: 'APPROVED',
      status: 'ACTIVE',
    });
  });

  await t.test('two active assignments to two brands never bleed schedules', async () => {
    const h = harness({
      findSellableAssignments: () => [assignment(BRAND_A), assignment(BRAND_B)],
      findApprovedBusesForAssignment: (row) => [bus(String(row.operatorId._id))],
      findSchedulesForBuses: (busIds) => {
        const brandId = String(busIds[0]).replace('bus-', '');
        return [schedule(brandId)];
      },
      findFareRulesForSchedules: (_ownerId, schedules) => {
        const brandId = String(schedules[0].busId._id).replace('bus-', '');
        return [fareRule(brandId)];
      },
    });
    try {
      const inventory = (await service.listSellableInventory(USER_ID, {})).responseBody.data.inventory;
      assert.equal(inventory.length, 2);
      for (const group of inventory) {
        assert.equal(group.schedules.length, 1);
        assert.ok(group.schedules[0].bus.id.endsWith(group.brand.id));
      }
    } finally { h.restore(); }
  });

  await t.test('SUSPENDED assignment yields no sellable schedules defensively', async () => {
    const h = harness({ findSellableAssignments: () => [assignment(BRAND_A, { status: 'SUSPENDED' })] });
    try {
      const inventory = (await service.listSellableInventory(USER_ID, {})).responseBody.data.inventory;
      assert.deepEqual(inventory[0].schedules, []);
    } finally { h.restore(); }
  });
});
