const test = require("node:test");
const assert = require("node:assert");
const repository = require("../../../src/modules/booking/trip-seat-availability/trip-seat-availability.repository");
const Seat = require("../../../models/seatsModel");
const Trip = require("../../../models/tripModel");
const SeatHold = require("../../../models/seatHoldModel");

test("Trip seat availability repository", async (t) => {
  const originalSeatFindOne = Seat.findOne;
  const originalTripFindById = Trip.findById;
  const originalSeatHoldFind = SeatHold.find;

  t.afterEach(() => {
    Seat.findOne = originalSeatFindOne;
    Trip.findById = originalTripFindById;
    SeatHold.find = originalSeatHoldFind;
  });

  await t.test("findSeatByTripId", async () => {
    let query, leanCalled = 0;
    Seat.findOne = (q) => {
      query = q;
      return {
        lean: () => {
          leanCalled++;
          return Promise.resolve("seat result");
        }
      };
    };

    const result = await repository.findSeatByTripId("trip123");
    assert.deepStrictEqual(query, { tripId: "trip123" });
    assert.strictEqual(leanCalled, 1);
    assert.strictEqual(result, "seat result");
  });

  await t.test("findTripWithSeatConfig", async () => {
    let id, populateStr;
    Trip.findById = (i) => {
      id = i;
      return {
        populate: (str) => {
          populateStr = str;
          return Promise.resolve("trip result");
        }
      };
    };

    const result = await repository.findTripWithSeatConfig("trip123");
    assert.strictEqual(id, "trip123");
    assert.strictEqual(populateStr, "seatTemplateId busId");
    assert.strictEqual(result, "trip result");
  });

  await t.test("findActiveSeatHolds - with current user", async () => {
    let query;
    SeatHold.find = (q) => {
      query = q;
      return Promise.resolve("holds result");
    };

    const result = await repository.findActiveSeatHolds("trip123", "user123");
    assert.strictEqual(query.tripId, "trip123");
    assert.ok(query.expiresAt.$gt instanceof Date);
    assert.deepStrictEqual(query.userId, { $ne: "user123" });
    assert.strictEqual(result, "holds result");
  });

  await t.test("findActiveSeatHolds - without current user", async () => {
    let query;
    SeatHold.find = (q) => {
      query = q;
      return Promise.resolve("holds result");
    };

    const result = await repository.findActiveSeatHolds("trip123", null);
    assert.strictEqual(query.tripId, "trip123");
    assert.ok(query.expiresAt.$gt instanceof Date);
    assert.strictEqual(query.userId, undefined);
    assert.strictEqual(result, "holds result");
  });
});
