"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dayBounds,
  pagination,
  overviewWindow,
  buildSearchQuery,
} = require("../../src/modules/admin/trip-overview/trip-overview-query.policy.js");

test("admin trip-overview query policy", async (t) => {
  await t.test("pagination preserves defaults, bounds, and skip", () => {
    assert.deepEqual(pagination({}), { page: 1, limit: 30, skip: 0 });
    assert.deepEqual(pagination({ page: "3", limit: "500" }), {
      page: 3,
      limit: 100,
      skip: 200,
    });
  });
  await t.test("UTC day bounds include the complete day", () => {
    const bounds = dayBounds(new Date("2026-03-04T12:34:56.000Z"));
    assert.equal(bounds.start.toISOString(), "2026-03-04T00:00:00.000Z");
    assert.equal(bounds.end.toISOString(), "2026-03-04T23:59:59.999Z");
  });
  await t.test("overview window rejects invalid dates exactly", () => {
    assert.throws(
      () => overviewWindow({ from: "not-a-date" }),
      /Invalid date format\./
    );
  });
  await t.test("date range overrides exact date", () => {
    const query = buildSearchQuery({
      date: "2026-03-04",
      from: "2026-04-01",
      to: "2026-04-02",
    });
    assert.equal(query.tripDate.$gte.toISOString(), "2026-04-01T00:00:00.000Z");
    assert.equal(query.tripDate.$lte.toISOString(), "2026-04-02T23:59:59.999Z");
    assert.equal(query.tripDate.$lt, undefined);
  });
  await t.test("status and four-field text search are preserved", () => {
    const query = buildSearchQuery({ status: "cancelled", search: " KTM " });
    assert.equal(query.status, "cancelled");
    assert.equal(query.$or.length, 4);
    assert.deepEqual(query.$or[0], {
      tripId: { $regex: "KTM", $options: "i" },
    });
  });
});
