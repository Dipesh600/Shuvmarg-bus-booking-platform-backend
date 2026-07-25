const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert");
const { setupHarness } = require("../helpers/passenger-booking-history-harness");
const { Types } = require("mongoose");

describe("passenger-booking-history trip/image characterization", () => {
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



  it("handles populated routeId properly", async () => {
    const bookingDoc = {
      _id: new Types.ObjectId(),
      bookedFrom: "Chitwan",
      bookedTo: "Pokhara",
      bookedDepartureTime: "10:00",
      bookedArrivalTime: "15:00",
      tripId: {
        departureTime: "08:00",
        arrivalTime: "20:00",
        routeId: {
          routeName: "Kathmandu → Pokhara",
          from: "Kathmandu",
          to: "Pokhara",
        },
      }
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const trip = jsonArg.data[0].trip;
    
    assert.ok(trip.hasOwnProperty('routeId'));
    assert.strictEqual(trip.routeId, undefined);
    
    assert.deepStrictEqual(trip.routeDetail, {
      routeName: "Kathmandu → Pokhara",
      from: "Chitwan",
      to: "Pokhara",
    });

    assert.strictEqual(trip.departureTime, "10:00");
    assert.strictEqual(trip.arrivalTime, "15:00");
  });

  it("handles fallback route details correctly", async () => {
    const bookingDoc = {
      _id: new Types.ObjectId(),
      tripId: {
        variantId: "v123",
        directionLabel: "KTM -> PKR",
        fromStopName: "KTM",
        toStopName: "PKR",
        departureTime: "08:00",
        arrivalTime: "20:00",
        routeId: null,
      }
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const trip = jsonArg.data[0].trip;
    
    assert.deepStrictEqual(trip.routeDetail, {
      _id: "v123",
      routeName: "KTM -> PKR",
      from: "KTM",
      to: "PKR",
    });

    assert.strictEqual(trip.departureTime, "08:00");
    assert.strictEqual(trip.arrivalTime, "20:00");
  });

  it("uses arrow fallback correctly when directionLabel is missing", async () => {
    const bookingDoc = {
      _id: new Types.ObjectId(),
      tripId: {
        variantId: null,
        fromStopName: "City A",
        toStopName: "City B",
        routeId: null,
      }
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const trip = jsonArg.data[0].trip;
    
    assert.strictEqual(trip.routeDetail.routeName, "City A → City B");
    assert.strictEqual(trip.routeDetail._id, null);
  });
  
  it("uses N/A fallback correctly", async () => {
    const bookingDoc = {
      _id: new Types.ObjectId(),
      tripId: {
        routeId: null,
      }
    };
    
    harness.mocks.bookingFind.mock.mockImplementation(() => ({
      populate: () => ({ lean: () => Promise.resolve([bookingDoc]) })
    }));

    await harness.passengerBookingHistory.getPassengerBookingHistory(req, res);

    const jsonArg = res.json.mock.calls[0].arguments[0];
    const trip = jsonArg.data[0].trip;
    
    assert.strictEqual(trip.routeDetail.routeName, "? → ?");
    assert.strictEqual(trip.routeDetail.from, "N/A");
    assert.strictEqual(trip.routeDetail.to, "N/A");
  });
});
