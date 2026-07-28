const test = require("node:test");
const assert = require("node:assert");

const routes = require("../../routes/ticketRoutes/ticketRoutes");
const optionalAuth = require("../../middleware/optionalAuthMiddleware");
const tripSeatAvailability = require("../../src/modules/booking/trip-seat-availability");
test("Trip seat availability route characterization", (t) => {
  const routedLayers = routes.stack.filter((layer) => layer.route);
  
  const getSeatsRoutes = routedLayers.filter((layer) => layer.route.path === "/getSeats");
  
  // 1. exactly one `/getSeats` route exists
  assert.strictEqual(getSeatsRoutes.length, 1, "Exactly one /getSeats route should exist");
  
  const route = getSeatsRoutes[0].route;
  
  // 2. method is POST
  assert.ok(route.methods.post, "Method should be POST");
  
  const routeIndex = routedLayers.findIndex((layer) => layer.route.path === "/getSeats");
  const verifyBookingIndex = routedLayers.findIndex((layer) => layer.route.path === "/verifyBooking/:ticketId");
  const getMyTicketHistoryIndex = routedLayers.findIndex((layer) => layer.route.path === "/getMyTicketHistory");
  
  // 3. route appears after `/verifyBooking/:ticketId`
  assert.ok(routeIndex > verifyBookingIndex, "Route should appear after /verifyBooking/:ticketId");
  
  // 4. route appears before `/getMyTicketHistory`
  assert.ok(routeIndex < getMyTicketHistoryIndex, "Route should appear before /getMyTicketHistory");
  
  const handlers = route.stack.map((layer) => layer.handle);
  
  // 5. route has exactly two handlers
  assert.strictEqual(handlers.length, 2, "Route should have exactly two handlers");
  
  // 6. handler 1 accepts anonymous requests and resolves valid access tokens
  assert.strictEqual(
    handlers[0],
    optionalAuth,
    "Handler 1 should be exactly optionalAuth"
  );
  
  // 7. handler 2 is exactly `tripSeatAvailability.getTripSeatAvailability`
  assert.strictEqual(
    handlers[1],
    tripSeatAvailability.getTripSeatAvailability,
    "Final handler should be tripSeatAvailability.getTripSeatAvailability"
  );
  

  const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB");
  assert.ok(!handlers.includes(verifyRoleFromDB), "No verifyRoleFromDB handler should be present");
  
  // 9. no passenger-role handler is present
  const role = require("../../middleware/checkRole");
  const passengerRoleMiddleware = role.requireRole("passenger");
  assert.ok(
    !handlers.some((h) => h.toString() === passengerRoleMiddleware.toString()), 
    "No passenger-role handler should be present"
  );
});
