const test = require("node:test");
const assert = require("node:assert");
const { resolveSeatConfig, maskActiveHeldSeats, buildAvailabilityData } = require("../../../src/modules/booking/trip-seat-availability/trip-seat-availability.mapper");

test("Trip seat availability mapper", async (t) => {
  await t.test("resolveSeatConfig", async (st) => {
    await st.test("template priority", () => {
      const trip = { seatTemplateId: { seatConfig: "temp" }, busId: { seatConfig: "bus" } };
      assert.strictEqual(resolveSeatConfig(trip), "temp");
    });
    await st.test("bus fallback", () => {
      const trip = { seatTemplateId: { seatConfig: null }, busId: { seatConfig: "bus" } };
      assert.strictEqual(resolveSeatConfig(trip), "bus");
    });
    await st.test("null fallback", () => {
      const trip = { seatTemplateId: null, busId: { seatConfig: null } };
      assert.strictEqual(resolveSeatConfig(trip), null);
    });
    await st.test("null trip", () => {
      assert.strictEqual(resolveSeatConfig(null), null);
    });
  });

  await t.test("maskActiveHeldSeats", async (st) => {
    await st.test("held seata/seatb/seatc masking, case-insensitive, ignores missing arrays", () => {
      const seats = {
        seata: [{ seatNo: "a1", booked: false }, { seatNo: "A2", booked: false }],
        seatb: [{ seatNo: "b1", booked: false }],
        seatc: [{ seatNo: "c1", booked: false }]
      };
      const holds = [{ seatNumbers: ["A1", "B1"] }, { seatNumbers: ["C1"] }];
      
      const result = maskActiveHeldSeats(seats, holds);
      
      assert.strictEqual(result.seata[0].booked, true);
      assert.strictEqual(result.seata[0].blockedFor, "reserved");
      assert.strictEqual(result.seata[1].booked, false);
      assert.strictEqual(result.seatb[0].booked, true);
      assert.strictEqual(result.seatb[0].blockedFor, "reserved");
      assert.strictEqual(result.seatc[0].booked, true);
      assert.strictEqual(result.seatc[0].blockedFor, "reserved");
    });

    await st.test("booked seats remain without new blockedFor", () => {
      const seats = { seata: [{ seatNo: "a1", booked: true }] };
      const holds = [{ seatNumbers: ["a1"] }];
      maskActiveHeldSeats(seats, holds);
      assert.strictEqual(seats.seata[0].booked, true);
      assert.strictEqual(seats.seata[0].blockedFor, undefined);
    });

    await st.test("unheld seats remain unchanged", () => {
      const seats = { seata: [{ seatNo: "a1", booked: false }] };
      maskActiveHeldSeats(seats, []);
      assert.strictEqual(seats.seata[0].booked, false);
    });

    await st.test("missing seat arrays are tolerated", () => {
      const seats = {};
      maskActiveHeldSeats(seats, [{ seatNumbers: ["a1"] }]);
      assert.ok(true);
    });

    await st.test("null activeHolds throws", () => {
      assert.throws(() => maskActiveHeldSeats({}, null), TypeError);
    });

    await st.test("hold without seatNumbers throws", () => {
      assert.throws(() => maskActiveHeldSeats({}, [{}]), TypeError);
    });

    await st.test("non-array hold.seatNumbers throws", () => {
      assert.throws(() => maskActiveHeldSeats({}, [{ seatNumbers: "a1" }]), TypeError);
    });

    await st.test("truthy non-array seat group throws", () => {
      const seats = { seata: "not-an-array" };
      assert.throws(() => maskActiveHeldSeats(seats, [{ seatNumbers: ["a1"] }]), TypeError);
    });

    await st.test("inspected seat without seatNo throws", () => {
      const seats = { seata: [{ booked: false }] };
      assert.throws(() => maskActiveHeldSeats(seats, [{ seatNumbers: ["a1"] }]), TypeError);
    });

    await st.test("no active holds do not traverse/mutate seats", () => {
      const seats = { seata: [{ seatNo: "a1", booked: false }] };
      const result = maskActiveHeldSeats(seats, []);
      assert.strictEqual(result.seata[0].booked, false);
      assert.strictEqual(result, seats);
    });
  });

  await t.test("buildAvailabilityData", async (st) => {
    await st.test("output spreads all seat-document properties and overrides seatConfig", () => {
      const seats = { id: 1, name: "test", seatConfig: "old" };
      const config = "new";
      const result = buildAvailabilityData(seats, config);
      assert.deepStrictEqual(result, { id: 1, name: "test", seatConfig: "new" });
    });
  });
});
