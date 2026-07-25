const test = require("node:test");
const assert = require("node:assert");
const ticketRoutes = require("../../routes/ticketRoutes/ticketRoutes");
const ticketController = require("../../controllers/ticketController/ticketController");
const auth = require("../../middleware/authMiddleware");

test("passenger-booking-cancellation routes", async (t) => {
  const routeLayers = ticketRoutes.stack.filter((layer) => layer.route);

  await t.test("cancelTicket route exists and has exact middleware and handler", () => {
    const matches = routeLayers.filter((layer) => layer.route.path === "/cancelTicket");
    assert.strictEqual(matches.length, 1);
    
    const route = matches[0].route;
    assert.strictEqual(route.methods.post, true);

    const handlers = route.stack.map((layer) => layer.handle);
    assert.strictEqual(handlers.length, 2);
    assert.strictEqual(handlers[0], auth);
    assert.strictEqual(handlers[1], ticketController.cancelTicket);
  });

  await t.test("cancelEstimate route exists and has exact middleware and handler", () => {
    const matches = routeLayers.filter((layer) => layer.route.path === "/cancelEstimate");
    assert.strictEqual(matches.length, 1);
    
    const route = matches[0].route;
    assert.strictEqual(route.methods.post, true);

    const handlers = route.stack.map((layer) => layer.handle);
    assert.strictEqual(handlers.length, 2);
    assert.strictEqual(handlers[0], auth);
    assert.strictEqual(handlers[1], ticketController.cancelEstimate);
  });
});
