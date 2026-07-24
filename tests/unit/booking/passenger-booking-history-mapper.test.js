const { describe, it } = require("node:test");
const assert = require("node:assert");

const passengerBookingHistoryMapper = require("../../../src/modules/booking/passenger-booking-history/passenger-booking-history.mapper");

describe("passenger-booking-history mapper", () => {
  it("maps booking without trip correctly", () => {
    const booking = {
      _id: "b1",
      seats: ["A1", "A2"],
      totalAmount: 1500,
      status: "CONFIRMED",
      ticketId: "TKT-123",
    };
    
    const transaction = null;
    const refund = null;
    const reviewedSet = new Set(["b1"]);
    const presignedImages = [];

    const result = passengerBookingHistoryMapper.mapToPassengerHistory(booking, transaction, refund, reviewedSet, presignedImages);

    assert.deepStrictEqual(result, {
      booking: {
        seats: ["A1", "A2"],
        totalAmount: 1500,
        status: "CONFIRMED",
        refundStatus: "",
        refundAmount: 0,
        ticketId: "TKT-123",
        bookingId: "b1",
        review: true,
      },
      trip: null,
      payment: null,
      refund: null,
    });
  });

  it("maps booking with full details correctly", () => {
    const booking = {
      _id: "b1",
      seats: ["A1"],
      totalAmount: 1000,
      status: "CANCELLED",
      refundStatus: "PENDING",
      refundAmount: 900,
      ticketId: "TKT-456",
      bookedFrom: "My Start",
      bookedTo: "My End",
      bookedDepartureTime: "10:00 AM",
      bookedArrivalTime: "02:00 PM",
      tripId: {
        departureTime: "08:00 AM",
        arrivalTime: "12:00 PM",
        busId: {
          busName: "Express",
          fleetImages: ["img1", "img2"],
          amenitiesId: { amenities: ["WIFI"] },
          boardingPointId: { city: "KTM" },
        },
        routeId: {
          routeName: "KTM - PKR",
          from: "Kathmandu",
          to: "Pokhara",
        },
      }
    };
    
    const transaction = {
      gateway: "esewa",
      transactionId: "TXN-1",
      status: "SUCCESS",
      totalAmount: 1000,
      paidAt: "2024-01-01T10:00:00Z"
    };

    const refund = {
      refundAmount: 900,
      cancellationCharge: 100,
      originalAmount: 1000,
      status: "PENDING",
      requestedAt: "2024-01-02T10:00:00Z",
      processedAt: null,
      completedAt: null,
      reason: "User Request",
      remarks: "Test refund",
      refundGateway: "esewa",
    };

    const reviewedSet = new Set();
    const presignedImages = ["url1", "url2"];

    const result = passengerBookingHistoryMapper.mapToPassengerHistory(booking, transaction, refund, reviewedSet, presignedImages);

    assert.strictEqual(result.booking.review, false);
    assert.strictEqual(result.booking.refundStatus, "PENDING");
    assert.strictEqual(result.booking.refundAmount, 900);
    
    assert.deepStrictEqual(result.payment, transaction);
    assert.deepStrictEqual(result.refund, refund);
    
    assert.deepStrictEqual(result.trip.busId.fleetImages, ["url1", "url2"]);
    assert.deepStrictEqual(result.trip.busId.amenitiesDetail, { amenities: ["WIFI"] });
    assert.strictEqual(result.trip.busId.amenitiesId, undefined);
    assert.deepStrictEqual(result.trip.busId.boardingPointDetail, { city: "KTM" });
    assert.strictEqual(result.trip.busId.boardingPointId, undefined);

    assert.strictEqual(result.trip.departureTime, "10:00 AM");
    assert.strictEqual(result.trip.arrivalTime, "02:00 PM");
    
    assert.deepStrictEqual(result.trip.routeDetail, {
      routeName: "KTM - PKR",
      from: "My Start",
      to: "My End",
    });
    assert.strictEqual(result.trip.routeId, undefined);
  });

});
