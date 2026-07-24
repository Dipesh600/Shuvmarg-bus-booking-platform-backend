const test = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-cancellation-harness");
const mongoose = require("mongoose");

test("passenger-booking-cancellation wallet characterization", async (t) => {
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

  await t.test("wallet method correctly triggers wallet service and uses wallet values for refund", async () => {
    req.body = { ticketId: "T123", refundMethod: "wallet" };
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
    harness.mocks.tripFindById.mock.mockImplementation(() => ({ populate: () => Promise.resolve(trip) }));
    harness.mocks.calculateRefund.mock.mockImplementationOnce(() => Promise.resolve({ eligible: true, refundAmount: 800, cancellationCharge: 200 }));
    harness.mocks.seatFindOne.mock.mockImplementationOnce(() => Promise.resolve(seatDoc));
    
    let creditWalletArgs;
    harness.mocks.creditWallet.mock.mockImplementationOnce((args) => {
      creditWalletArgs = args;
      return Promise.resolve({});
    });
    
    let createdRefund;
    harness.mocks.refundCreate.mock.mockImplementationOnce((data) => {
      createdRefund = data;
      return Promise.resolve({ _id: "refund123" });
    });

    await harness.ticketController.cancelTicket(req, res);
    
    assert.strictEqual(res.statusCode, 200);

    // Validate credit wallet arguments
    assert.deepStrictEqual(creditWalletArgs, {
      userId: userId.toString(),
      amount: 800,
      purpose: "refund",
      referenceType: "refund",
      referenceId: booking._id,
      remarks: `Instant refund for cancelled ticket T123`
    });

    // Validate refund creation for wallet
    assert.strictEqual(createdRefund.status, "completed");
    assert.strictEqual(createdRefund.refundGateway, "yatra_balance");
    assert.strictEqual(createdRefund.remarks, "Refunded instantly to Shuvmarg Money");
    assert.ok(createdRefund.processedAt instanceof Date);
    assert.ok(createdRefund.completedAt instanceof Date);
    assert.notStrictEqual(createdRefund.processedAt, createdRefund.completedAt); // Not exactly the same instance if Date called twice, but effectively yes. Actually in original code it's `processedAt = new Date(); completedAt = new Date();` so they are distinct instances.
  });

  await t.test("wallet credit failure falls back to pending queue", async () => {
    req.body = { ticketId: "T123", refundMethod: "wallet" };
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
    harness.mocks.tripFindById.mock.mockImplementation(() => ({ populate: () => Promise.resolve(trip) }));
    harness.mocks.calculateRefund.mock.mockImplementationOnce(() => Promise.resolve({ eligible: true, refundAmount: 800, cancellationCharge: 200 }));
    harness.mocks.seatFindOne.mock.mockImplementationOnce(() => Promise.resolve(seatDoc));
    
    harness.mocks.creditWallet.mock.mockImplementationOnce(() => Promise.reject(new Error("Network Error")));
    
    let createdRefund;
    harness.mocks.refundCreate.mock.mockImplementationOnce((data) => {
      createdRefund = data;
      return Promise.resolve({ _id: "refund123" });
    });

    await harness.ticketController.cancelTicket(req, res);
    
    assert.strictEqual(res.statusCode, 200);

    // Validate refund creation fallback
    assert.strictEqual(createdRefund.status, "pending");
    assert.strictEqual(createdRefund.refundGateway, null);
    assert.strictEqual(createdRefund.remarks, "Failed instant Yatra Balance refund: Network Error. Queued for manual check.");
    assert.strictEqual(createdRefund.processedAt, null);
    assert.strictEqual(createdRefund.completedAt, null);
  });
});
