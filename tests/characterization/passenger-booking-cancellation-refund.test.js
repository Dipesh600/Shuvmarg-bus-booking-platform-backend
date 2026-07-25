const test = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-cancellation-harness");
const mongoose = require("mongoose");

test("passenger-booking-cancellation refund characterization", async (t) => {
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

  await t.test("refund calculates correctly, handles cashback clawback logging but continues, creates refund record", async () => {
    req.body = { ticketId: "T123", refundMethod: "original" };
    const userId = new mongoose.Types.ObjectId();
    req.userInfo = { id: userId.toString() };
    
    const booking = {
      _id: new mongoose.Types.ObjectId(),
      ticketId: "T123",
      userId,
      status: "booked",
      tripId: new mongoose.Types.ObjectId(),
      totalAmount: 1000,
      seats: ["A1"],
      save: async () => {}
    };
    const trip = { tripDate: "2026-07-25", departureTime: "10:00" };
    const seatDoc = { seata: [], seatb: [], seatc: [], markModified: () => {}, save: async () => {} };

    harness.mocks.bookingFindOne.mock.mockImplementationOnce(() => Promise.resolve(booking));
    harness.mocks.tripFindById.mock.mockImplementation(() => Promise.resolve({
      tripDate: "2026-07-25",
      departureTime: "10:00",
      populate: () => Promise.resolve({ routeId: { from: "KTM", to: "PKR" } })
    }));
    harness.mocks.calculateRefund.mock.mockImplementationOnce((args) => {
      assert.deepStrictEqual(args, {
        totalAmount: 1000,
        tripDate: "2026-07-25",
        departureTime: "10:00",
      });
      return Promise.resolve({ eligible: true, refundAmount: 800, cancellationCharge: 200 });
    });
    harness.mocks.seatFindOne.mock.mockImplementationOnce(() => Promise.resolve(seatDoc));
    
    // Trigger positive clawback
    harness.mocks.clawbackCashback.mock.mockImplementationOnce(() => Promise.resolve({ clawedBack: 100 }));
    
    let createdRefund;
    harness.mocks.refundCreate.mock.mockImplementationOnce((data) => {
      createdRefund = data;
      return Promise.resolve({ _id: "refund123" });
    });

    await harness.ticketController.cancelTicket(req, res);
    
    assert.strictEqual(res.statusCode, 200);

    // Validate refund creation
    assert.strictEqual(createdRefund.status, "pending");
    assert.strictEqual(createdRefund.refundGateway, null);
    assert.strictEqual(createdRefund.originalAmount, 1000);
    assert.strictEqual(createdRefund.refundAmount, 800);
    assert.strictEqual(createdRefund.cancellationCharge, 200);
    assert.strictEqual(createdRefund.reason, "User cancelled");
    assert.ok(createdRefund.requestedAt instanceof Date);
    assert.strictEqual(createdRefund.processedAt, null);
    assert.strictEqual(createdRefund.completedAt, null);
  });
});
