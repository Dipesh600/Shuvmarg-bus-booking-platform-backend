const test = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-cancellation-harness");
const mongoose = require("mongoose");

test("passenger-booking-cancellation success characterization", async (t) => {
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

  await t.test("successful cancellation returns 200 with correct body and saves booking", async () => {
    req.body = { ticketId: "T123", cancelReason: "Changed mind" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    
    let bookingSaved = false;
    const booking = {
      _id: new mongoose.Types.ObjectId(),
      ticketId: "T123",
      userId,
      status: "booked",
      tripId: new mongoose.Types.ObjectId(),
      totalAmount: 1000,
      seats: ["A1"],
      save: async function() {
        bookingSaved = true;
      }
    };
    
    const trip = { tripDate: "2026-07-25", departureTime: "10:00" };
    
    let seatSaved = false;
    const seatDoc = {
      seata: [{ seatNo: "a1", booked: true, bookedBy: "user", bookedAt: new Date() }],
      seatb: [],
      seatc: [],
      markModified: () => {},
      save: async function() {
        seatSaved = true;
      }
    };

    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.tripFindById.mock.mockImplementation(() => {
      // First call returns trip, second call returns trip with populate
      return { populate: () => Promise.resolve(trip) };
    });
    harness.mocks.calculateRefund.mock.mockImplementationOnce(() => Promise.resolve({
      eligible: true,
      refundAmount: 800,
      cancellationCharge: 200,
      refundPercentage: 80,
      appliedPolicy: { name: "Standard" }
    }));
    harness.mocks.seatFindOne.mock.mockImplementationOnce(() => Promise.resolve(seatDoc));
    harness.mocks.refundCreate.mock.mockImplementationOnce(() => Promise.resolve({ _id: "refund123" }));

    await harness.passengerBookingCancellation.cancelPassengerBooking(req, res);
    
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body, {
      status: true,
      message: "Booking cancelled successfully",
      data: {
        ticketId: "T123",
        status: "cancelled",
        refundAmount: 800,
        cancellationCharge: 200,
        refundPercentage: 80,
        appliedPolicy: "Standard",
        seats: ["A1"],
      }
    });

    assert.strictEqual(bookingSaved, true);
    assert.strictEqual(booking.status, "cancelled");
    assert.strictEqual(booking.cancellationReason, "Changed mind");
    assert.strictEqual(booking.cancelledBy, "user");
    assert.strictEqual(booking.refundId, "refund123");
    assert.ok(booking.cancellationRequestedAt instanceof Date);

    assert.strictEqual(seatSaved, true);
    assert.strictEqual(seatDoc.seata[0].booked, false);
    assert.strictEqual(seatDoc.seata[0].bookedBy, null);
    assert.strictEqual(seatDoc.seata[0].bookedAt, null);
  });
});
