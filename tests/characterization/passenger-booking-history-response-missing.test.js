const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-history-harness");
const { Types } = require("mongoose");

describe("passenger-booking-history response characterization", () => {
  let harness;
  let req;
  let res;

  beforeEach(() => {
    harness = setupHarness();
    req = { userInfo: { id: new Types.ObjectId().toString() } };
    res = {
      status: mock.fn(() => res),
      json: mock.fn(),
    };
  });

  afterEach(() => {
    harness.restore();
  });



  it("handles missing transaction and refund correctly, falls back on booking", async () => {
    const bId = new Types.ObjectId();

    const bookingDoc = {
      _id: bId,
      seats: ["A1"],
      totalAmount: 1000,
      status: "Booked",
      ticketId: "TICKET123",
      tripId: null,
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({
        lean: () => Promise.resolve([bookingDoc])
      })
    }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const item = jsonArg.data[0];
    
    assert.strictEqual(item.payment, null);
    assert.strictEqual(item.refund, null);
    
    assert.strictEqual(item.booking.review, false);
    assert.strictEqual(item.booking.refundStatus, "");
    assert.strictEqual(item.booking.refundAmount, 0);
  });

  it("overwrites duplicate map entries with later values", async () => {
    const bId = new Types.ObjectId();

    const bookingDoc = { _id: bId, tripId: null };
    
    const transaction1 = { bookingId: bId, transactionId: "TX1", gateway: "foo" };
    const transaction2 = { bookingId: bId, transactionId: "TX2", gateway: "bar" };
    
    const refund1 = { bookingId: bId, refundAmount: 100 };
    const refund2 = { bookingId: bId, refundAmount: 200 };

    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));
    harness.mocks.transactionFind.mock.mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve([transaction1, transaction2]) })
    }));
    harness.mocks.refundFind.mock.mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve([refund1, refund2]) })
    }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const item = jsonArg.data[0];
    
    assert.strictEqual(item.payment.transactionId, "TX2");
    assert.strictEqual(item.payment.gateway, "bar");
    assert.strictEqual(item.refund.refundAmount, 200);
    assert.strictEqual(item.booking.refundAmount, 200);
  });
});
