"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetStatusService,
} = require("../../src/modules/admin/fleet-management/fleet-status.service");
const policy = require("../../src/modules/admin/fleet-management/fleet-status.policy");

function makeService(overrides = {}) {
  const bus = {
    _id: "f1",
    busName: "Bus",
    busNumber: "BA-1",
    ownerId: null,
    async save() {
      this.saved = true;
    },
  };
  return {
    bus,
    service: createFleetStatusService({
      repository: { findForStatusUpdate: async () => bus },
      policy,
      notify: async () => {},
      clock: () => new Date("2026-03-04T00:00:00Z"),
      ...overrides,
    }),
  };
}

test("invalid status stops before fleet lookup", async () => {
  let queried = false;
  const { service } = makeService({
    repository: {
      findForStatusUpdate: async () => {
        queried = true;
      },
    },
  });
  const result = await service({ status: "ACTIVE", fleetId: "f1" });
  assert.equal(result.statusCode, 400);
  assert.equal(queried, false);
});

test("missing fleet preserves exact 404", async () => {
  const { service } = makeService({
    repository: { findForStatusUpdate: async () => null },
  });
  assert.deepEqual(
    await service({ status: "APPROVED", fleetId: "missing" }),
    {
      statusCode: 404,
      body: { success: false, message: "Bus not found" },
    }
  );
});

test("approval saves before notification and preserves response", async () => {
  const order = [];
  const { bus, service } = makeService({
    repository: {
      findForStatusUpdate: async () => {
        bus.save = async () => order.push("save");
        return bus;
      },
    },
    notify: async (received, state) => {
      order.push("notify");
      assert.equal(received, bus);
      assert.equal(state, "APPROVED");
    },
  });
  const result = await service({ status: "APPROVED", fleetId: "f1" });
  assert.deepEqual(order, ["save", "notify"]);
  assert.equal(bus.status, "ACTIVE");
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.message, "Fleet status updated to APPROVED");
  assert.equal(result.body.data, bus);
});

test("notification rejection remains a post-save operation failure", async () => {
  const error = new Error("email failed");
  const { service, bus } = makeService({
    notify: async () => {
      throw error;
    },
  });
  await assert.rejects(
    service({ status: "REJECTED", fleetId: "f1", rejectionReason: "Docs" }),
    error
  );
  assert.equal(bus.saved, true);
  assert.equal(bus.rejectionReason, "Docs");
});
