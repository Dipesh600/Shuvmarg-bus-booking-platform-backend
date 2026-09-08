'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../helpers/db');
const User = require('../../models/userModel');
const { inspectAccountRoles } = require('../../scripts/preflightAccountRoles');
const repository = require('../../src/modules/auth/passenger-otp-auth/passenger-otp-auth.repository');

test('role rollout inspection and legacy repair use persisted role state', async t => {
  t.before(() => db.connect());
  t.after(() => db.disconnect());
  t.beforeEach(() => db.clearAll());

  await t.test('preflight reads missing and empty fields without applying defaults or writing', async () => {
    await User.collection.insertMany([
      { phone: '9800000001', role: 'passenger' },
      { phone: '9800000002', role: 'agent', roles: [] },
      { phone: '9800000003', role: 'agent', roles: ['passenger'] },
    ]);
    const before = await User.collection.find({}).toArray();
    const report = await inspectAccountRoles(User.collection);
    assert.equal(report.scanned, 3);
    assert.equal(report.missingLegacyRoles, 1);
    assert.equal(report.emptyRoles, 1);
    assert.equal(report.historicalRoleNotGranted, 1);
    assert.equal(report.requiresReview, true);
    assert.deepEqual(await User.collection.find({}).toArray(), before);
  });

  await t.test('legacy repair cannot undo a role revocation after the initial read', async () => {
    const inserted = await User.collection.insertOne({ phone: '9800000001', role: 'passenger', status: 'active' });
    // Another request explicitly revokes roles after the legacy reader saw no field.
    await User.collection.updateOne({ _id: inserted.insertedId }, { $set: { roles: [] } });
    assert.equal(await repository.materializeLegacyPassengerRole(inserted.insertedId), null);
    assert.deepEqual((await User.findById(inserted.insertedId)).roles, []);
  });

  await t.test('legacy repair materializes only an eligible missing passenger role', async () => {
    const inserted = await User.collection.insertOne({ phone: '9800000001', role: 'passenger', status: 'active' });
    await repository.materializeLegacyPassengerRole(inserted.insertedId);
    assert.deepEqual((await User.findById(inserted.insertedId)).roles, ['passenger']);
  });
});
