"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  ENTITY_TYPE_CODES,
  KNOWN_TYPE_CODES,
  assertKnownTypeCode,
  isKnownTypeCode,
} = require("../../../../src/shared/identity/entity-type-codes.js");

describe("entity type codes", () => {
  test("every code is two upper-case letters and unique", () => {
    const seen = new Set();
    for (const [name, code] of Object.entries(ENTITY_TYPE_CODES)) {
      assert.match(code, /^[A-Z]{2}$/, `${name} -> ${code}`);
      assert.equal(seen.has(code), false, `duplicate type code ${code} (${name})`);
      seen.add(code);
    }
    assert.equal(seen.size, KNOWN_TYPE_CODES.size);
  });

  test("the namespace is frozen against accidental mutation", () => {
    // Reassigning a code would break every identifier already issued under it.
    assert.equal(Object.isFrozen(ENTITY_TYPE_CODES), true);
    assert.throws(() => {
      ENTITY_TYPE_CODES.AGENT = "XX";
    }, TypeError);
  });

  test("SE stays unassigned", () => {
    // Reserved for the dropped Settlement entity. Left as a deliberate gap so it
    // is not quietly reused for Seat or Session.
    assert.equal(KNOWN_TYPE_CODES.has("SE"), false);
  });

  test("the codes this project needs are registered", () => {
    // Guards against someone pruning the namespace mid-build.
    for (const code of ["AG", "AS", "BK", "OW", "OP"]) {
      assert.equal(isKnownTypeCode(code), true, `${code} missing`);
    }
  });

  test("recognises only registered codes", () => {
    assert.equal(isKnownTypeCode("AG"), true);
    assert.equal(isKnownTypeCode("ag"), false);
    assert.equal(isKnownTypeCode("ZZ"), false);
    assert.equal(isKnownTypeCode(""), false);
  });

  test("asserting an unregistered code throws", () => {
    assert.doesNotThrow(() => assertKnownTypeCode("AG"));
    assert.throws(() => assertKnownTypeCode("ZZ"), RangeError);
    assert.throws(() => assertKnownTypeCode("SE"), RangeError);
  });
});
