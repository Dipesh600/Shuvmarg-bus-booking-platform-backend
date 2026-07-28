const { describe, it } = require("node:test");
const assert = require("node:assert");

const passengerBookingHistoryMapper = require("../../../src/modules/booking/passenger-booking-history/passenger-booking-history.mapper");

describe("passenger-booking-history mapper route fallback", () => {
  it("handles fallback baseRouteDetail when routeId is missing", () => {
    const booking = {
      _id: "b1",
      seats: ["A1"],
      totalAmount: 1000,
      status: "CONFIRMED",
      ticketId: "TKT-456",
      tripId: {
        variantId: "var1",
        directionLabel: "Direction A",
        fromStopName: "Stop 1",
        toStopName: "Stop 2",
        departureTime: "08:00 AM",
        arrivalTime: "12:00 PM",
      }
    };
    
    const transaction = null;
    const refund = null;
    const reviewedSet = new Set();
    const presignedImages = [];

    const result = passengerBookingHistoryMapper.mapToPassengerHistory(booking, transaction, refund, reviewedSet, presignedImages);

    assert.deepStrictEqual(result.trip.routeDetail, {
      _id: "var1",
      routeName: "Direction A",
      from: "Stop 1",
      to: "Stop 2",
    });
  });

  it("handles fallback baseRouteDetail with missing directionLabel", () => {
    const booking = {
      _id: "b1",
      seats: ["A1"],
      totalAmount: 1000,
      status: "CONFIRMED",
      ticketId: "TKT-456",
      tripId: {
        variantId: "var1",
        fromStopName: "Stop 1",
        toStopName: "Stop 2",
        departureTime: "08:00 AM",
        arrivalTime: "12:00 PM",
      }
    };
    
    const result = passengerBookingHistoryMapper.mapToPassengerHistory(booking, null, null, new Set(), []);

    assert.deepStrictEqual(result.trip.routeDetail, {
      _id: "var1",
      routeName: "Stop 1 → Stop 2",
      from: "Stop 1",
      to: "Stop 2",
    });
  });
});
