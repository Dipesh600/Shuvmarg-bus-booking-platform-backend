const test = require("node:test");
const assert = require("node:assert");

const ticketController = require("../../controllers/ticketController/ticketController");
const Seat = require("../../models/seatsModel");
const Trip = require("../../models/tripModel");
const SeatHold = require("../../models/seatHoldModel");

test("Trip seat availability config characterization", async (t) => {
  const originalSeatFindOne = Seat.findOne;
  const originalTripFindById = Trip.findById;
  const originalSeatHoldFind = SeatHold.find;

  t.afterEach(() => {
    Seat.findOne = originalSeatFindOne;
    Trip.findById = originalTripFindById;
    SeatHold.find = originalSeatHoldFind;
  });

  const runHandler = async (req, mockSeat, mockTrip, mockHolds) => {
    let responseBody;
    const res = {
      status: () => ({ json: (body) => { responseBody = body; } }),
      json: (body) => { responseBody = body; }
    };

    Seat.findOne = () => ({ lean: () => Promise.resolve(mockSeat) });
    Trip.findById = () => ({ populate: () => Promise.resolve(mockTrip) });
    SeatHold.find = () => Promise.resolve(mockHolds);

    await ticketController.getSeatsById(req, res);
    return responseBody;
  };

  await t.test("template seatConfig wins over bus seatConfig", async () => {
    const req = { body: { tripId: "someId" } };
    const mockTrip = {
      seatTemplateId: { seatConfig: { type: "template" } },
      busId: { seatConfig: { type: "bus" } }
    };
    const res = await runHandler(req, { _id: "seatId" }, mockTrip, []);
    assert.deepStrictEqual(res.data.seatConfig, { type: "template" });
  });

  await t.test("bus seatConfig is used when template config is absent/falsy", async () => {
    const req = { body: { tripId: "someId" } };
    const mockTrip = {
      seatTemplateId: { seatConfig: null },
      busId: { seatConfig: { type: "bus" } }
    };
    const res = await runHandler(req, { _id: "seatId" }, mockTrip, []);
    assert.deepStrictEqual(res.data.seatConfig, { type: "bus" });
  });

  await t.test("seatConfig is null when neither exists", async () => {
    const req = { body: { tripId: "someId" } };
    const mockTrip = {
      seatTemplateId: null,
      busId: { seatConfig: null }
    };
    const res = await runHandler(req, { _id: "seatId" }, mockTrip, []);
    assert.strictEqual(res.data.seatConfig, null);
  });

  await t.test("response seatConfig overwrites an existing seat-document field", async () => {
    const req = { body: { tripId: "someId" } };
    const mockSeat = {
      _id: "seatId",
      seatConfig: { type: "old" }
    };
    const mockTrip = {
      seatTemplateId: { seatConfig: { type: "new" } }
    };
    
    const res = await runHandler(req, mockSeat, mockTrip, []);
    assert.deepStrictEqual(res.data.seatConfig, { type: "new" });
  });

});
