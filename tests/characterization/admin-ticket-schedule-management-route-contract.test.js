"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const routes = require("../../routes/adminRoutes/adminRoutes.js");
const adminMiddleware = require("../../middleware/adminMiddleware.js");
const tickets = require(
  "../../src/modules/admin/ticket-schedule-management"
);

test("legacy admin ticket and schedule routes keep exact handler identities",
  () => {
    const expected = [
      ["get", "/getAllTicket", tickets.getAllTickets],
      ["delete", "/ticket/schedule/delete/:id", tickets.deleteTicket],
      ["post", "/ticket/create-route", tickets.createRoute],
      ["get", "/ticket/getAllRoutes", tickets.getAllRoutes],
      ["get", "/ticket/getRouteById/:id", tickets.getRouteById],
      ["patch", "/ticket/updateRoute/:id", tickets.updateRoute],
      ["delete", "/ticket/deleteRoute/:id", tickets.deleteRoute],
      ["patch", "/ticket/toggleRouteStatus/:id", tickets.toggleRouteStatus],
      ["post", "/ticket/createTicket", tickets.createTicket],
      ["get", "/ticket/getTicketById/:id", tickets.getTicketById],
      ["patch", "/ticket/updateTicket/:id", tickets.updateTicket],
      ["patch", "/ticket/updateTicketStatus/:id", tickets.updateTicketStatus],
      ["delete", "/ticket/deleteTicket/:id", tickets.deleteTicket],
    ];
    const layers = routes.stack.filter((layer) => layer.route);
    for (const [method, path, handler] of expected) {
      const matches = layers.filter(
        (layer) => layer.route.path === path && layer.route.methods[method]
      );
      assert.equal(matches.length, 1, `${method.toUpperCase()} ${path}`);
      assert.deepEqual(
        matches[0].route.stack.map((layer) => layer.handle),
        [adminMiddleware, handler]
      );
    }
  });
