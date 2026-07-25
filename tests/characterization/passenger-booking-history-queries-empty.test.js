const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-history-harness");
const { Types } = require("mongoose");

describe("passenger-booking-history queries characterization", () => {
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



  it("handles empty bookings but still executes remaining three queries with $in: []", async () => {
    const bookingQueryMock = mock.fn(() => ({
      populate: mock.fn(() => ({
        lean: mock.fn(() => Promise.resolve([]))
      }))
    }));
    const transactionQueryMock = mock.fn(() => ({
      select: mock.fn(() => ({
        lean: mock.fn(() => Promise.resolve([]))
      }))
    }));
    const reviewQueryMock = mock.fn(() => ({
      select: mock.fn(() => ({
        lean: mock.fn(() => Promise.resolve([]))
      }))
    }));
    const refundQueryMock = mock.fn(() => ({
      select: mock.fn(() => ({
        lean: mock.fn(() => Promise.resolve([]))
      }))
    }));

    harness.mocks.bookingFind.mock.mockImplementation(bookingQueryMock);
    harness.mocks.transactionFind.mock.mockImplementation(transactionQueryMock);
    harness.mocks.reviewFind.mock.mockImplementation(reviewQueryMock);
    harness.mocks.refundFind.mock.mockImplementation(refundQueryMock);

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    assert.strictEqual(harness.mocks.bookingFind.mock.callCount(), 1);
    
    assert.strictEqual(harness.mocks.transactionFind.mock.callCount(), 1);
    assert.deepStrictEqual(harness.mocks.transactionFind.mock.calls[0].arguments[0], { bookingId: { $in: [] } });
    
    assert.strictEqual(harness.mocks.reviewFind.mock.callCount(), 1);
    assert.deepStrictEqual(harness.mocks.reviewFind.mock.calls[0].arguments[0], { userId: req.userInfo.id, bookingId: { $in: [] } });

    assert.strictEqual(harness.mocks.refundFind.mock.callCount(), 1);
    assert.deepStrictEqual(harness.mocks.refundFind.mock.calls[0].arguments[0], { bookingId: { $in: [] } });
    
    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
    const jsonArgs = res.json.mock.calls[0].arguments[0];
    assert.deepStrictEqual(jsonArgs.data, []);
  });
});
