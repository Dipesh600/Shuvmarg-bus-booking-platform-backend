const test = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-cancellation-harness");
const mongoose = require("mongoose");

test("passenger-booking-cancellation validation characterization", async (t) => {
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
    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { status: false, message: "ticketId is required" });
  });

  await t.test("missing booking returns 404", async () => {
    req.body = { ticketId: "T123" };
    req.userInfo = { id: "user1" };
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(null));
    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { status: false, message: "Booking not found" });
  });

  await t.test("ownership mismatch returns 403", async () => {
    req.body = { ticketId: "T123" };
    req.userInfo = { id: "user1" };
    const booking = { userId: new mongoose.Types.ObjectId() }; // different user id
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(res.body, { status: false, message: "You are not authorized to cancel this booking" });
  });

  await t.test("non-booked status returns 400", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    const booking = { userId, status: "cancelled" };
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { status: false, message: "Cannot cancel a booking with status 'cancelled'" });
  });

  await t.test("missing trip returns 404 with period", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    const booking = { userId, status: "booked", tripId: new mongoose.Types.ObjectId() };
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.tripFindById.mock.mockImplementationOnce(() => Promise.resolve(null));
    
    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { status: false, message: "Trip details not found." });
  });

  await t.test("ineligible refund returns 400", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    const booking = { userId, status: "booked", tripId: new mongoose.Types.ObjectId(), totalAmount: 1000 };
    const trip = { tripDate: "2026-07-25", departureTime: "10:00" };
    
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.tripFindById.mock.mockImplementationOnce(() => Promise.resolve(trip));
    harness.mocks.calculateRefund.mock.mockImplementationOnce(() => Promise.resolve({ eligible: false, reason: "Too late" }));

    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    assert.strictEqual(res.statusCode, 400);
    assert.deepStrictEqual(res.body, { status: false, message: "Too late" });
  });

  await t.test("missing seat document returns 404", async () => {
    req.body = { ticketId: "T123" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    const booking = { userId, status: "booked", tripId: new mongoose.Types.ObjectId(), totalAmount: 1000 };
    const trip = { tripDate: "2026-07-25", departureTime: "10:00" };
    
    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.tripFindById.mock.mockImplementationOnce(() => Promise.resolve(trip));
    harness.mocks.calculateRefund.mock.mockImplementationOnce(() => Promise.resolve({ eligible: true, refundAmount: 500 }));
    harness.mocks.seatFindOne.mock.mockImplementationOnce(() => Promise.resolve(null));

    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    assert.strictEqual(res.statusCode, 404);
    assert.deepStrictEqual(res.body, { status: false, message: "Seat data not found for trip." });
  });
});
