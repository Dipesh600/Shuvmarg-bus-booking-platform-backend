"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBusOwnerScheduleRepository } = require("../../../../src/modules/bus-owner/schedule-management/bus-owner-schedule.repository");

test("bus-owner schedule repository delegation", async (t) => {
  await t.test("delegates to BusSchedule model methods cleanly without mutating arguments", async () => {
    const calls = [];
    const mockModel = {
      create: async (data) => { calls.push(["create", data]); return { _id: "new-id", ...data }; },
      findById: async (id) => { calls.push(["findById", id]); return { _id: id }; },
      findByIdAndDelete: async (id) => { calls.push(["findByIdAndDelete", id]); return { _id: id }; },
    };

    const repo = createBusOwnerScheduleRepository({ BusSchedule: mockModel });

    const payload = { operatorName: "Test Op" };
    await repo.createSchedule(payload);
    assert.deepEqual(calls[0], ["create", payload]);

    await repo.findScheduleById("sch-123");
    assert.deepEqual(calls[1], ["findById", "sch-123"]);

    let saveCalled = false;
    const doc = { save: async () => { saveCalled = true; return doc; } };
    await repo.saveSchedule(doc);
    assert.equal(saveCalled, true);

    await repo.deleteScheduleById("sch-456");
    assert.deepEqual(calls[2], ["findByIdAndDelete", "sch-456"]);
  });
});
