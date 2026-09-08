"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetWorkstationController,
} = require("../../src/modules/admin/fleet-workstation/fleet-workstation.controller");

const response = () => {
  let statusCode;
  let body;
  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
    result: () => ({ statusCode, body }),
  };
};

const makeController = (overrides = {}) =>
  createFleetWorkstationController({
    dashboardService: {
      getDashboard: async () => ({ fleet: { _id: "f1" } }),
    },
    manifestService: {
      getManifest: async () => ({ trip: { _id: "t1" } }),
    },
    tripStatusService: {
      updateStatus: async () => ({ trip: { _id: "t1" } }),
    },
    driverAssignmentService: {
      reassign: async () => ({ trip: { _id: "t1" } }),
    },
    logger: { error() {} },
    ...overrides,
  });

const invoke = async (handler, req) => {
  const res = response();
  await handler(req, res);
  return res.result();
};

test("dashboard and manifest controllers preserve success responses", async () => {
  const controller = makeController();
  assert.deepEqual(
    await invoke(controller.getFleetWorkstation, { params: { id: "f1" } }),
    {
      statusCode: 200,
      body: { success: true, data: { fleet: { _id: "f1" } } },
    }
  );
  assert.deepEqual(
    await invoke(controller.getTripManifest, {
      params: { fleetId: "f1", tripId: "t1" },
    }),
    {
      statusCode: 200,
      body: { success: true, data: { trip: { _id: "t1" } } },
    }
  );
});

test("controllers preserve exact not-found messages", async () => {
  const controller = makeController({
    dashboardService: { getDashboard: async () => null },
    manifestService: { getManifest: async () => null },
  });
  assert.equal(
    (await invoke(controller.getFleetWorkstation, { params: { id: "x" } }))
      .body.message,
    "Fleet not found."
  );
  assert.equal(
    (
      await invoke(controller.getTripManifest, {
        params: { fleetId: "f1", tripId: "x" },
      })
    ).body.message,
    "Trip not found or does not belong to this fleet."
  );
});

test("mutation controllers preserve exact success messages", async () => {
  const controller = makeController();
  const context = {
    params: { fleetId: "f1", tripId: "t1" },
    body: { status: "boarding", driverId: "d1" },
    adminInfo: { id: "admin-1" },
  };
  const status = await invoke(controller.updateTripStatus, context);
  const driver = await invoke(controller.reassignTripDriver, context);
  assert.equal(status.statusCode, 200);
  assert.equal(status.body.message, "Trip status updated to boarding");
  assert.equal(driver.statusCode, 200);
  assert.equal(driver.body.message, "Driver reassigned successfully");
});

test("dependency failures log details but sanitize the public response", async () => {
  const logs = [];
  const controller = makeController({
    dashboardService: {
      getDashboard: async () => {
        throw new Error("database unavailable");
      },
    },
    logger: { error: (...args) => logs.push(args) },
  });
  const result = await invoke(controller.getFleetWorkstation, {
    params: { id: "f1" },
  });
  assert.deepEqual(result, {
    statusCode: 500,
    body: { success: false, message: "Unable to complete this operation." },
  });
  assert.equal(logs.length, 1);
});
