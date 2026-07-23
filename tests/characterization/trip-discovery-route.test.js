const { test } = require("node:test");
const assert = require("node:assert");
const publicRoute = require("../../routes/publicRoutes/publicRoute");
const tripDiscovery = require("../../src/modules/trip-discovery");

test("Trip Discovery Router Integration", async (t) => {
  await t.test("Router exposes POST /searchTrips pointing to trip-discovery controller", () => {
    // Find the layer matching /searchTrips
    const layer = publicRoute.stack.find(
      l => l.route && l.route.path === "/searchTrips"
    );

    assert.ok(layer, "Expected route /searchTrips to exist");
    assert.strictEqual(layer.route.methods.post, true, "Expected /searchTrips to accept POST");

    // The handler should be exactly the one exported by the trip-discovery module
    const handler = layer.route.stack[0].handle;
    assert.strictEqual(handler, tripDiscovery.searchTrips, "Expected handler to be tripDiscovery.searchTrips");
  });
});
