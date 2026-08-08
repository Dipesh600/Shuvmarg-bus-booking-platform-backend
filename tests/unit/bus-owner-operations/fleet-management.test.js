"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ApiError } = require("../../../src/contracts");
const { createFleetManagementController } = require("../../../src/modules/bus-owner/fleet-management/fleet-management.controller");
const { ReadContractError } = require("../../../src/modules/read-contracts/common/read-errors");

function response() {
  let status, body;
  return {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
    result: () => ({ status, body }),
  };
}

test("bus-owner fleet management contracts", async (t) => {
  await t.test("all five operations pass authenticated inputs to expected services", async () => {
    const mutationCalls = [];
    const readCalls = [];
    const fleetService = {
      createFleet: async (...a) => (mutationCalls.push(["create", ...a]), "created"),
      updateFleetDetails: async (...a) => (mutationCalls.push(["update", ...a]), "updated"),
      removeFleet: async (...a) => mutationCalls.push(["delete", ...a]),
    };
    const submissionService = {
      submitFleetForVerification: async (...a) => (mutationCalls.push(["submit", ...a]), { _id: "fleet" }),
    };
    const readService = {
      listFleetsForOwner: async (req) => {
        readCalls.push(["list", req.userInfo?.id]);
        return { success: true, data: { items: [{ fleetId: "fleet" }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } };
      },
      getFleetDetailForOwner: async (req) => {
        readCalls.push(["get", req.params?.fleetId, req.userInfo?.id]);
        return { success: true, data: { fleetId: req.params?.fleetId } };
      },
    };
    const handlers = createFleetManagementController({ fleetService, readService, submissionService });
    const mutReq = { userInfo: { id: "owner" }, params: { fleetId: "fleet" }, body: { fleetId: "fleet", field: "value" }, files: { photo: "file" } };
    const readListReq = { userInfo: { id: "owner" }, query: {} };
    const readDetailReq = { userInfo: { id: "owner" }, params: { fleetId: "fleet" } };

    const r1 = response(); await handlers.createFleet(mutReq, r1); assert.equal(r1.result().status, 201);
    const r2 = response(); await handlers.getMyFleets(readListReq, r2); assert.equal(r2.result().status, 200);
    const r3 = response(); await handlers.getFleetById(readDetailReq, r3); assert.equal(r3.result().status, 200);
    const r4 = response(); await handlers.updateFleet(mutReq, r4); assert.equal(r4.result().status, 200);
    const r5 = response(); await handlers.deleteFleet(mutReq, r5); assert.equal(r5.result().status, 200);

    assert.deepEqual(mutationCalls, [
      ["create", "owner", mutReq.body, mutReq.files, "BUS_OWNER"],
      ["update", "fleet", mutReq.body, mutReq.files, "owner"],
      ["delete", "fleet", "owner"],
    ]);
    assert.deepEqual(readCalls, [["list", "owner"], ["get", "fleet", "owner"]]);
  });

  await t.test("missing fleet ID stops write mutations before service access", async () => {
    let called = false;
    const handlers = createFleetManagementController({
      fleetService: { updateFleetDetails: async () => { called = true; } },
    });
    const res = response();
    await handlers.updateFleet({ userInfo: { id: "owner" }, params: {} }, res);
    assert.equal(called, false);
    assert.equal(res.result().status, 400);
    assert.equal(res.result().body.error.code, "FLEET_INVALID_ID");
  });

  await t.test("read service errors return canonical error envelope", async () => {
    const readService = {
      getFleetDetailForOwner: async () => { throw new ReadContractError("READ_INVALID_ID", "Resource identifier format is invalid."); },
    };
    const handlers = createFleetManagementController({ readService, logger: { error() {} } });
    const res = response();
    await handlers.getFleetById({ userInfo: { id: "owner" }, params: {} }, res);
    assert.equal(res.result().status, 400);
    assert.deepEqual(res.result().body, {
      success: false,
      error: { code: "READ_INVALID_ID", message: "Resource identifier format is invalid.", details: null, retryable: false },
    });
  });

  await t.test("mutation service error wording preserves canonical status mapping", async () => {
    const service = {
      createFleet: async () => { throw new ApiError("FLEET_ALREADY_EXISTS"); },
      updateFleetDetails: async () => { throw new ApiError("FLEET_NOT_FOUND"); },
      removeFleet: async () => { throw new ApiError("FLEET_NOT_FOUND"); },
    };
    const submissionService = {
      submitFleetForVerification: async () => { throw new ApiError("FLEET_ALREADY_EXISTS"); },
    };
    const handlers = createFleetManagementController({ fleetService: service, submissionService, logger: { error() {} } });
    for (const [name, status] of [["submitFleetForVerification", 409], ["updateFleet", 404], ["deleteFleet", 404]]) {
      const res = response();
      await handlers[name]({ userInfo: { id: "owner" }, params: { fleetId: "fleet" }, body: { fleetId: "fleet" } }, res);
      assert.equal(res.result().status, status);
    }
  });
});
