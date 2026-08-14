"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAdminSeatLayoutController } = require("../../src/modules/seat-layout-v3-persistence/admin-seat-layout.controller");
const { createBusOwnerSeatLayoutController } = require("../../src/modules/seat-layout-v3-persistence/bus-owner-seat-layout.controller");

function response() {
  return {
    statusCode: 200, body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function services(overrides = {}) {
  return {
    query: {}, fleets: {},
    templates: {
      createTemplate: async (input, actor) => ({ _id: "t1", ...input, actor }),
      adoptPlatformTemplate: async (id, input, actor) => ({
        template: { _id: "t2", templateCode: "OP-1", ...input, actor },
        revision: { _id: "r1", templateId: "t2", layout: {} },
      }),
    },
    ...overrides,
  };
}

test("admin template creation locks platform ownership and ignores supplied lineage", async () => {
  let received;
  const svc = services();
  svc.templates.createTemplate = async (input, actor) => { received = { input, actor }; return { _id: "t1", ...input }; };
  const controller = createAdminSeatLayoutController(svc, { error() {} });
  const res = response();
  await controller.createPlatformTemplate({
    body: { name: "Coach", scope: "OPERATOR", ownerId: "attacker", sourceTemplateId: "fake" },
    adminInfo: { id: "admin-1", role: "SUPER_ADMIN" },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(received.input.scope, "PLATFORM");
  assert.equal(received.input.ownerId, null);
  assert.deepEqual(received.actor, { id: "admin-1", type: "SUPER_ADMIN" });
});

test("owner adoption cannot spoof another owner", async () => {
  let received;
  const svc = services();
  svc.templates.adoptPlatformTemplate = async (id, input, actor) => {
    received = { id, input, actor };
    return { template: { _id: "t2", ...input }, revision: { _id: "r2", layout: {} } };
  };
  const controller = createBusOwnerSeatLayoutController(svc, { error() {} });
  const res = response();
  await controller.adoptPlatformTemplate({
    params: { templateId: "platform-1" }, body: { ownerId: "attacker", name: "Mine" },
    userInfo: { id: "owner-1" },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(received.input.ownerId, "owner-1");
  assert.deepEqual(received.actor, { id: "owner-1", type: "BUS_OWNER" });
});

test("unexpected errors are sanitized", async () => {
  const svc = services({ query: { listOwnerTemplates: async () => { throw new Error("database secret"); } } });
  const controller = createBusOwnerSeatLayoutController(svc, { error() {} });
  const res = response();
  await controller.listCatalog({ userInfo: { id: "owner-1" } }, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.errorCode, "SEAT_LAYOUT_INTERNAL_ERROR");
  assert.doesNotMatch(res.body.message, /secret/);
});

test("missing fleet revision is a stable validation error", async () => {
  const svc = services({ fleets: { assignInitial: async () => assert.fail("must not run") } });
  const controller = createBusOwnerSeatLayoutController(svc, { error() {} });
  const res = response();
  await controller.assignInitial({
    params: { fleetId: "fleet-1" }, body: {}, userInfo: { id: "owner-1" },
  }, res);
  assert.equal(res.statusCode, 422);
  assert.equal(res.body.errorCode, "SEAT_LAYOUT_INPUT_INVALID");
  assert.deepEqual(res.body.details, { field: "revisionId" });
});

test("custom initial layout uses the authenticated fleet owner", async () => {
  let received;
  const svc = services({ fleets: { createInitialCustomLayout: async (fleetId, input, actor) => {
    received = { fleetId, input, actor };
    return { assignment: {}, template: {}, revision: {} };
  } } });
  const controller = createBusOwnerSeatLayoutController(svc, { error() {} });
  const res = response();
  await controller.createInitialCustomLayout({
    params: { fleetId: "fleet-1" }, body: { name: "Custom", layout: {} },
    userInfo: { id: "owner-1" },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(received.actor, { id: "owner-1", type: "BUS_OWNER" });
  assert.equal(received.fleetId, "fleet-1");
});

test("admin custom fleet layout records the authenticated super admin", async () => {
  let received;
  const svc = services({ fleets: { createInitialCustomLayout: async (fleetId, input, actor) => {
    received = { fleetId, input, actor };
    return { assignment: {}, template: {}, revision: {} };
  } } });
  const controller = createAdminSeatLayoutController(svc, { error() {} });
  const res = response();
  await controller.createInitialCustomLayout({
    params: { fleetId: "fleet-2" }, body: { name: "Admin layout", layout: {} },
    adminInfo: { id: "admin-1", role: "SUPER_ADMIN" },
  }, res);
  assert.equal(res.statusCode, 201);
  assert.deepEqual(received.actor, { id: "admin-1", type: "SUPER_ADMIN" });
  assert.equal(received.fleetId, "fleet-2");
});
