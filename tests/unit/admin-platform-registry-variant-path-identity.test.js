"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { fingerprintStopIds, orderedOverlap } = require("../../src/modules/admin/platform-registry/variant-path-identity.service.js");
const { locateOnRoute } = require("../../src/modules/admin/platform-registry/route-geometry/route-position.js");

test("route path identity is directional and deterministic", () => {
  assert.equal(fingerprintStopIds(["a", "b", "c"]), fingerprintStopIds(["a", "b", "c"]));
  assert.notEqual(fingerprintStopIds(["a", "b", "c"]), fingerprintStopIds(["c", "b", "a"]));
  assert.throws(() => fingerprintStopIds(["a", "a"]), /unique Stops/);
});

test("ordered overlap detects substantially identical paths without confusing reverse direction", () => {
  assert.equal(orderedOverlap(["a", "b", "c", "d", "e"], ["a", "b", "x", "c", "d", "e"]), 1);
  assert.equal(orderedOverlap(["a", "b", "c"], ["c", "b", "a"]), 1 / 3);
});

test("manual stop placement projects a map point onto route progress", () => {
  const position = locateOnRoute({ lat: 0.01, lng: 0.5 }, [[0, 0], [1, 0]]);
  assert.ok(position.distanceAlongKm > 50 && position.distanceAlongKm < 60);
  assert.ok(position.offRouteKm > 1 && position.offRouteKm < 1.2);
});
