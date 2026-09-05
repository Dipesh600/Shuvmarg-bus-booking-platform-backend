const { test, mock } = require("node:test");
const assert = require("node:assert");
const refundCalc = require("../../../services/refundCalculatorService");

const { createPassengerBookingCancellationService } = require("../../../src/modules/booking/passenger-booking-cancellation/passenger-booking-cancellation.service.js");

test("cancelPassengerBooking - success path", async (t) => {
  mock.method(refundCalc, "calculateRefund", async () => ({
    eligible: true,
    refundAmount: 500,
    cancellationCharge: 50,
    refundPercentage: 90,
    appliedPolicy: { name: "Test Policy" }
  }));

  const repository = {
    findBookingByTicketId: async () => ({ userId: "u1", status: "booked", tripId: "trip1", seats: ["A1"] }),
    findTripById: async () => ({ tripDate: new Date(), departureTime: "10:00" }),
    findSeatByTripId: async () => ({ seata: [{ seatNo: "A1" }] }),
    saveSeat: async () => {},
    saveBooking: async (b) => { b._saved = true; return b; }
  };
  const seatService = { freeSeats: mock.fn() };
  const refundService = { processRefundAndClawback: async () => ({ refundId: "r1" }) };
  const notificationService = { sendCancellationNotifications: mock.fn() };

  const service = createPassengerBookingCancellationService({ withTransaction: work => work(null), claimBooking: async () => true, ...repository }, seatService, refundService, notificationService);

  const result = await service.cancelPassengerBooking("T1", "u1", "reason", "original");
  assert.strictEqual(result.status, "cancelled");
  assert.strictEqual(result.refundAmount, 500);
});

test("cancelPassengerBooking - ineligible", async (t) => {
  mock.method(refundCalc, "calculateRefund", async () => ({
    eligible: false,
    reason: "Too late"
  }));

  const repo = {
    findBookingByTicketId: async () => ({ userId: "u1", status: "booked", tripId: "trip1" }),
    findTripById: async () => ({ tripDate: new Date(), departureTime: "10:00" }),
  };
  const service = createPassengerBookingCancellationService({ withTransaction: work => work(null), claimBooking: async () => true, ...repo }, {}, {}, {});
  try {
    await service.cancelPassengerBooking("T1", "u1");
    assert.fail();
  } catch (e) {
    assert.strictEqual(e.statusCode, 400);
    assert.strictEqual(e.message, "Too late");
  }
});

test("cancelPassengerBooking - seat doc missing", async (t) => {
  mock.method(refundCalc, "calculateRefund", async () => ({ eligible: true }));
  const repo = {
    findBookingByTicketId: async () => ({ userId: "u1", status: "booked", tripId: "trip1" }),
    findTripById: async () => ({ tripDate: new Date(), departureTime: "10:00" }),
    findSeatByTripId: async () => null
  };
  const service = createPassengerBookingCancellationService({ withTransaction: work => work(null), claimBooking: async () => true, ...repo }, {}, {}, {});
  try {
    await service.cancelPassengerBooking("T1", "u1");
    assert.fail();
  } catch (e) {
    assert.strictEqual(e.statusCode, 404);
  }
});
