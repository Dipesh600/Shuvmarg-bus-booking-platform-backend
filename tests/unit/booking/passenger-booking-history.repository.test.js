const { describe, it, beforeEach, mock, afterEach } = require("node:test");
const assert = require("node:assert");

const passengerBookingHistoryRepository = require("../../../src/modules/booking/passenger-booking-history/passenger-booking-history.repository");
const Booking = require("../../../models/bookTicketModel");
const Transaction = require("../../../models/transactionModel");
const Review = require("../../../models/reviewModel");
const Refund = require("../../../models/refundModel");

describe("passenger-booking-history repository", () => {
  let bookingFindMock;
  let transactionFindMock;
  let reviewFindMock;
  let refundFindMock;

  beforeEach(() => {
    bookingFindMock = mock.method(Booking, "find", mock.fn(() => ({
      populate: mock.fn(() => ({
        lean: mock.fn(() => Promise.resolve([{ _id: "b1" }]))
      }))
    })));

    transactionFindMock = mock.method(Transaction, "find", mock.fn(() => ({
      select: mock.fn(() => ({
        lean: mock.fn(() => Promise.resolve([{ _id: "t1" }]))
      }))
    })));

    reviewFindMock = mock.method(Review, "find", mock.fn(() => ({
      select: mock.fn(() => ({
        lean: mock.fn(() => Promise.resolve([{ _id: "rv1" }]))
      }))
    })));

    refundFindMock = mock.method(Refund, "find", mock.fn(() => ({
      select: mock.fn(() => ({
        lean: mock.fn(() => Promise.resolve([{ _id: "rf1" }]))
      }))
    })));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("findBookings queries Booking model correctly", async () => {
    const result = await passengerBookingHistoryRepository.findBookings("user123");
    
    assert.strictEqual(bookingFindMock.mock.callCount(), 1);
    assert.deepStrictEqual(bookingFindMock.mock.calls[0].arguments[0], { userId: "user123" });
    
    const populateCall = bookingFindMock.mock.calls[0].result.populate;
    assert.strictEqual(populateCall.mock.callCount(), 1);
    assert.deepStrictEqual(populateCall.mock.calls[0].arguments[0], {
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
    
    assert.deepStrictEqual(result, [{ _id: "b1" }]);
  });

  it("findTransactions queries Transaction model correctly", async () => {
    const result = await passengerBookingHistoryRepository.findTransactions(["b1", "b2"]);
    
    assert.strictEqual(transactionFindMock.mock.callCount(), 1);
    assert.deepStrictEqual(transactionFindMock.mock.calls[0].arguments[0], { bookingId: { $in: ["b1", "b2"] } });
    
    const selectCall = transactionFindMock.mock.calls[0].result.select;
    assert.strictEqual(selectCall.mock.callCount(), 1);
    assert.deepStrictEqual(selectCall.mock.calls[0].arguments[0], {
      bookingId: 1,
      gateway: 1,
      transactionId: 1,
      status: 1,
      totalAmount: 1,
      paidAt: 1,
    });
    
    assert.deepStrictEqual(result, [{ _id: "t1" }]);
  });

  it("findReviews queries Review model correctly", async () => {
    const result = await passengerBookingHistoryRepository.findReviews("user123", ["b1", "b2"]);
    
    assert.strictEqual(reviewFindMock.mock.callCount(), 1);
    assert.deepStrictEqual(reviewFindMock.mock.calls[0].arguments[0], { 
      userId: "user123", 
      bookingId: { $in: ["b1", "b2"] } 
    });
    
    const selectCall = reviewFindMock.mock.calls[0].result.select;
    assert.strictEqual(selectCall.mock.callCount(), 1);
    assert.deepStrictEqual(selectCall.mock.calls[0].arguments[0], { bookingId: 1 });
    
    assert.deepStrictEqual(result, [{ _id: "rv1" }]);
  });

  it("findRefunds queries Refund model correctly", async () => {
    const result = await passengerBookingHistoryRepository.findRefunds(["b1", "b2"]);
    
    assert.strictEqual(refundFindMock.mock.callCount(), 1);
    assert.deepStrictEqual(refundFindMock.mock.calls[0].arguments[0], { bookingId: { $in: ["b1", "b2"] } });
    
    const selectCall = refundFindMock.mock.calls[0].result.select;
    assert.strictEqual(selectCall.mock.callCount(), 1);
    assert.deepStrictEqual(selectCall.mock.calls[0].arguments[0], {
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
    
    assert.deepStrictEqual(result, [{ _id: "rf1" }]);
  });
});
