const { test } = require("node:test");
const assert = require("node:assert");
const { buildTripQuery } = require("../../../src/modules/trip-discovery/trip-discovery-query");

test("Trip Discovery Query Builder", async (t) => {
  await t.test("exact base query", () => {
    const query = buildTripQuery([], [], "2024-01-01", "day");
    assert.strictEqual(query.isActive, true);
    assert.strictEqual(query.status, "scheduled");
    assert.deepStrictEqual(query.busId, { $ne: null });
    assert.ok(query.bookingClosesAt.$gt instanceof Date);
  });

  await t.test("legacy IDs create routeId $in", () => {
    const query = buildTripQuery(["route1"], [], "2024-01-01", "day");
    assert.deepStrictEqual(query.$or, [
      { routeId: { $in: ["route1"] } }
    ]);
  });

  await t.test("variant IDs create variantId $in", () => {
    const query = buildTripQuery([], ["var1"], "2024-01-01", "day");
    assert.deepStrictEqual(query.$or, [
      { variantId: { $in: ["var1"] } }
    ]);
  });

  await t.test("both produce the expected $or", () => {
    const query = buildTripQuery(["route1"], ["var1"], "2024-01-01", "day");
    assert.deepStrictEqual(query.$or, [
      { routeId: { $in: ["route1"] } },
      { variantId: { $in: ["var1"] } }
    ]);
  });

  await t.test("no IDs produce no $or", () => {
    const query = buildTripQuery([], [], "2024-01-01", "day");
    assert.strictEqual(query.$or, undefined);
  });

  await t.test("date boundaries", () => {
    const query = buildTripQuery([], [], "2024-01-01", "day");
    assert.strictEqual(query.tripDate.$gte.toISOString(), "2024-01-01T00:00:00.000Z");
    assert.strictEqual(query.tripDate.$lte.toISOString(), "2024-01-01T23:59:59.999Z");
  });

  await t.test("scalar shift is trimmed and lowercased", () => {
    const query = buildTripQuery([], [], "2024-01-01", " Day ");
    assert.strictEqual(query.shift, "day");
  });

  await t.test("array shift uses $in", () => {
    const query = buildTripQuery([], [], "2024-01-01", ["day", "night"]);
    assert.deepStrictEqual(query.shift, { $in: ["day", "night"] });
  });

  await t.test("'both' creates no shift condition", () => {
    const query = buildTripQuery([], [], "2024-01-01", "both");
    assert.strictEqual(query.shift, undefined);
  });

  await t.test("empty shift creates no shift condition", () => {
    const query = buildTripQuery([], [], "2024-01-01", "");
    assert.strictEqual(query.shift, undefined);
    
    const query2 = buildTripQuery([], [], "2024-01-01", null);
    assert.strictEqual(query2.shift, undefined);
  });
});
