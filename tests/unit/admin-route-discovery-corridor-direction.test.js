"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveCorridorDirection,
} = require("../../src/modules/admin/route-discovery/route-discovery-session.service.js");

const corridor = { originId: "origin-stop", destinationId: "destination-stop" };

test("corridor discovery resolves canonical endpoints for each independent direction", () => {
  assert.deepEqual(resolveCorridorDirection(corridor, "FORWARD"), {
    direction: "FORWARD",
    originStopId: "origin-stop",
    destinationStopId: "destination-stop",
  });
  assert.deepEqual(resolveCorridorDirection(corridor, "RETURN"), {
    direction: "RETURN",
    originStopId: "destination-stop",
    destinationStopId: "origin-stop",
  });
});

test("corridor discovery defaults unknown direction values to forward", () => {
  assert.equal(resolveCorridorDirection(corridor, "anything").direction, "FORWARD");
});
