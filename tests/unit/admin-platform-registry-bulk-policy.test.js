"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const policy = require(
  "../../src/modules/admin/platform-registry/stop-bulk-import.policy.js"
);

test("platform registry bulk policy preserves batch limits", () => {
  assert.throws(() => policy.validateBatch("invalid"), /JSON array/);
  assert.throws(() => policy.validateBatch([]), /nothing to import/);
  assert.throws(
    () => policy.validateBatch(Array.from({ length: 501 })),
    /Maximum is 500/
  );
  assert.doesNotThrow(() => policy.validateBatch([{ code: "KTM" }]));
});

test("platform registry bulk policy normalizes a valid stop", () => {
  assert.deepEqual(
    policy.sanitizeEntry({
      code: " ktm ", name: " Kathmandu ", type: "city",
      province: " Bagmati ", aliases: "Kathmandu, KTM ",
    }, 0),
    {
      ok: true,
      entry: {
        _sourceIndex: 0,
        code: "KTM", name: "Kathmandu", type: "CITY",
        aliases: ["Kathmandu", "KTM"], province: "Bagmati",
      },
    }
  );
});

test("platform registry bulk policy preserves row-specific failures", () => {
  assert.match(policy.sanitizeEntry(null, 1).error, /Row 2: must be an object/);
  assert.match(policy.sanitizeEntry({ name: "X" }, 2).error, /Row 3: 'code'/);
  assert.match(
    policy.sanitizeEntry({ code: "A!", name: "X" }, 3).error,
    /2–8 uppercase/
  );
  assert.match(
    policy.sanitizeEntry({ code: "ABC", name: "X", type: "PORT" }, 4).error,
    /type "PORT" is invalid/
  );
});
