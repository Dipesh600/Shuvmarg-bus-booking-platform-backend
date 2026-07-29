"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetManagementController,
} = require("../../src/modules/admin/fleet-management/fleet-management.controller");

function response() {
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
}

function makeController(overrides = {}) {
  const ok = async () => ({
    statusCode: 200,
    body: { success: true },
  });
  return createFleetManagementController({
    listFleets: ok,
    getFleetDetail: ok,
    updateFleetStatus: ok,
    getFleetDashboard: ok,
    getFleetSetupStatus: ok,
    console: { error() {} },
    ...overrides,
  });
}

async function invoke(handler, req = {}) {
  const res = response();
  await handler(req, res);
  return res.result();
}

test("controllers forward exact request boundaries to services", async () => {
  const received = [];
  const controller = makeController({
    listFleets: async (value) => {
      received.push(["list", value]);
      return { statusCode: 201, body: { list: true } };
    },
    getFleetDetail: async (value) => {
      received.push(["detail", value]);
      return { statusCode: 202, body: { detail: true } };
    },
    updateFleetStatus: async (value) => {
      received.push(["status", value]);
      return { statusCode: 203, body: { status: true } };
    },
  });
  assert.equal(
    (await invoke(controller.getAllFleet, { query: { grounded: "true" } }))
      .statusCode,
    201
  );
  await invoke(controller.getFleetById, { params: { id: "f1" } });
  await invoke(controller.updateFleetStatus, { body: { status: "APPROVED" } });
  assert.deepEqual(received, [
    ["list", { grounded: "true" }],
    ["detail", "f1"],
    ["status", { status: "APPROVED" }],
  ]);
});

test("controllers preserve endpoint-specific 500 contracts", async () => {
  const error = new Error("database down");
  const controller = makeController({
    listFleets: async () => {
      throw error;
    },
    getFleetSetupStatus: async () => {
      throw error;
    },
  });
  assert.deepEqual(await invoke(controller.getAllFleet, { query: {} }), {
    statusCode: 500,
    body: {
      success: false,
      message: "Internal server error",
      error: "database down",
    },
  });
  assert.deepEqual(
    await invoke(controller.getFleetSetupStatus, { params: { id: "f1" } }),
    {
      statusCode: 500,
      body: { success: false, message: "database down" },
    }
  );
});
