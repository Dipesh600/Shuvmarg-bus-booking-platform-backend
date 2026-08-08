"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
const { createBusOwnerFleetCommandController } = require("../../../src/modules/bus-owner/fleet-management/fleet-command.controller");
const { createBusOwnerFleetCommandService } = require("../../../src/modules/bus-owner/fleet-management/fleet-command.service");

function response() {
  let status, body;
  return {
    status(v) { status = v; return this; },
    json(v) { body = v; return this; },
    result: () => ({ status, body }),
  };
}

test("bus-owner fleet command controller & service contracts", async (t) => {
  await t.test("createFleet uses authenticated owner identity and returns 201 Created", async () => {
    const calls = [];
    const fleetService = { createFleet: async (...a) => (calls.push(["create", ...a]), { _id: "fleet_1" }) };
    const controller = createBusOwnerFleetCommandController({
      commandService: createBusOwnerFleetCommandService({ fleetService }), logger: { error() {} },
    });
    const req = { userInfo: { id: "owner_123" }, body: { busName: "Express" }, files: {} };
    const res = response();
    await controller.createFleet(req, res);
    assert.equal(res.result().status, 201);
    assert.deepEqual(res.result().body, {
      success: true, message: "Fleet draft created successfully!", data: { fleet: { _id: "fleet_1" } },
    });
    assert.deepEqual(calls, [["create", "owner_123", req.body, req.files, "BUS_OWNER"]]);
  });

  await t.test("updateFleet uses req.params.fleetId and authenticated owner", async () => {
    const calls = [];
    const fleetService = { updateFleetDetails: async (...a) => (calls.push(["update", ...a]), { _id: "fleet_1" }) };
    const controller = createBusOwnerFleetCommandController({
      commandService: createBusOwnerFleetCommandService({ fleetService }), logger: { error() {} },
    });
    const req = { userInfo: { id: "owner_123" }, params: { fleetId: "fleet_1" }, body: { busName: "Super" }, files: {} };
    const res = response();
    await controller.updateFleet(req, res);
    assert.equal(res.result().status, 200);
    assert.deepEqual(res.result().body, {
      success: true, message: "Fleet details updated successfully!", data: { fleet: { _id: "fleet_1" } },
    });
    assert.deepEqual(calls, [["update", "fleet_1", req.body, req.files, "owner_123"]]);
  });

  await t.test("deleteFleet uses req.params.fleetId and authenticated owner", async () => {
    const calls = [];
    const fleetService = { removeFleet: async (...a) => (calls.push(["remove", ...a]), true) };
    const controller = createBusOwnerFleetCommandController({
      commandService: createBusOwnerFleetCommandService({ fleetService }), logger: { error() {} },
    });
    const req = { userInfo: { id: "owner_123" }, params: { fleetId: "fleet_1" } };
    const res = response();
    await controller.deleteFleet(req, res);
    assert.equal(res.result().status, 200);
    assert.deepEqual(res.result().body, {
      success: true, message: "Fleet deleted successfully!", data: { fleetId: "fleet_1" },
    });
    assert.deepEqual(calls, [["remove", "fleet_1", "owner_123"]]);
  });

  await t.test("unauthenticated owner returns 401 AUTHENTICATION_REQUIRED", async () => {
    const controller = createBusOwnerFleetCommandController({
      commandService: createBusOwnerFleetCommandService({ fleetService: {} }), logger: { error() {} },
    });
    const res = response();
    await controller.createFleet({ body: {} }, res);
    assert.equal(res.result().status, 401);
    assert.equal(res.result().body.error.code, "AUTHENTICATION_REQUIRED");
  });

  await t.test("missing fleetId on update/delete returns 400 FLEET_INVALID_ID", async () => {
    const controller = createBusOwnerFleetCommandController({
      commandService: createBusOwnerFleetCommandService({ fleetService: {} }), logger: { error() {} },
    });
    const res1 = response();
    await controller.updateFleet({ userInfo: { id: "owner_1" }, params: {} }, res1);
    assert.equal(res1.result().status, 400);
    assert.equal(res1.result().body.error.code, "FLEET_INVALID_ID");

    const res2 = response();
    await controller.deleteFleet({ userInfo: { id: "owner_1" }, params: {} }, res2);
    assert.equal(res2.result().status, 400);
    assert.equal(res2.result().body.error.code, "FLEET_INVALID_ID");
  });

  await t.test("fleet not found or owned by another user returns 404 FLEET_NOT_FOUND", async () => {
    const fleetService = {
      updateFleetDetails: async () => { throw new ApiError("FLEET_NOT_FOUND"); },
      removeFleet: async () => { throw new ApiError("FLEET_NOT_FOUND"); },
    };
    const controller = createBusOwnerFleetCommandController({
      commandService: createBusOwnerFleetCommandService({ fleetService }), logger: { error() {} },
    });
    const res1 = response();
    await controller.updateFleet({ userInfo: { id: "owner_1" }, params: { fleetId: "other_fleet" } }, res1);
    assert.equal(res1.result().status, 404);
    assert.equal(res1.result().body.error.code, "FLEET_NOT_FOUND");

    const res2 = response();
    await controller.deleteFleet({ userInfo: { id: "owner_1" }, params: { fleetId: "other_fleet" } }, res2);
    assert.equal(res2.result().status, 404);
    assert.equal(res2.result().body.error.code, "FLEET_NOT_FOUND");
  });

  await t.test("unexpected error wording does not dictate public error contract", async () => {
    const fleetService = {
      createFleet: async () => { throw new Error("fleet exists but database connection failed"); },
      updateFleetDetails: async () => { throw new Error("unauthorized database response"); },
      removeFleet: async () => { throw new Error("Connection timeout"); },
    };
    const controller = createBusOwnerFleetCommandController({
      commandService: createBusOwnerFleetCommandService({ fleetService }), logger: { error() {} },
    });

    const res1 = response();
    await controller.createFleet({ userInfo: { id: "owner_1" }, body: {} }, res1);
    assert.equal(res1.result().status, 500);
    assert.equal(res1.result().body.error.code, "FLEET_CREATE_FAILED");

    const res2 = response();
    await controller.updateFleet({ userInfo: { id: "owner_1" }, params: { fleetId: "fleet_1" }, body: {} }, res2);
    assert.equal(res2.result().status, 500);
    assert.equal(res2.result().body.error.code, "FLEET_UPDATE_FAILED");

    const res3 = response();
    await controller.deleteFleet({ userInfo: { id: "owner_1" }, params: { fleetId: "fleet_1" } }, res3);
    assert.equal(res3.result().status, 500);
    assert.equal(res3.result().body.error.code, "FLEET_DELETE_FAILED");
  });
});
