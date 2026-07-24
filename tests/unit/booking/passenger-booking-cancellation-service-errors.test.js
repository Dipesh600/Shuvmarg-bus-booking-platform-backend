const { test } = require("node:test");
const assert = require("node:assert");
const { createPassengerBookingCancellationService } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation.service.js");

test("cancelPassengerBooking - missing ticketId", async () => {
  const service = createPassengerBookingCancellationService({}, {}, {}, {});
  try {
    await service.cancelPassengerBooking(null, "u1");
    assert.fail();
  } catch (e) {
    assert.strictEqual(e.statusCode, 400);
  }
});

test("cancelPassengerBooking - booking not found", async () => {
  const repo = { findBookingByTicketId: async () => null };
  const service = createPassengerBookingCancellationService(repo, {}, {}, {});
  try {
    await service.cancelPassengerBooking("T1", "u1");
    assert.fail();
  } catch (e) {
    assert.strictEqual(e.statusCode, 404);
  }
});

test("cancelPassengerBooking - unauthorized", async () => {
  const repo = { findBookingByTicketId: async () => ({ userId: "other" }) };
  const service = createPassengerBookingCancellationService(repo, {}, {}, {});
  try {
    await service.cancelPassengerBooking("T1", "u1");
    assert.fail();
  } catch (e) {
    assert.strictEqual(e.statusCode, 403);
  }
});

test("cancelPassengerBooking - wrong status", async () => {
  const repo = { findBookingByTicketId: async () => ({ userId: "u1", status: "cancelled" }) };
  const service = createPassengerBookingCancellationService(repo, {}, {}, {});
  try {
    await service.cancelPassengerBooking("T1", "u1");
    assert.fail();
  } catch (e) {
    assert.strictEqual(e.statusCode, 400);
  }
});

test("cancelPassengerBooking - trip not found", async () => {
  const repo = {
    findBookingByTicketId: async () => ({ userId: "u1", status: "booked" }),
    findTripById: async () => null
  };
  const service = createPassengerBookingCancellationService(repo, {}, {}, {});
  try {
    await service.cancelPassengerBooking("T1", "u1");
    assert.fail();
  } catch (e) {
    assert.strictEqual(e.statusCode, 404);
  }
});
