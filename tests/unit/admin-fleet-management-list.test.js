"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetListService,
} = require("../../src/modules/admin/fleet-management/fleet-list.service");
const policy = require("../../src/modules/admin/fleet-management/fleet-query.policy");
const mapper = require("../../src/modules/admin/fleet-management/fleet-list.mapper");

function makeService(repository) {
  return createFleetListService({ repository, policy, mapper });
}

test("fleet list preserves mode query and exact empty responses", async () => {
  let received;
  const list = makeService({
    findAll: async (query) => {
      received = query;
      return [];
    },
  });
  const result = await list({ operational: "true", brandId: "b1" });
  assert.deepEqual(received, {
    setupComplete: true,
    approvalStatus: "APPROVED",
    brandId: "b1",
  });
  assert.deepEqual(result, {
    statusCode: 200,
    body: {
      success: true,
      message: "No buses are currently live on the network.",
      results: 0,
      data: [],
    },
  });
});

test("default registry listing performs no schedule lookup", async () => {
  let scheduleCalls = 0;
  const list = makeService({
    findAll: async () => [
      {
        _id: "f1",
        busName: "Night Bus",
        ownerId: { name: "Owner" },
        corridorId: null,
      },
    ],
    findActiveSchedule: async () => {
      scheduleCalls += 1;
    },
  });
  const result = await list({});
  assert.equal(scheduleCalls, 0);
  assert.equal(result.body.results, 1);
  assert.equal(result.body.data[0].operator, "Owner");
  assert.equal(result.body.data[0].schedule, null);
});

test("operational listing adds exact active schedule summary", async () => {
  const calls = [];
  const list = makeService({
    findAll: async () => [
      { _id: "f1", ownerId: null, corridorId: null },
      { _id: "f2", ownerId: null, corridorId: null },
    ],
    findActiveSchedule: async (id) => {
      calls.push(id);
      return id === "f1"
        ? {
            departureTime: "10:00",
            arrivalTime: "12:00",
            operationalModel: "DAILY",
            returnScheduleId: "r1",
          }
        : null;
    },
  });
  const result = await list({ operational: "true" });
  assert.deepEqual(calls, ["f1", "f2"]);
  assert.deepEqual(result.body.data[0].schedule, {
    departureTime: "10:00",
    arrivalTime: "12:00",
    operationalModel: "DAILY",
    hasReturn: true,
  });
  assert.equal(result.body.data[1].schedule, null);
});
