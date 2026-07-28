"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createFleetManagementController,
} = require("../../../src/modules/bus-owner/fleet-management/fleet-management.controller");

function response() {
  let status;
  let body;
  return {
    status(value) { status = value; return this; },
    json(value) { body = value; return this; },
    result: () => ({ status, body }),
  };
}

test("bus-owner fleet management contracts", async (t) => {
  await t.test("all five operations pass authenticated ownership inputs", async () => {
    const calls = [];
    const service = {
      createFleet: async (...args) => (calls.push(["create", ...args]), "created"),
      getFleetsByOwnerId: async (...args) => (
        calls.push(["list", ...args]), ["fleet"]
      ),
      getFleetDetails: async (...args) => (calls.push(["get", ...args]), "fleet"),
      updateFleetDetails: async (...args) => (
        calls.push(["update", ...args]), "updated"
      ),
      removeFleet: async (...args) => calls.push(["delete", ...args]),
    };
    const handlers = createFleetManagementController({ fleetService: service });
    const base = {
      userInfo: { id: "owner" },
      body: { fleetId: "fleet", field: "value" },
      files: { photo: "file" },
    };
    for (const [name, status] of [
      ["submitFleetForVerification", 201],
      ["getMyFleets", 200],
      ["getFleetById", 200],
      ["updateFleet", 200],
      ["deleteFleet", 200],
    ]) {
      const res = response();
      await handlers[name](base, res);
      assert.equal(res.result().status, status);
    }
    assert.deepEqual(calls, [
      ["create", "owner", base.body, base.files, "BUS_OWNER"],
      ["list", "owner"],
      ["get", "fleet", "owner"],
      ["update", "fleet", base.body, base.files, "owner"],
      ["delete", "fleet", "owner"],
    ]);
  });

  await t.test("missing fleet ID stops before service access", async () => {
    let called = false;
    const handlers = createFleetManagementController({
      fleetService: {
        getFleetDetails: async () => { called = true; },
      },
    });
    const res = response();
    await handlers.getFleetById(
      { userInfo: { id: "owner" }, body: {} }, res
    );
    assert.equal(called, false);
    assert.deepEqual(res.result(), {
      status: 400,
      body: { success: false, message: "Fleet ID is required." },
    });
  });

  await t.test("service error wording preserves legacy status mapping", async () => {
    const service = {
      createFleet: async () => { throw new Error("fleet exists"); },
      updateFleetDetails: async () => { throw new Error("fleet not found"); },
      removeFleet: async () => { throw new Error("fleet not found"); },
    };
    const handlers = createFleetManagementController({
      fleetService: service,
      logger: { error() {} },
    });
    for (const [name, status] of [
      ["submitFleetForVerification", 409],
      ["updateFleet", 404],
      ["deleteFleet", 404],
    ]) {
      const res = response();
      await handlers[name]({
        userInfo: { id: "owner" }, body: { fleetId: "fleet" },
      }, res);
      assert.equal(res.result().status, status);
    }
  });
});
