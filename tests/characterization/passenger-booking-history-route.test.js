const { describe, it } = require("node:test");
const assert = require("node:assert");
const routes = require("../../routes/ticketRoutes/ticketRoutes");
const auth = require("../../middleware/authMiddleware");
const ticketController = require("../../controllers/ticketController/ticketController");

describe("passenger-booking-history route characterization", () => {
  it("has exactly one /getMyTicketHistory GET route with correct handlers", () => {
    const routedLayers = routes.stack.filter((layer) => layer.route);
    const matches = routedLayers.filter((layer) => layer.route.path === "/getMyTicketHistory");
    assert.strictEqual(matches.length, 1);
    
    const routeIndex = routedLayers.findIndex((layer) => layer.route.path === "/getMyTicketHistory");
    const seatsIndex = routedLayers.findIndex((layer) => layer.route.path === "/getSeats");
    const yatraIndex = routedLayers.findIndex((layer) => layer.route.path === "/getMyYatraHistory");
    assert.ok(seatsIndex < routeIndex && routeIndex < yatraIndex, "route position");
    
    const route = matches[0].route;
    assert.ok(route.methods.get);
    
    const handlers = route.stack.map((layer) => layer.handle);
    assert.strictEqual(handlers.length, 2);
    assert.strictEqual(handlers[0], auth);
    
    const passengerBookingHistory = require("../../src/modules/booking/passenger-booking-history");
    assert.strictEqual(handlers[1], passengerBookingHistory.getPassengerBookingHistory);
    assert.strictEqual(ticketController.getMyTicketHistory, passengerBookingHistory.getPassengerBookingHistory);
  });
});
