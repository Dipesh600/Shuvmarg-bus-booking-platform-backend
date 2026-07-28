const { test } = require("node:test");
const assert = require("node:assert");
const { createPassengerBookingCancellationEstimateService } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation-estimate.service.js");

test("estimatePassengerBookingCancellation - missing ticketId", async () => {
  const service = createPassengerBookingCancellationEstimateService({});
  try {
    await service.estimatePassengerBookingCancellation(null, "user1");
    assert.fail("Should throw");
  } catch (err) {
    assert.strictEqual(err.statusCode, 400);
    assert.strictEqual(err.message, "ticketId is required");
  }
});

test("estimatePassengerBookingCancellation - booking not found", async () => {
  const repository = {
    findBookingByTicketId: async () => null
  };
  const service = createPassengerBookingCancellationEstimateService(repository);
  try {
    await service.estimatePassengerBookingCancellation("T1", "user1");
    assert.fail("Should throw");
  } catch (err) {
    assert.strictEqual(err.statusCode, 404);
  }
});

test("estimatePassengerBookingCancellation - unauthorized", async () => {
  const repository = {
    findBookingByTicketId: async () => ({ userId: "other" })
  };
  const service = createPassengerBookingCancellationEstimateService(repository);
  try {
    await service.estimatePassengerBookingCancellation("T1", "user1");
    assert.fail("Should throw");
  } catch (err) {
    assert.strictEqual(err.statusCode, 403);
  }
});

test("estimatePassengerBookingCancellation - wrong status", async () => {
  const repository = {
    findBookingByTicketId: async () => ({ userId: "user1", status: "cancelled" })
  };
  const service = createPassengerBookingCancellationEstimateService(repository);
  try {
    await service.estimatePassengerBookingCancellation("T1", "user1");
    assert.fail("Should throw");
  } catch (err) {
    assert.strictEqual(err.statusCode, 400);
  }
});

test("estimatePassengerBookingCancellation - trip not found", async () => {
  const repository = {
    findBookingByTicketId: async () => ({ userId: "user1", status: "booked" }),
    findTripById: async () => null
  };
  const service = createPassengerBookingCancellationEstimateService(repository);
  try {
    await service.estimatePassengerBookingCancellation("T1", "user1");
    assert.fail("Should throw");
  } catch (err) {
    assert.strictEqual(err.statusCode, 404);
  }
});
