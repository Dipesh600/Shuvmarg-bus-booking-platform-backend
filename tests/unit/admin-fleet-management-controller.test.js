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
  const mockReadService = {
    listFleetsForAdmin: async (req) => ({ success: true, data: { items: [], pagination: {} } }),
    getFleetDetailForAdmin: async (req) => ({ success: true, data: {} }),
    getFleetSetupStatusForAdmin: async (req) => ({ success: true, data: {} }),
    ...(overrides.readService || {}),
  };

  return createFleetManagementController({
    readService: mockReadService,
    updateFleetStatus: overrides.updateFleetStatus || (async () => ({ success: true, message: "Fleet approved successfully." })),
    getFleetDashboard: overrides.getFleetDashboard || (async () => ({ statusCode: 200, body: { success: true } })),
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
  const mockReadService = {
    listFleetsForAdmin: async (req) => {
      received.push(["list", req.query]);
      return { success: true, list: true };
    },
    getFleetDetailForAdmin: async (req) => {
      received.push(["detail", req.params?.id]);
      return { success: true, detail: true };
    },
  };
  const controller = makeController({
    readService: mockReadService,
    updateFleetStatus: async (value) => {
      received.push(["status", value]);
      return { success: true, data: { status: "APPROVED" } };
    },
  });
  assert.equal(
    (await invoke(controller.getAllFleet, { query: { grounded: "true" } }))
      .statusCode,
    200
  );
  await invoke(controller.getFleetById, { params: { id: "f1" } });
  await invoke(controller.updateFleetStatus, { body: { status: "APPROVED" } });
  assert.deepEqual(received, [
    ["list", { grounded: "true" }],
    ["detail", "f1"],
    ["status", { status: "APPROVED", actor: null }],
  ]);
});

test("controllers sanitize all unexpected 500 error responses", async () => {
  const error = new Error("Sensitive DB connection error text");
  const failingReadService = {
    listFleetsForAdmin: async () => {
      throw error;
    },
    getFleetDetailForAdmin: async () => {
      throw error;
    },
    getFleetSetupStatusForAdmin: async () => {
      throw error;
    },
  };

  const controller = makeController({
    readService: failingReadService,
    getFleetDashboard: async () => {
      throw error;
    },
  });

  const endpoints = [
    ["getAllFleet", { query: {} }],
    ["getFleetById", { params: { id: "f1" } }],
    ["getFleetDashboard", {}],
    ["getFleetSetupStatus", { params: { id: "f1" } }],
  ];

  for (const [method, req] of endpoints) {
    const res = await invoke(controller[method], req);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, {
      success: false,
      message: "Internal server error",
    });
    assert.equal(res.body.error, undefined, `${method} must not leak raw error message property`);
    assert.equal(res.body.message.includes("Sensitive DB"), false, `${method} must not leak internal exception message`);
  }
});
