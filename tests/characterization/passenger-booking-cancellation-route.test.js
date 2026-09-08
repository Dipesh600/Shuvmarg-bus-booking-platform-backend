const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB");
const test = require("node:test");
const assert = require("node:assert");
const ticketRoutes = require("../../routes/ticketRoutes/ticketRoutes");
const auth = require("../../middleware/authMiddleware");
const passengerBookingCancellation = require("../../src/modules/booking/passenger-booking-cancellation");

test("passenger-booking-cancellation routes", async (t) => {
  const routeLayers = ticketRoutes.stack.filter((layer) => layer.route);

  await t.test("cancelTicket route exists and has exact middleware and handler", () => {
    const matches = routeLayers.filter((layer) => layer.route.path === "/cancelTicket");
    assert.strictEqual(matches.length, 1);
    
    const route = matches[0].route;
    assert.strictEqual(route.methods.post, true);

    const handlers = route.stack.map((layer) => layer.handle);
    assert.strictEqual(handlers.length, 3);
    assert.strictEqual(handlers[0], auth);
    assert.strictEqual(handlers[1], verifyRoleFromDB);
    assert.strictEqual(handlers[2], passengerBookingCancellation.cancelPassengerBooking);
  });

  await t.test("cancelEstimate route exists and has exact middleware and handler", () => {
    const matches = routeLayers.filter((layer) => layer.route.path === "/cancelEstimate");
    assert.strictEqual(matches.length, 1);
    
    const route = matches[0].route;
    assert.strictEqual(route.methods.post, true);

    const handlers = route.stack.map((layer) => layer.handle);
    assert.strictEqual(handlers.length, 3);
    assert.strictEqual(handlers[0], auth);
    assert.strictEqual(handlers[1], verifyRoleFromDB);
    assert.strictEqual(handlers[2], passengerBookingCancellation.estimatePassengerBookingCancellation);
  });

  await t.test("operator refund destination route is authenticated", () => {
    const matches = routeLayers.filter((layer) => layer.route.path === "/selectRefundDestination");
    assert.strictEqual(matches.length, 1);
    const route = matches[0].route;
    assert.strictEqual(route.methods.post, true);
    const handlers = route.stack.map((layer) => layer.handle);
    assert.deepStrictEqual(handlers, [auth, verifyRoleFromDB,
      passengerBookingCancellation.selectOperatorRefundDestination]);
  });
});
