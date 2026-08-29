"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
  CHECK_ALPHABET,
  ENCODE_ALPHABET,
  canonicaliseSymbols,
  checkSymbolFor,
  isCheckSymbol,
  isEncodeSymbol,
  normaliseSymbols,
} = require("../../../../src/shared/identity/crockford-base32.js");

describe("crockford base32 — alphabet", () => {
  test("omits the symbols humans confuse", () => {
    // I/1, L/1 and O/0 are the classic transcription failures; U is dropped so a
    // random body cannot spell an obscenity.
    for (const excluded of ["I", "L", "O", "U"]) {
      assert.equal(ENCODE_ALPHABET.includes(excluded), false, `${excluded} present`);
    }
    assert.equal(ENCODE_ALPHABET.length, 32);
    assert.equal(new Set(ENCODE_ALPHABET).size, 32, "alphabet has a duplicate");
  });

  test("the check alphabet is a prime modulus wide", () => {
    // The detection guarantees below hold only because 37 is prime.
    assert.equal(CHECK_ALPHABET.length, 37);
    assert.ok(CHECK_ALPHABET.startsWith(ENCODE_ALPHABET));
  });

  test("classifies symbols by position", () => {
    assert.equal(isEncodeSymbol("Z"), true);
    assert.equal(isEncodeSymbol("U"), false);
    // U is legal in the check position but never as an encoding symbol.
    assert.equal(isCheckSymbol("U"), true);
    assert.equal(isCheckSymbol("!"), false);
  });
});

describe("crockford base32 — checksum is pinned", () => {
  /**
   * Hand-computed, not captured from the implementation. Issued codes are
   * permanent, so if a refactor changes this mapping every code already in the
   * wild becomes invalid. These vectors make that break loud.
   *
   * ENCODE_ALPHABET index: 0-9 => '0'-'9', 10 'A' .. 26 'T' .. 31 'Z'
   */
  const VECTORS = [
    ["000000", "0"], // value 0            -> 0 mod 37 = 0  -> '0'
    ["000001", "1"], // value 1            -> 1             -> '1'
    ["00000Z", "Z"], // value 31           -> 31            -> 'Z'
    ["000010", "*"], // value 32           -> 32            -> '*' (extra)
    ["00001Z", "T"], // value 1*32+31 = 63 -> 63-37 = 26     -> 'T'
  ];

  for (const [symbols, expected] of VECTORS) {
    test(`${symbols} -> ${expected}`, () => {
      assert.equal(checkSymbolFor(symbols), expected);
    });
  }

  test("throws on an undecodable symbol", () => {
    assert.throws(() => checkSymbolFor("00U000"), RangeError);
    assert.throws(() => checkSymbolFor("00!000"), RangeError);
  });
});

describe("crockford base32 — error detection", () => {
  /** A fixed spread so a failure is reproducible, not flaky. */
  const SAMPLES = [
    "000000", "ZZZZZZ", "7K4QP2", "0A1B2C",
    "TVWXYZ", "123456", "M9N8P7", "QRSTVW",
  ];

  test("catches every single-symbol substitution", () => {
    let checked = 0;
    for (const symbols of SAMPLES) {
      const expected = checkSymbolFor(symbols);
      for (let position = 0; position < symbols.length; position += 1) {
        for (const replacement of ENCODE_ALPHABET) {
          if (replacement === symbols[position]) continue;
          const typo =
            symbols.slice(0, position) + replacement + symbols.slice(position + 1);
          assert.notEqual(
            checkSymbolFor(typo),
            expected,
            `substitution undetected: ${symbols} -> ${typo}`
          );
          checked += 1;
        }
      }
    }
    assert.equal(checked, SAMPLES.length * 6 * 31);
  });

  test("catches every transposition of two adjacent symbols", () => {
    let checked = 0;
    for (const symbols of SAMPLES) {
      const expected = checkSymbolFor(symbols);
      for (let position = 0; position < symbols.length - 1; position += 1) {
        const left = symbols[position];
        const right = symbols[position + 1];
        if (left === right) continue; // swapping equal symbols is a no-op

        const swapped =
          symbols.slice(0, position) + right + left + symbols.slice(position + 2);
        assert.notEqual(
          checkSymbolFor(swapped),
          expected,
          `transposition undetected in ${symbols} at ${position}`
        );
        checked += 1;
      }
    }
    assert.ok(checked > 0, "no transpositions were exercised");
  });
});

describe("crockford base32 — normalisation", () => {
  test("strips noise and upper-cases", () => {
    assert.equal(normaliseSymbols("  sm-ag-7k4qp2x "), "SMAG7K4QP2X");
    assert.equal(normaliseSymbols("7-K-4"), "7K4");
  });

  test("folds the aliases humans get wrong", () => {
    // O -> 0, and both I and L -> 1.
    assert.equal(canonicaliseSymbols("OIL"), "011");
    assert.equal(canonicaliseSymbols("0A1B2C"), "0A1B2C");
  });

  test("refuses U rather than folding it", () => {
    // U is not an encoding symbol. Folding it to something else would silently
    // resolve to the wrong entity, so it must be refused outright.
    assert.equal(canonicaliseSymbols("00U000"), null);
    assert.equal(canonicaliseSymbols("00!000"), null);
  });
});
