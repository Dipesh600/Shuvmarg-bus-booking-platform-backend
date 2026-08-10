"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertVariantTerminalScope,
  resolveDirectionalEndpoints,
} = require("../../src/modules/admin/platform-registry/variant-terminal-scope.policy.js");

function lean(value) {
  return { select() { return this; }, lean: async () => value };
}

function stopModel(stops) {
  return { findById: (id) => lean(stops[String(id)] || null) };
}

const activeRouteStop = (id, parentStopId = null) => ({
  _id: id, parentStopId, status: "ACTIVE", verificationStatus: "VERIFIED", isRouteStop: true,
});

test("directional terminal scope accepts active verified endpoints and descendants", async () => {
  const stops = {
    ktm: activeRouteStop("ktm"),
    kalanki: activeRouteStop("kalanki", "ktm"),
    mlw: activeRouteStop("mlw"),
  };
  const corridor = { originId: "ktm", destinationId: "mlw" };
  const scope = await assertVariantTerminalScope({
    corridor, direction: "FORWARD", originTerminalStopId: "kalanki",
    destinationTerminalStopId: "mlw", StopModel: stopModel(stops),
  });
  assert.equal(String(scope.originTerminal._id), "kalanki");
  assert.deepEqual(resolveDirectionalEndpoints(corridor, "RETURN"), {
    originEndpointId: "mlw", destinationEndpointId: "ktm",
  });
});

test("terminal scope rejects unverified descendants and wrong directional endpoints", async () => {
  const stops = {
    ktm: activeRouteStop("ktm"),
    unverifiedChild: { ...activeRouteStop("unverifiedChild", "ktm"), verificationStatus: "PENDING" },
    mlw: activeRouteStop("mlw"),
  };
  await assert.rejects(
    assertVariantTerminalScope({
      corridor: { originId: "ktm", destinationId: "mlw" }, direction: "FORWARD",
      originTerminalStopId: "unverifiedChild", destinationTerminalStopId: "mlw",
      StopModel: stopModel(stops),
    }),
    (error) => error.code === "INVALID_VARIANT_TERMINAL"
  );
  await assert.rejects(
    assertVariantTerminalScope({
      corridor: { originId: "ktm", destinationId: "mlw" }, direction: "RETURN",
      originTerminalStopId: "ktm", destinationTerminalStopId: "mlw",
      StopModel: stopModel(stops),
    }),
    (error) => error.code === "VARIANT_TERMINAL_OUTSIDE_CORRIDOR_SCOPE"
  );
});
