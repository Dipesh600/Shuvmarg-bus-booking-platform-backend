"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const router = require("../../routes/ticketRoutes/ticketRoutes");
const auth = require("../../middleware/authMiddleware.js");
const verifyRoleFromDB = require("../../middleware/verifyRoleFromDB.js");
const role = require("../../middleware/checkRole.js");
const requireApprovedBusOwner = require("../../middleware/requireApprovedBusOwner.js");
const paymentBooking = require("../../controllers/ticketController/paymentBookingController.js");
const passengerSeatHold = require("../../src/modules/booking/passenger-seat-hold");
const bookingVerification = require("../../src/modules/booking/booking-verification");
const busOwnerScheduleManagement = require("../../src/modules/bus-owner/schedule-management");

test("bus-owner schedule management route wiring characterization", async (t) => {
  await t.test("all four schedule endpoints use new schedule-management handlers with intact middleware order", () => {
    const routes = router.stack.filter((layer) => layer.route);

    const findRoute = (path, method) =>
      routes.find((l) => l.route.path === path && l.route.methods[method]);

    const createRoute  = findRoute("/createTicket", "post");
    const updateRoute  = findRoute("/updateTicket", "patch");
    const deleteRoute  = findRoute("/deleteTicket", "delete");
    const getByIdRoute = findRoute("/getTicketById", "post");
    const prepareRoute = findRoute("/prepareBooking", "post");
    const confirmRoute = findRoute("/confirmBooking", "post");
    const verifyRoute  = findRoute("/verifyBooking/:ticketId", "get");

    assert.ok(createRoute,  "POST /createTicket exists");
    assert.ok(updateRoute,  "PATCH /updateTicket exists");
    assert.ok(deleteRoute,  "DELETE /deleteTicket exists");
    assert.ok(getByIdRoute, "POST /getTicketById exists");
    // retired paths must be absent
    assert.ok(!findRoute("/creatSeats",  "post"), "POST /creatSeats must be absent (retired)");
    assert.ok(!findRoute("/bookTicket",  "post"), "POST /bookTicket must be absent (retired)");
    assert.ok(prepareRoute, "POST /prepareBooking exists");
    assert.ok(confirmRoute, "POST /confirmBooking exists");
    assert.ok(verifyRoute,  "GET /verifyBooking/:ticketId exists");

    const getHandles = (r) => r.route.stack.map((layer) => layer.handle);

    const expectedBusOwnerGuard = [
      auth,
      verifyRoleFromDB,
      role.busOwnerMiddleware,
      requireApprovedBusOwner,
    ];

    for (const r of [createRoute, updateRoute, deleteRoute, getByIdRoute]) {
      assert.deepEqual(getHandles(r).slice(0, 4), expectedBusOwnerGuard);
    }

    assert.equal(getHandles(createRoute).at(-1),  busOwnerScheduleManagement.createSchedule);
    assert.equal(getHandles(updateRoute).at(-1),  busOwnerScheduleManagement.updateSchedule);
    assert.equal(getHandles(deleteRoute).at(-1),  busOwnerScheduleManagement.deleteSchedule);
    assert.equal(getHandles(getByIdRoute).at(-1), busOwnerScheduleManagement.getScheduleById);

    assert.equal(getHandles(prepareRoute).at(-1), paymentBooking.prepareBooking);
    assert.equal(getHandles(confirmRoute).at(-2), passengerSeatHold.requireOwnedActivePassengerSeatHold);
    assert.equal(getHandles(confirmRoute).at(-1), paymentBooking.confirmBooking);
    assert.equal(getHandles(verifyRoute).at(-1),  bookingVerification.verifyBooking);
  });
});
