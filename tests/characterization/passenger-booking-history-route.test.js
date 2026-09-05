const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB");
const { describe, it } = require("node:test");
const assert = require("node:assert");
const routes = require("../../routes/ticketRoutes/ticketRoutes");
const auth = require("../../middleware/authMiddleware");
const passengerBookingHistory = require("../../src/modules/booking/passenger-booking-history");

describe("passenger-booking-history route characterization", () => {
  it("has exactly one /getMyTicketHistory GET route with correct handlers", () => {
    const routedLayers = routes.stack.filter((layer) => layer.route);
    const matches = routedLayers.filter((layer) => layer.route.path === "/getMyTicketHistory");
    assert.strictEqual(matches.length, 1);
    
    const routeIndex = routedLayers.findIndex((layer) => layer.route.path === "/getMyTicketHistory");
    const seatsIndex = routedLayers.findIndex((layer) => layer.route.path === "/getSeats");
    // /getMyYatraHistory has been retired — only assert that /getSeats precedes /getMyTicketHistory
    assert.ok(seatsIndex < routeIndex, "/getSeats must appear before /getMyTicketHistory");
    
    const route = matches[0].route;
    assert.ok(route.methods.get);
    
    const handlers = route.stack.map((layer) => layer.handle);
    assert.strictEqual(handlers.length, 3);
    assert.strictEqual(handlers[0], auth);
    assert.strictEqual(handlers[1], verifyRoleFromDB);
    assert.strictEqual(handlers[2], passengerBookingHistory.getPassengerBookingHistory);
  });
});
