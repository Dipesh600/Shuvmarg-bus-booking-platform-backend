const test = require("node:test");
const assert = require("node:assert");

const ticketController = require("../../controllers/ticketController/ticketController");
const Seat = require("../../models/seatsModel");
const Trip = require("../../models/tripModel");
const SeatHold = require("../../models/seatHoldModel");

test("Trip seat availability errors characterization", async (t) => {
  const originalSeatFindOne = Seat.findOne;
  const originalTripFindById = Trip.findById;
  const originalSeatHoldFind = SeatHold.find;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;

  let loggedError = false;
  console.error = () => { loggedError = true; };
  console.log = () => { loggedError = true; };

  t.afterEach(() => {
    Seat.findOne = originalSeatFindOne;
    Trip.findById = originalTripFindById;
    SeatHold.find = originalSeatHoldFind;
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
    await ticketController.getSeatsById(req, res);
    return { status: responseStatus, body: responseBody };
  };

  const assertGenericError = (res) => {
    assert.strictEqual(res.status, 500);
    assert.deepStrictEqual(res.body, {
      status: true,
      message: "Internal Server Error!"
    });
    assert.ok(!loggedError, "No errors should be logged by the handler");
  };

  await t.test("thrown Seat query error returns exact 500 body", async () => {
    Seat.findOne = () => { throw new Error("Seat error"); };
    const req = { body: { tripId: "someId" } };
    assertGenericError(await runHandler(req));
  });

  await t.test("thrown Trip query error returns exact 500 body", async () => {
    Seat.findOne = () => ({ lean: () => Promise.resolve({ _id: "seatId" }) });
    Trip.findById = () => { throw new Error("Trip error"); };
    const req = { body: { tripId: "someId" } };
    assertGenericError(await runHandler(req));
  });

  await t.test("thrown SeatHold query error returns exact 500 body", async () => {
    Seat.findOne = () => ({ lean: () => Promise.resolve({ _id: "seatId" }) });
    Trip.findById = () => ({ populate: () => Promise.resolve(null) });
    SeatHold.find = () => { throw new Error("SeatHold error"); };
    
    const req = { body: { tripId: "someId" } };
    assertGenericError(await runHandler(req));
  });

  await t.test("undefined req.body returns exact 500 body", async () => {
    const req = {}; // no body
    assertGenericError(await runHandler(req));
  });

  await t.test("null activeHolds throws and returns exact 500 body", async () => {
    Seat.findOne = () => ({ lean: () => Promise.resolve({ _id: "seatId", seata: [] }) });
    Trip.findById = () => ({ populate: () => Promise.resolve(null) });
    SeatHold.find = () => Promise.resolve(null); // This will cause TypeError in mapper
    
    const req = { body: { tripId: "someId" } };
    assertGenericError(await runHandler(req));
  });

  await t.test("hold without seatNumbers throws and returns exact 500 body", async () => {
    Seat.findOne = () => ({ lean: () => Promise.resolve({ _id: "seatId", seata: [] }) });
    Trip.findById = () => ({ populate: () => Promise.resolve(null) });
    SeatHold.find = () => Promise.resolve([{}]); // missing seatNumbers
    
    const req = { body: { tripId: "someId" } };
    assertGenericError(await runHandler(req));
  });

  await t.test("non-array hold.seatNumbers throws and returns exact 500 body", async () => {
    Seat.findOne = () => ({ lean: () => Promise.resolve({ _id: "seatId", seata: [] }) });
    Trip.findById = () => ({ populate: () => Promise.resolve(null) });
    SeatHold.find = () => Promise.resolve([{ seatNumbers: "a1" }]); 
    
    const req = { body: { tripId: "someId" } };
    assertGenericError(await runHandler(req));
  });

  await t.test("truthy non-array seat group throws and returns exact 500 body", async () => {
    Seat.findOne = () => ({ lean: () => Promise.resolve({ _id: "seatId", seata: "not-an-array" }) });
    Trip.findById = () => ({ populate: () => Promise.resolve(null) });
    SeatHold.find = () => Promise.resolve([{ seatNumbers: ["a1"] }]); 
    
    const req = { body: { tripId: "someId" } };
    assertGenericError(await runHandler(req));
  });

  await t.test("inspected seat without seatNo throws and returns exact 500 body", async () => {
    Seat.findOne = () => ({ lean: () => Promise.resolve({ _id: "seatId", seata: [{ booked: false }] }) });
    Trip.findById = () => ({ populate: () => Promise.resolve(null) });
    SeatHold.find = () => Promise.resolve([{ seatNumbers: ["a1"] }]); 
    
    const req = { body: { tripId: "someId" } };
    assertGenericError(await runHandler(req));
  });

});
