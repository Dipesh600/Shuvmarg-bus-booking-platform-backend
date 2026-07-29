const test = require("node:test");
const assert = require("node:assert");

const tripSeatAvailability = require("../../src/modules/booking/trip-seat-availability");
const Seat = require("../../models/seatsModel");
const Trip = require("../../models/tripModel");
const SeatHold = require("../../models/seatHoldModel");

test("Trip seat availability responses characterization", async (t) => {
  const originalSeatFindOne = Seat.findOne;
  const originalTripFindById = Trip.findById;
  const originalSeatHoldFind = SeatHold.find;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  let loggedError = false;
  console.error = () => { loggedError = true; };
  console.log = () => { loggedError = true; };

  let seatCalled = false;
  let tripCalled = false;
  let seatHoldCalled = false;

  t.afterEach(() => {
    Seat.findOne = originalSeatFindOne;
    Trip.findById = originalTripFindById;
    SeatHold.find = originalSeatHoldFind;
    seatCalled = false;
    tripCalled = false;
    seatHoldCalled = false;
    loggedError = false;
  });

  t.after(() => {
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  });

  const runHandler = async (req) => {
    let responseStatus, responseBody;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (body) => {
            responseBody = body;
          }
        };
      },
      json: (body) => {
        responseBody = body;
      }
    };
    await tripSeatAvailability.getTripSeatAvailability(req, res);
    return { status: responseStatus, body: responseBody };
  };

  await t.test("missing tripId returns exact 400 body", async () => {
    const req = { body: {} };
    const res = await runHandler(req);
    assert.strictEqual(res.status, 400);
    assert.deepStrictEqual(res.body, {
      status: false,
      message: "Please Provide Trip Id!"
    });
  });

  await t.test("no seats returns exact 404 body, prevents Trip/SeatHold query", async () => {
    Seat.findOne = () => {
      seatCalled = true;
      return { lean: () => Promise.resolve(null) };
    };
    Trip.findById = () => { tripCalled = true; };
    SeatHold.find = () => { seatHoldCalled = true; };

    const req = { body: { tripId: "someId" } };
    const res = await runHandler(req);
    
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(res.body, {
      status: false,
      message: "Seats Not Found!"
    });
    assert.ok(seatCalled);
    assert.ok(!tripCalled);
    assert.ok(!seatHoldCalled);
  });

  await t.test("success returns exact 200 body", async () => {
    const mockSeat = { _id: "seatId", seata: [] };
    const mockTrip = { _id: "tripId", seatTemplateId: { seatConfig: { rows: 5 } } };
    Seat.findOne = () => ({ lean: () => Promise.resolve(mockSeat) });
    Trip.findById = () => ({ populate: () => Promise.resolve(mockTrip) });
    SeatHold.find = () => Promise.resolve([]);

    const req = { body: { tripId: "someId" } };
    const res = await runHandler(req);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      status: true,
      message: "Successfully fetched seats!",
      data: {
        seata: [],
        seatb: [],
        seatc: [],
        seatConfig: { rows: 5 }
      }
    });
  });

  await t.test("missing Trip still succeeds with seatConfig: null", async () => {
    const mockSeat = { _id: "seatId", seata: [] };
    Seat.findOne = () => ({ lean: () => Promise.resolve(mockSeat) });
    Trip.findById = () => ({ populate: () => Promise.resolve(null) });
    SeatHold.find = () => Promise.resolve([]);

    const req = { body: { tripId: "someId" } };
    const res = await runHandler(req);

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, {
      status: true,
      message: "Successfully fetched seats!",
      data: {
        seata: [],
        seatb: [],
        seatc: [],
        seatConfig: null
      }
    });
  });

});
