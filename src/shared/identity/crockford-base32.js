"use strict";

/**
 * Crockford Base32 — the encoding primitive, with no knowledge of Shuvmarg
 * entity codes. Kept separate so the alphabet and the checksum can be tested
 * and reasoned about on their own.
 *
 * Reference: https://www.crockford.com/base32.html
 */

/** The 32 encoding symbols. A symbol's index in this string IS its value. */
const ENCODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * The check alphabet is the 32 encoding symbols plus five extras, giving a
 * modulus of 37. A *prime* modulus is the whole point: it detects every
 * single-symbol substitution and every transposition of two adjacent symbols.
 * Modulus 32 would miss some transpositions.
 */
const CHECK_ALPHABET = `${ENCODE_ALPHABET}*~$=U`;
const CHECK_MODULUS = 37;

/**
 * Symbol -> value, including Crockford's forgiving aliases, so a human who
 * writes the letter O where a zero was meant still resolves correctly.
 *
 * U is deliberately absent. It is not an encoding symbol, so a U inside a body
 * must be rejected rather than folded to something else — folding it would
 * silently resolve to the wrong entity.
 */
const SYMBOL_VALUES = (() => {
  const values = new Map();
  for (let index = 0; index < ENCODE_ALPHABET.length; index += 1) {
    values.set(ENCODE_ALPHABET[index], index);
  }
  values.set("O", 0);
  values.set("I", 1);
  values.set("L", 1);
  return values;
})();

/** Hyphens and whitespace carry no meaning; Crockford treats them as noise. */
const NOISE = /[\s-]/g;

/** Strip noise and upper-case. Does not validate. */
function normaliseSymbols(input) {
  return input.replace(NOISE, "").toUpperCase();
}

/** The value of a symbol, or undefined if it is not decodable. */
function symbolValue(symbol) {
  return SYMBOL_VALUES.get(symbol);
}

/** True when `symbol` is one of the 32 canonical encoding symbols. */
function isEncodeSymbol(symbol) {
  return ENCODE_ALPHABET.includes(symbol);
}

/** True when `symbol` is legal in the check position. */
function isCheckSymbol(symbol) {
  return CHECK_ALPHABET.includes(symbol);
}

/**
 * Rewrite a run of symbols into canonical form, folding the aliases.
 * Returns null if any symbol is not decodable.
 */
function canonicaliseSymbols(symbols) {
  let canonical = "";
  for (const symbol of symbols) {
    const value = SYMBOL_VALUES.get(symbol);
    if (value === undefined) return null;
    canonical += ENCODE_ALPHABET[value];
  }
  return canonical;
}

/**
 * The check symbol for a run of symbols.
 *
 * Folds modulo 37 as it goes rather than building the full integer, so the
 * input length can grow later without reaching for BigInt.
 */
function checkSymbolFor(symbols) {
  let remainder = 0;
  for (const symbol of symbols) {
    const value = SYMBOL_VALUES.get(symbol);
    if (value === undefined) {
      throw new RangeError(`Not a Crockford Base32 symbol: ${symbol}`);
    }
    remainder = (remainder * ENCODE_ALPHABET.length + value) % CHECK_MODULUS;
  }
  return CHECK_ALPHABET[remainder];
}

module.exports = {
  CHECK_ALPHABET,
  CHECK_MODULUS,
  ENCODE_ALPHABET,
  canonicaliseSymbols,
  checkSymbolFor,
  isCheckSymbol,
  isEncodeSymbol,
  normaliseSymbols,
  symbolValue,
};
