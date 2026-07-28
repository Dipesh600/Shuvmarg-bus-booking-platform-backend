const test = require("node:test");
const assert = require("node:assert");

const tripSeatAvailability = require("../../src/modules/booking/trip-seat-availability");
const Seat = require("../../models/seatsModel");
const Trip = require("../../models/tripModel");
const SeatHold = require("../../models/seatHoldModel");

test("Trip seat availability holds characterization", async (t) => {
  const originalSeatFindOne = Seat.findOne;
  const originalTripFindById = Trip.findById;
  const originalSeatHoldFind = SeatHold.find;

  let seatQuery, tripQuery, tripPopulate, seatHoldQuery;

  t.afterEach(() => {
    Seat.findOne = originalSeatFindOne;
    Trip.findById = originalTripFindById;
    SeatHold.find = originalSeatHoldFind;
    seatQuery = null;
    tripQuery = null;
    tripPopulate = null;
    seatHoldQuery = null;
  });

  const runHandler = async (req, mockSeat, mockTrip, mockHolds) => {
    let responseBody;
    const res = {
      status: () => ({ json: (body) => { responseBody = body; } }),
      json: (body) => { responseBody = body; }
    };

    Seat.findOne = (query) => {
      seatQuery = query;
      return {
        lean: () => Promise.resolve(mockSeat)
      };
    };

    Trip.findById = (id) => {
      tripQuery = id;
      return {
        populate: (str) => {
          tripPopulate = str;
          return Promise.resolve(mockTrip);
        }
      };
    };

    SeatHold.find = (query) => {
      seatHoldQuery = query;
      return Promise.resolve(mockHolds);
    };

    await tripSeatAvailability.getTripSeatAvailability(req, res);
    return responseBody;
  };

  await t.test("Seat query is exactly { tripId } plus .lean(), Trip uses findById and populate", async () => {
    const req = { body: { tripId: "testTripId" } };
    await runHandler(req, { _id: "seatId" }, null, []);

    assert.deepStrictEqual(seatQuery, { tripId: "testTripId" });
    assert.strictEqual(tripQuery, "testTripId");
    assert.strictEqual(tripPopulate, "seatTemplateId busId");
  });

  await t.test("authenticated user produces the exact $ne hold query", async () => {
    const req = { body: { tripId: "testTripId" }, userInfo: { id: "userId123" } };
    await runHandler(req, { _id: "seatId" }, null, []);
    
    assert.strictEqual(seatHoldQuery.tripId, "testTripId");
    assert.ok(seatHoldQuery.expiresAt.$gt instanceof Date);
    assert.deepStrictEqual(seatHoldQuery.userId, { $ne: "userId123" });
  });

  await t.test("missing userInfo produces no userId condition", async () => {
    const req = { body: { tripId: "testTripId" } };
    await runHandler(req, { _id: "seatId" }, null, []);
    
    assert.strictEqual(seatHoldQuery.tripId, "testTripId");
    assert.ok(seatHoldQuery.expiresAt.$gt instanceof Date);
    assert.strictEqual(seatHoldQuery.userId, undefined);
  });

  await t.test("unbooked held seats in seata/seatb/seatc are masked case-insensitively", async () => {
    const req = { body: { tripId: "someId" } };
    const mockSeat = {
      _id: "seatId",
      seata: [{ seatNo: "a1", booked: false }, { seatNo: "A2", booked: false }],
      seatb: [{ seatNo: "B1", booked: false }],
      seatc: [{ seatNo: "C1", booked: false }]
    };
    const mockHolds = [
      { seatNumbers: ["A1", "a2"] },
      { seatNumbers: ["b1"] },
      { seatNumbers: ["c1"] }
    ];
    
    const res = await runHandler(req, mockSeat, null, mockHolds);
    
    assert.strictEqual(res.data.seata[0].booked, true);
    assert.strictEqual(res.data.seata[0].blockedFor, "reserved");
    assert.strictEqual(res.data.seata[1].booked, true);
    assert.strictEqual(res.data.seata[1].blockedFor, "reserved");
    assert.strictEqual(res.data.seatb[0].booked, true);
    assert.strictEqual(res.data.seatb[0].blockedFor, "reserved");
    assert.strictEqual(res.data.seatc[0].booked, true);
    assert.strictEqual(res.data.seatc[0].blockedFor, "reserved");
  });

  await t.test("already-booked held seats do not receive blockedFor", async () => {
    const req = { body: { tripId: "someId" } };
    const mockSeat = {
      _id: "seatId",
      seata: [{ seatNo: "A1", booked: true }]
    };
    const mockHolds = [{ seatNumbers: ["A1"] }];
    
    const res = await runHandler(req, mockSeat, null, mockHolds);
    
    assert.strictEqual(res.data.seata[0].booked, true);
    assert.strictEqual(res.data.seata[0].blockedFor, undefined);
  });

  await t.test("no active holds leave seat arrays unchanged", async () => {
    const req = { body: { tripId: "someId" } };
    const mockSeat = {
      _id: "seatId",
      seata: [{ seatNo: "A1", booked: false }]
    };
    
    const res = await runHandler(req, mockSeat, null, []);
    
    assert.strictEqual(res.data.seata[0].booked, false);
    assert.strictEqual(res.data.seata[0].blockedFor, undefined);
  });

});
