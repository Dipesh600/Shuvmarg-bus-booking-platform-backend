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

  it("executes queries in exact order and structure", async () => {
    const callOrder = [];
    const bookingQueryMock = mock.fn(() => {
      callOrder.push('bookingFind');
      return { populate: mock.fn(() => ({ lean: mock.fn(() => Promise.resolve([{ _id: "b1", tripId: "t1" }, { _id: "b2", tripId: "t2" }])) })) };
    });
    const transactionQueryMock = mock.fn(() => {
      callOrder.push('transactionFind');
      return { select: mock.fn(() => ({ lean: mock.fn(() => Promise.resolve([])) })) };
    });
    const reviewQueryMock = mock.fn(() => {
      callOrder.push('reviewFind');
      return { select: mock.fn(() => ({ lean: mock.fn(() => Promise.resolve([])) })) };
    });
    const refundQueryMock = mock.fn(() => {
      callOrder.push('refundFind');
      return { select: mock.fn(() => ({ lean: mock.fn(() => Promise.resolve([])) })) };
    });

    harness.mocks.bookingFind.mock.mockImplementation(bookingQueryMock);
    harness.mocks.transactionFind.mock.mockImplementation(transactionQueryMock);
    harness.mocks.reviewFind.mock.mockImplementation(reviewQueryMock);
    harness.mocks.refundFind.mock.mockImplementation(refundQueryMock);

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    assert.strictEqual(harness.mocks.bookingFind.mock.callCount(), 1);
    const [bookingArgs] = harness.mocks.bookingFind.mock.calls[0].arguments;
    assert.deepStrictEqual(bookingArgs, { userId: req.userInfo.id });

    // Validate chain
    const populateCall = bookingQueryMock.mock.calls[0].result.populate;
    assert.strictEqual(populateCall.mock.callCount(), 1);
    const [populateArg] = populateCall.mock.calls[0].arguments;
    assert.deepStrictEqual(populateArg, {
      path: "tripId",
      populate: [
        {
          path: "busId",
          select: "busName busNumber busType vehicleType totalSeats seatLayout amenitiesId boardingPointId fleetImages",
          populate: [
            { path: "amenitiesId", select: "amenities" },
            { path: "boardingPointId", select: "city boardingPoints description" },
          ],
        },
        {
          path: "routeId",
          select: "routeName from to distance duration basePrice",
        },
      ],
    });

    const bookingLean = populateCall.mock.calls[0].result.lean;
    assert.strictEqual(bookingLean.mock.callCount(), 1);

    assert.strictEqual(harness.mocks.transactionFind.mock.callCount(), 1);
    const [transactionArgs] = harness.mocks.transactionFind.mock.calls[0].arguments;
    assert.deepStrictEqual(transactionArgs, { bookingId: { $in: ["b1", "b2"] } });

    const transactionSelect = transactionQueryMock.mock.calls[0].result.select;
    const [transactionSelectArg] = transactionSelect.mock.calls[0].arguments;
    assert.deepStrictEqual(transactionSelectArg, {
      bookingId: 1,
      gateway: 1,
      transactionId: 1,
      status: 1,
      totalAmount: 1,
      paidAt: 1,
    });
    const transactionLean = transactionSelect.mock.calls[0].result.lean;
    assert.strictEqual(transactionLean.mock.callCount(), 1);

    assert.strictEqual(harness.mocks.reviewFind.mock.callCount(), 1);
    const [reviewArgs] = harness.mocks.reviewFind.mock.calls[0].arguments;
    assert.deepStrictEqual(reviewArgs, { userId: req.userInfo.id, bookingId: { $in: ["b1", "b2"] } });

    const reviewSelect = reviewQueryMock.mock.calls[0].result.select;
    const [reviewSelectArg] = reviewSelect.mock.calls[0].arguments;
    assert.deepStrictEqual(reviewSelectArg, { bookingId: 1 });
    const reviewLean = reviewSelect.mock.calls[0].result.lean;
    assert.strictEqual(reviewLean.mock.callCount(), 1);

    assert.strictEqual(harness.mocks.refundFind.mock.callCount(), 1);
    const [refundArgs] = harness.mocks.refundFind.mock.calls[0].arguments;
    assert.deepStrictEqual(refundArgs, { bookingId: { $in: ["b1", "b2"] } });

    const refundSelect = refundQueryMock.mock.calls[0].result.select;
    const [refundSelectArg] = refundSelect.mock.calls[0].arguments;
    assert.deepStrictEqual(refundSelectArg, {
      bookingId: 1,
      originalAmount: 1,
      cancellationCharge: 1,
      refundAmount: 1,
      status: 1,
      requestedAt: 1,
      processedAt: 1,
      completedAt: 1,
      reason: 1,
      remarks: 1,
      refundGateway: 1,
    });
    const refundLean = refundSelect.mock.calls[0].result.lean;
    assert.strictEqual(refundLean.mock.callCount(), 1);

    // Call order
    assert.deepStrictEqual(callOrder, ['bookingFind', 'transactionFind', 'reviewFind', 'refundFind']);
  });

});
