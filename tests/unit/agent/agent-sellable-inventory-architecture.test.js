'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AgentAssignment = require('../../../models/agentAssignmentModel');
const Trip = require('../../../models/tripModel');

const ROOT = path.resolve(__dirname, '../../..');
const productionFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const fullPath = path.join(dir, entry.name);
  if (entry.isDirectory()) return productionFiles(fullPath);
  return entry.name.endsWith('.js') ? [fullPath] : [];
});

test('agent sellable inventory architecture', async (t) => {
  await t.test('W9/V2 the catalogue and hold writer share the one Trip guard', () => {
    const roots = ['src', 'routes', 'controllers', 'middleware'].map((dir) => path.join(ROOT, dir));
    const callers = roots.flatMap(productionFiles).filter((file) => (
      fs.readFileSync(file, 'utf8').includes('filterSellableTrips({')
    ));
    assert.deepEqual(callers.map((file) => path.relative(ROOT, file)), [
      'src/modules/agent/seat-hold/agent-seat-hold.service.js',
      'src/modules/agent/sellable-inventory/agent-sellable-inventory.service.js',
    ]);
  });

  await t.test('W10 recurring Schedule grants reference the Trip schedule namespace', () => {
    const assignmentRef = AgentAssignment.schema.path('allowedScheduleIds').caster.options.ref;
    const tripRef = Trip.schema.path('scheduleId').options.ref;
    assert.equal(assignmentRef, 'Schedule');
    assert.equal(assignmentRef, tripRef);
  });

  await t.test('W12 no agent production path imports or queries legacy busschedules', () => {
    const files = productionFiles(path.join(ROOT, 'src/modules/agent'));
    const legacyUsers = files.filter((file) => {
      const source = fs.readFileSync(file, 'utf8');
      return source.includes('busScheduleModel') || source.includes('busschedules');
    });
    assert.deepEqual(legacyUsers, []);
  });
});
