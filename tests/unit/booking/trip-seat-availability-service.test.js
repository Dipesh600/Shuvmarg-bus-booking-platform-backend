const test = require("node:test");
const assert = require("node:assert");
const { createTripSeatAvailabilityService } = require("../../../src/modules/booking/trip-seat-availability/trip-seat-availability.service");
const mapper = require("../../../src/modules/booking/trip-seat-availability/trip-seat-availability.mapper");

test("Trip seat availability service", async (t) => {
  await t.test("repository call order is Seat -> Trip -> SeatHold, missing seat returns null and stops", async () => {
    const callOrder = [];
    const repository = {
      findSeatByTripId: async () => { callOrder.push("Seat"); return null; },
      findTripWithSeatConfig: async () => { callOrder.push("Trip"); return {}; },
      findActiveSeatHolds: async () => { callOrder.push("SeatHold"); return []; }
    };
    
    const service = createTripSeatAvailabilityService({ repository, mapper });
    const result = await service("trip123", "user123");
    
    assert.strictEqual(result, null);
    assert.deepStrictEqual(callOrder, ["Seat"]);
  });

  await t.test("success path: missing Trip continues with null seatConfig, holds passed to mapper, mapper result returned", async () => {
    const callOrder = [];
    const mockSeat = { _id: "seatId", seata: [] };
    const mockHolds = [{ id: "hold1", seatNumbers: ["A1"] }];
    
    const repository = {
      findSeatByTripId: async () => { callOrder.push("Seat"); return mockSeat; },
      findTripWithSeatConfig: async () => { callOrder.push("Trip"); return null; },
      findActiveSeatHolds: async (t, u) => { callOrder.push("SeatHold"); return mockHolds; }
    };
    
    const service = createTripSeatAvailabilityService({ repository, mapper });
    const result = await service("trip123", "user123");
    
    assert.deepStrictEqual(callOrder, ["Seat", "Trip", "SeatHold"]);
    assert.deepStrictEqual(result, {
      _id: "seatId",
      seata: [],
      seatConfig: null
    });
  });

  await t.test("template configuration wins", async () => {
    const repository = {
      findSeatByTripId: async () => ({}),
      findTripWithSeatConfig: async () => ({ seatTemplateId: { seatConfig: "temp" }, busId: { seatConfig: "bus" } }),
      findActiveSeatHolds: async () => []
    };
    
    const service = createTripSeatAvailabilityService({ repository, mapper });
    const result = await service("trip123", "user123");
    
    assert.strictEqual(result.seatConfig, "temp");
  });

  await t.test("bus configuration falls back", async () => {
    const repository = {
      findSeatByTripId: async () => ({}),
      findTripWithSeatConfig: async () => ({ seatTemplateId: null, busId: { seatConfig: "bus" } }),
      findActiveSeatHolds: async () => []
    };
    
    const service = createTripSeatAvailabilityService({ repository, mapper });
    const result = await service("trip123", "user123");
    
    assert.strictEqual(result.seatConfig, "bus");
  });

  await t.test("repository errors propagate", async () => {
    const repository = {
      findSeatByTripId: async () => { throw new Error("Repo error"); }
    };
    
    const service = createTripSeatAvailabilityService({ repository, mapper });
    await assert.rejects(async () => service("trip123", "user123"), /Repo error/);
  });
});
