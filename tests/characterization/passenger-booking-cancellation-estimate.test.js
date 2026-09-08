const test = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-cancellation-harness");
const mongoose = require("mongoose");

test("passenger-booking-cancellation estimate characterization", async (t) => {
  const harness = setupHarness();
  const req = { body: {}, userInfo: {} };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  t.after(() => harness.restore());

  await t.test("missing ticketId returns 400", async () => {
    req.body = {};
    req.userInfo = { id: "user1" };
    await harness.passengerBookingCancellation.estimatePassengerBookingCancellation(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { status: false, message: "ticketId is required" });
  });

  await t.test("missing booking returns 404", async () => {
    req.body = { ticketId: "T123" };
    req.userInfo = { id: "user1" };
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(null));
    await harness.passengerBookingCancellation.estimatePassengerBookingCancellation(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { status: false, message: "Booking not found" });
  });

  await t.test("ownership mismatch returns 403", async () => {
    req.body = { ticketId: "T123" };
    req.userInfo = { id: "user1" };
    const booking = { userId: new mongoose.Types.ObjectId() };
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    await harness.passengerBookingCancellation.estimatePassengerBookingCancellation(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { status: false, message: "You are not authorized to view this booking" });
  });

  await t.test("non-booked status returns 400", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    const booking = { userId, status: "cancelled" };
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    await harness.passengerBookingCancellation.estimatePassengerBookingCancellation(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { status: false, message: "Cannot cancel a booking with status 'cancelled'" });
  });

  await t.test("missing trip returns 404 without period", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    const booking = { userId, status: "booked", tripId: new mongoose.Types.ObjectId() };
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.tripFindById.mock.mockImplementationOnce(() => Promise.resolve(null));
    
    await harness.passengerBookingCancellation.estimatePassengerBookingCancellation(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { status: false, message: "Trip details not found" });
  });

  await t.test("success calculates refund estimate and returns correct structure", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    const booking = { ticketId: "T123", userId, status: "booked", tripId: new mongoose.Types.ObjectId(), totalAmount: 1000 };
    const trip = { tripDate: "2026-07-25", departureTime: "10:00" };
    
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.tripFindById.mock.mockImplementationOnce(() => Promise.resolve(trip));
    
    let calcArgs;
    harness.mocks.calculateRefund.mock.mockImplementationOnce((args) => {
      calcArgs = args;
      return Promise.resolve({
        eligible: true,
        reason: "Valid timeframe",
        refundAmount: 800,
        cancellationCharge: 200,
        gatewayDeduction: 0,
        refundPercentage: 80,
        hoursBeforeDeparture: 12,
        appliedPolicy: "Standard Policy"
      });
    });

    await harness.passengerBookingCancellation.estimatePassengerBookingCancellation(req, res);
    
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(calcArgs, {
      policySnapshot: undefined, smMoneyUsed: undefined, gatewayAmount: undefined, paymentMethod: undefined,
      totalAmount: 1000,
      tripDate: "2026-07-25",
      departureTime: "10:00"
    });
    
    assert.deepStrictEqual(res.body, {
      status: true,
      message: "Refund estimate calculated",
      data: {
        ticketId: "T123",
        ticketFare: 1000,
        eligible: true,
        reason: "Valid timeframe",
        refundAmount: 800,
        cancellationCharge: 200,
        gatewayDeduction: 0,
        refundPercentage: 80,
        hoursBeforeDeparture: 12,
        appliedPolicy: "Standard Policy"
      }
    });
  });
});
