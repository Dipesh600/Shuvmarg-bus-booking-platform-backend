const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-history-harness");
const { Types } = require("mongoose");

describe("passenger-booking-history error characterization", () => {
  let harness;
  let req;
  let res;
  let consoleErrorMock;

  beforeEach(() => {
    harness = setupHarness();
    req = { userInfo: { id: new Types.ObjectId().toString() } };
    res = {
      status: mock.fn(() => res),
      json: mock.fn(),
    };
    consoleErrorMock = mock.method(console, "error", () => {});
  });

  afterEach(() => {
    harness.restore();
    consoleErrorMock.mock.restore();
  });

  async function assertExact500Behavior(err) {
    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    assert.deepStrictEqual(jsonArg, {
      status: false,
      message: "Internal Server Error",
    });

    assert.strictEqual(consoleErrorMock.mock.callCount(), 1);
    assert.strictEqual(consoleErrorMock.mock.calls[0].arguments[0], err);
  }



  it("handles truthy non-array fleetImages", async () => {
    const bookingDoc = {
      _id: new Types.ObjectId(),
      tripId: {
        busId: { fleetImages: "not-an-array" }
      }
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));
    harness.mocks.transactionFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));
    harness.mocks.reviewFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));
    harness.mocks.refundFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);
    assert.ok(consoleErrorMock.mock.calls[0].arguments[0] instanceof TypeError);
  });

  it("handles malformed bookings value that causes transformation failure", async () => {
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([null]) }) // null booking will throw when accessing _id
    }));
    harness.mocks.transactionFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));
    harness.mocks.reviewFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));
    harness.mocks.refundFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 500);
    assert.ok(consoleErrorMock.mock.calls[0].arguments[0] instanceof TypeError);
  });
});
