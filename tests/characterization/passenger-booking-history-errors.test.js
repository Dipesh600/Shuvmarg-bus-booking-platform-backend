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

  it("handles missing req.userInfo", async () => {
    req.userInfo = undefined;
    
    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);
    
    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(consoleErrorMock.mock.callCount(), 1);
    const err = consoleErrorMock.mock.calls[0].arguments[0];
    assert.ok(err instanceof TypeError);
    
    await assertExact500Behavior(err);
    assert.strictEqual(harness.mocks.bookingFind.mock.callCount(), 0);
  });

  it("handles Booking query rejection", async () => {
    const error = new Error("DB Error");
    harness.mocks.bookingFind.mock.mockImplementation(() => { throw error; });

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    await assertExact500Behavior(error);
    assert.strictEqual(harness.mocks.transactionFind.mock.callCount(), 0);
  });

  it("handles Transaction query rejection", async () => {
    const error = new Error("DB Error 2");
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([]) })
    }));
    harness.mocks.transactionFind.mock.mockImplementation(() => { throw error; });

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    await assertExact500Behavior(error);
    assert.strictEqual(harness.mocks.reviewFind.mock.callCount(), 0);
  });

  it("handles Review query rejection", async () => {
    const error = new Error("DB Error 3");
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([]) })
    }));
    harness.mocks.transactionFind.mock.mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve([]) })
    }));
    harness.mocks.reviewFind.mock.mockImplementation(() => { throw error; });

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    await assertExact500Behavior(error);
    assert.strictEqual(harness.mocks.refundFind.mock.callCount(), 0);
  });

  it("handles Refund query rejection", async () => {
    const error = new Error("DB Error 4");
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([]) })
    }));
    harness.mocks.transactionFind.mock.mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve([]) })
    }));
    harness.mocks.reviewFind.mock.mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve([]) })
    }));
    harness.mocks.refundFind.mock.mockImplementation(() => { throw error; });

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    await assertExact500Behavior(error);
  });

  it("handles getPresignedUrl rejection", async () => {
    const bookingDoc = {
      _id: new Types.ObjectId(),
      tripId: {
        busId: { fleetImages: ["img1"] }
      }
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));
    harness.mocks.transactionFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));
    harness.mocks.reviewFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));
    harness.mocks.refundFind.mock.mockImplementation(() => ({ select: () => ({ lean: () => Promise.resolve([]) }) }));

    const error = new Error("S3 Error");
    harness.mocks.getPresignedUrl.mock.mockImplementation(async () => { throw error; });

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    await assertExact500Behavior(error);
  });

});
