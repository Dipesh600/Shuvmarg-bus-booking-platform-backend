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

  it("proves exact HTTP 200 body and field matching", async () => {
    const bId = new Types.ObjectId();
    const tId = new Types.ObjectId();
    const rId = new Types.ObjectId();

    const bookingDoc = {
      _id: bId,
      seats: ["A1"],
      totalAmount: 1000,
      status: "Booked",
      ticketId: "TICKET123",
      refundStatus: "Pending",
      refundAmount: 50,
      tripId: null,
    };
    
    const transactionDoc = {
      bookingId: bId,
      gateway: "eSewa",
      transactionId: "TX123",
      status: "COMPLETE",
      totalAmount: 1000,
      paidAt: new Date("2023-01-01T00:00:00Z"),
    };

    const reviewDoc = {
      bookingId: bId,
    };

    const refundDoc = {
      bookingId: bId,
      refundAmount: 500,
      cancellationCharge: 100,
      originalAmount: 1000,
      status: "Completed",
      requestedAt: new Date("2023-01-02T00:00:00Z"),
      processedAt: new Date("2023-01-03T00:00:00Z"),
      completedAt: new Date("2023-01-04T00:00:00Z"),
      reason: "Changed plans",
      remarks: "Ok",
      refundGateway: "eSewa",
      destination: "original_source",
    };

    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({
        lean: () => Promise.resolve([bookingDoc])
      })
    }));
    harness.mocks.transactionFind.mock.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve([transactionDoc])
      })
    }));
    harness.mocks.reviewFind.mock.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve([reviewDoc])
      })
    }));
    harness.mocks.refundFind.mock.mockImplementation(() => ({
      select: () => ({
        lean: () => Promise.resolve([refundDoc])
      })
    }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    assert.deepStrictEqual(Object.keys(jsonArg), ["status", "message", "data"]);
    assert.strictEqual(jsonArg.status, true);
    assert.strictEqual(jsonArg.message, "Successfully fetched Booking History");
    assert.strictEqual(jsonArg.data.length, 1);

    const item = jsonArg.data[0];
    assert.deepStrictEqual(Object.keys(item), ["booking", "trip", "payment", "refund"]);
    
    assert.deepStrictEqual(item.booking, {
      seats: ["A1"],
      totalAmount: 1000,
      status: "Booked",
      refundStatus: "Completed",
      refundAmount: 500,
      ticketId: "TICKET123",
      bookingId: bId,
      review: true,
    });

    assert.strictEqual(item.trip, null);

    assert.deepStrictEqual(item.payment, {
      gateway: "eSewa",
      transactionId: "TX123",
      status: "COMPLETE",
      totalAmount: 1000,
      paidAt: transactionDoc.paidAt,
    });

    assert.deepStrictEqual(item.refund, {
      refundAmount: 500,
      cancellationCharge: 100,
      originalAmount: 1000,
      status: "Completed",
      requestedAt: refundDoc.requestedAt,
      processedAt: refundDoc.processedAt,
      completedAt: refundDoc.completedAt,
      reason: "Changed plans",
      remarks: "Ok",
      refundGateway: "eSewa",
      destination: "original_source",
    });
  });


});
