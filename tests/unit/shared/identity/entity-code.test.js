"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const { checkSymbolFor } = require("../../../../src/shared/identity/crockford-base32.js");
const { ENTITY_TYPE_CODES } = require("../../../../src/shared/identity/entity-type-codes.js");
const {
  BODY_LENGTH,
  BRAND_STEM,
  canonicaliseEntityCode,
  generateEntityCode,
  isValidEntityCode,
  parseEntityCode,
} = require("../../../../src/shared/identity/entity-code.js");

const TYPE_CODES = Object.values(ENTITY_TYPE_CODES);

/** The five symbols Crockford allows in the check position but we never emit. */
const HOSTILE = ["*", "~", "$", "=", "U"];

describe("entity code — generation", () => {
  test("mints a well-formed, parseable code for every registered type", () => {
    for (const typeCode of TYPE_CODES) {
      const code = generateEntityCode(typeCode);
      assert.match(
        code,
        new RegExp(`^${BRAND_STEM}-${typeCode}-[0-9A-HJKMNP-TV-Z]{${BODY_LENGTH + 1}}$`),
        `bad shape for ${typeCode}: ${code}`
      );
      const parsed = parseEntityCode(code);
      assert.equal(parsed.valid, true, code);
      assert.equal(parsed.typeCode, typeCode);
      assert.equal(parsed.canonical, code);
    }
  });

  test("never emits a check symbol that is hard to write or dictate", () => {
    // 2000 draws puts the chance of missing a leaked hostile symbol at (32/37)^2000.
    for (let i = 0; i < 2000; i += 1) {
      const code = generateEntityCode(ENTITY_TYPE_CODES.AGENT);
      for (const symbol of HOSTILE) {
        assert.ok(!code.includes(symbol), `${code} contains ${symbol}`);
      }
    }
  });

  test("does not repeat itself", () => {
    const seen = new Set();
    for (let i = 0; i < 5000; i += 1) {
      seen.add(generateEntityCode(ENTITY_TYPE_CODES.AGENT));
    }
    // 5000 draws from ~1e9 -> ~0.01 expected collisions. A generator stuck on a
    // constant, or seeded once per process, fails this outright.
    assert.equal(seen.size, 5000);
  });

  test("rejects an unregistered type code as a programmer error", () => {
    for (const bad of ["ZZ", "ag", "", "AGENT"]) {
      assert.throws(() => generateEntityCode(bad), RangeError, `accepted ${bad}`);
    }
  });

  test("gives up loudly if the random source cannot produce a clean check symbol", () => {
    assert.throws(
      () => generateEntityCode(ENTITY_TYPE_CODES.AGENT, { maxAttempts: 0 }),
      /random source/
    );
  });
});

describe("entity code — validation", () => {
  test("accepts a supplied hostile check symbol even though we never mint one", () => {
    // Crockford-legal input from any source must validate; only generation is
    // restricted to the clean 32. Body 000010 has value 32 -> check '*'.
    const parsed = parseEntityCode("SM-AG-000010*");
    assert.equal(parsed.valid, true, JSON.stringify(parsed));
    assert.equal(parsed.check, "*");
  });

  test("catches a body typo that the checksum would not survive", () => {
    const check = checkSymbolFor("7K4QP2");
    assert.equal(parseEntityCode(`${BRAND_STEM}-AG-7K4QP2${check}`).valid, true);
    assert.equal(parseEntityCode(`${BRAND_STEM}-AG-7K4Q2P${check}`).reason, "CHECKSUM_MISMATCH");
  });

  const REJECTIONS = [
    [null, "NOT_A_STRING"],
    [undefined, "NOT_A_STRING"],
    [12345, "NOT_A_STRING"],
    ["", "WRONG_LENGTH"],
    ["SM-AG-7K4QP2", "WRONG_LENGTH"],
    ["SM-AG-7K4QP2XY", "WRONG_LENGTH"],
    ["XX-AG-7K4QP2X", "WRONG_BRAND_STEM"],
    ["SM-ZZ-7K4QP2X", "UNKNOWN_TYPE_CODE"],
    ["SM-AG-0A1B2U0", "BAD_BODY_SYMBOL"],
    ["SM-AG-7K4QP2!", "BAD_CHECK_SYMBOL"],
  ];

  for (const [input, reason] of REJECTIONS) {
    test(`${JSON.stringify(input)} -> ${reason}`, () => {
      const parsed = parseEntityCode(input);
      assert.equal(parsed.valid, false);
      assert.equal(parsed.reason, reason);
    });
  }
});

describe("entity code — forgiving input", () => {
  const code = generateEntityCode(ENTITY_TYPE_CODES.AGENT);

  test("is case insensitive", () => {
    assert.equal(canonicaliseEntityCode(code.toLowerCase()), code);
    assert.equal(canonicaliseEntityCode(code.toUpperCase()), code);
  });

  test("treats hyphens and whitespace as noise wherever they land", () => {
    const stripped = code.replace(/-/g, "");
    assert.equal(canonicaliseEntityCode(stripped), code);
    assert.equal(canonicaliseEntityCode(`  ${code}  `), code);
    assert.equal(canonicaliseEntityCode(stripped.replace(/(.{3})/g, "$1-")), code);
  });

  test("resolves a body written with confused letters", () => {
    // An agent dictating "oh-ay-one-bee-two-see" must land on the same record.
    const check = checkSymbolFor("0A1B2C");
    const canonical = `${BRAND_STEM}-AG-0A1B2C${check}`;
    assert.equal(canonicaliseEntityCode(`SM-AG-OAiB2C${check}`), canonical);
    assert.equal(canonicaliseEntityCode(`sm ag OALB2C${check}`), canonical);
  });

  test("returns null rather than throwing on junk", () => {
    assert.equal(canonicaliseEntityCode("nonsense"), null);
    assert.equal(canonicaliseEntityCode(null), null);
  });
});

describe("entity code — type is part of validity", () => {
  test("a valid code of the wrong type is rejected when a type is expected", () => {
    const booking = generateEntityCode(ENTITY_TYPE_CODES.BOOKING);
    assert.equal(isValidEntityCode(booking), true);
    assert.equal(isValidEntityCode(booking, ENTITY_TYPE_CODES.BOOKING), true);
    // Pasting a booking code into "find agent by code" must not pass.
    assert.equal(isValidEntityCode(booking, ENTITY_TYPE_CODES.AGENT), false);
  });

  test("an unregistered expected type is a programmer error", () => {
    assert.throws(() => isValidEntityCode("SM-AG-7K4QP2X", "ZZ"), RangeError);
  });
});
