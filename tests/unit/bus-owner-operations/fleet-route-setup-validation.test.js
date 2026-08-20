"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  validateServedStopInput,
} = require("../../../src/modules/bus-owner/fleet-route-setup/route-setup.validation.js");

function served(overrides = {}) {
  return {
    stopId: "64f000000000000000000001",
    sequence: 1,
    usage: "PICKUP",
    boardingMode: "STOP_FALLBACK",
    boardingLocationIds: [],
    ...overrides,
  };
}

test("fleet route setup accepts distinct ordered stop behavior", () => {
  assert.doesNotThrow(() => validateServedStopInput([
    served(),
    served({ stopId: "64f000000000000000000002", sequence: 2, usage: "DROP" }),
  ]));
});

test("fleet route setup rejects duplicate served stops", () => {
  assert.throws(() => validateServedStopInput([served(), served({ sequence: 2 })]), {
    code: "INVALID_FLEET_ROUTE_STOPS",
  });
});

test("boarding-location mode requires a canonical meeting location", () => {
  assert.throws(() => validateServedStopInput([
    served({ boardingMode: "BOARDING_LOCATIONS" }),
    served({ stopId: "64f000000000000000000002", sequence: 2, usage: "DROP" }),
  ]), { code: "BOARDING_LOCATION_REQUIRED" });
});

test("served stops must remain ordered and keep endpoint behavior", () => {
  assert.throws(() => validateServedStopInput([
    served({ sequence: 2 }),
    served({ stopId: "64f000000000000000000002", sequence: 1, usage: "DROP" }),
  ]), { code: "INVALID_FLEET_ROUTE_STOP_ORDER" });
  assert.throws(() => validateServedStopInput([
    served({ usage: "DROP" }),
    served({ stopId: "64f000000000000000000002", sequence: 2, usage: "DROP" }),
  ]), { code: "INVALID_FLEET_ROUTE_ENDPOINT_BEHAVIOR" });
});
