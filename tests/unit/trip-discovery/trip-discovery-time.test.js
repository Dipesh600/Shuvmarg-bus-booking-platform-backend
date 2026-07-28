const { test } = require("node:test");
const assert = require("node:assert");
const { timeToMins } = require("../../../src/modules/trip-discovery/trip-discovery-time");

test("Trip Discovery Time Parser", async (t) => {
  await t.test("parses 05:20 PM", () => {
    assert.strictEqual(timeToMins("05:20 PM"), 17 * 60 + 20);
  });

  await t.test("parses 12:20 PM", () => {
    assert.strictEqual(timeToMins("12:20 PM"), 12 * 60 + 20);
  });

  await t.test("parses 12:00 AM", () => {
    assert.strictEqual(timeToMins("12:00 AM"), 0);
  });

  await t.test("parses 1:05 AM", () => {
    assert.strictEqual(timeToMins("1:05 AM"), 1 * 60 + 5);
  });

  await t.test("parses 17:20", () => {
    assert.strictEqual(timeToMins("17:20"), 17 * 60 + 20);
  });

  await t.test("parses 5:20", () => {
    assert.strictEqual(timeToMins("5:20"), 5 * 60 + 20);
  });

  await t.test("handles null", () => {
    assert.strictEqual(timeToMins(null), 0);
  });

  await t.test("handles undefined", () => {
    assert.strictEqual(timeToMins(undefined), 0);
  });

  await t.test("handles number", () => {
    assert.strictEqual(timeToMins(123), 0);
  });

  await t.test("handles empty string", () => {
    assert.strictEqual(timeToMins(""), 0);
  });

  await t.test("handles invalid string", () => {
    assert.strictEqual(timeToMins("invalid"), 0);
  });
});
