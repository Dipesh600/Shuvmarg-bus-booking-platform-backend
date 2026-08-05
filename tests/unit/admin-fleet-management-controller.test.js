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
    updateFleetStatus: async () => ({ success: true, message: "Fleet approved successfully." }),
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
      return { success: true, data: { status: "APPROVED" } };
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
    ["status", { status: "APPROVED", actor: null }],
  ]);
});

test("controllers sanitize all unexpected 500 error responses", async () => {
  const error = new Error("Sensitive DB connection error text");
  const controller = makeController({
    listFleets: async () => {
      throw error;
    },
    getFleetDetail: async () => {
      throw error;
    },
    getFleetDashboard: async () => {
      throw error;
    },
    getFleetSetupStatus: async () => {
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
