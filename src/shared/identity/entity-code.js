"use strict";

const crypto = require("node:crypto");
const base32 = require("./crockford-base32.js");
const { assertKnownTypeCode, isKnownTypeCode } = require("./entity-type-codes.js");

/**
 * Entity codes: the human-facing identifiers people read aloud, write on paper
 * and paste into a form. Distinct from Mongo `_id`, which stays internal.
 *
 * Shape: SM-<TT>-<BBBBBB><C>   e.g. SM-AG-7K4QP2X   (11 significant symbols)
 *   SM / TT / BBBBBB / C = brand stem / entity type / random body / check symbol
 *
 * Why random and not sequential: an agent code is published by design — the
 * agent hands it to operators to be assigned. A sequential code would let
 * anyone enumerate every agent on the platform. Route variants use a sequential
 * semantic code precisely because they are internal; the difference is deliberate.
 *
 * SCOPE: pure. No I/O, and it guarantees structural validity only, never
 * uniqueness. Uniqueness is the caller's job via a unique index plus a bounded
 * retry loop — the contract variant-code-allocation.service.js works to.
 */

const BRAND_STEM = "SM";
const BODY_LENGTH = 6;
const TYPE_CODE_LENGTH = 2;
const SIGNIFICANT_LENGTH = BRAND_STEM.length + TYPE_CODE_LENGTH + BODY_LENGTH + 1;

/**
 * Retries used when the check symbol lands on one of the five extras.
 * 100 attempts all failing has probability (5/37)^100 ~= 1e-88, so exhausting
 * this cap means the random source is broken, not that we were unlucky.
 */
const DEFAULT_MAX_ATTEMPTS = 100;

/**
 * Mint a structurally valid code. Does NOT check the database — see SCOPE above.
 *
 * Only the 32 clean symbols are ever emitted in the check position, so a
 * generated code never contains * ~ $ = or U. Those five are legal on the way in
 * and we validate them correctly, but they are hostile in an identifier an agent
 * writes on a receipt or dictates over a phone, so we re-roll instead.
 */
function generateEntityCode(typeCode, { maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  assertKnownTypeCode(typeCode);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let body = "";
    for (let index = 0; index < BODY_LENGTH; index += 1) {
      // randomInt is rejection-sampled and unbiased. Math.random is neither
      // uniform enough nor unpredictable, and this identifier is published.
      body += base32.ENCODE_ALPHABET[crypto.randomInt(base32.ENCODE_ALPHABET.length)];
    }

    const check = base32.checkSymbolFor(body);
    if (base32.isEncodeSymbol(check)) {
      return `${BRAND_STEM}-${typeCode}-${body}${check}`;
    }
  }

  throw new Error(
    `Could not mint a ${typeCode} code with a clean check symbol in ${maxAttempts} ` +
    "attempts; the random source is almost certainly faulty."
  );
}

/**
 * Parse untrusted input.
 *
 * Returns a result object rather than throwing, because the input is whatever a
 * human typed. Programmer mistakes (an unregistered expected type) do throw.
 *
 * `canonical` is the value to persist and compare on: normalisation means
 * "sm-ag-7k4qp2x", "SMAG7K4QP2X" and "SM-AG-7K4QP2X" all reduce to one form.
 */
function parseEntityCode(input) {
  if (typeof input !== "string") {
    return { valid: false, reason: "NOT_A_STRING" };
  }

  const normalised = base32.normaliseSymbols(input);
  if (normalised.length !== SIGNIFICANT_LENGTH) {
    return { valid: false, reason: "WRONG_LENGTH" };
  }
  if (!normalised.startsWith(BRAND_STEM)) {
    return { valid: false, reason: "WRONG_BRAND_STEM" };
  }

  const typeEnd = BRAND_STEM.length + TYPE_CODE_LENGTH;
  const typeCode = normalised.slice(BRAND_STEM.length, typeEnd);
  if (!isKnownTypeCode(typeCode)) {
    return { valid: false, reason: "UNKNOWN_TYPE_CODE" };
  }

  // Fold the forgiving aliases (O->0, I/L->1) before checksumming, so a
  // transcription slip is corrected rather than reported as a bad checksum.
  const body = base32.canonicaliseSymbols(normalised.slice(typeEnd, typeEnd + BODY_LENGTH));
  if (body === null) {
    return { valid: false, reason: "BAD_BODY_SYMBOL" };
  }

  const check = normalised.slice(-1);
  if (!base32.isCheckSymbol(check)) {
    return { valid: false, reason: "BAD_CHECK_SYMBOL" };
  }
  if (base32.checkSymbolFor(body) !== check) {
    return { valid: false, reason: "CHECKSUM_MISMATCH" };
  }

  return {
    valid: true,
    typeCode,
    body,
    check,
    canonical: `${BRAND_STEM}-${typeCode}-${body}${check}`,
  };
}

/**
 * True when `input` is a well-formed code of the given type.
 *
 * Pass `expectedTypeCode` whenever you know it. Skipping it means an operator
 * could paste a booking code into "find agent by code", pass validation, and
 * fail confusingly at lookup instead.
 */
function isValidEntityCode(input, expectedTypeCode = null) {
  if (expectedTypeCode !== null) {
    assertKnownTypeCode(expectedTypeCode);
  }
  const result = parseEntityCode(input);
  if (!result.valid) return false;
  return expectedTypeCode === null || result.typeCode === expectedTypeCode;
}

/** Normalised form for storage and comparison, or null if the input is invalid. */
function canonicaliseEntityCode(input) {
  const result = parseEntityCode(input);
  return result.valid ? result.canonical : null;
}

module.exports = {
  BODY_LENGTH,
  BRAND_STEM,
  DEFAULT_MAX_ATTEMPTS,
  canonicaliseEntityCode,
  generateEntityCode,
  isValidEntityCode,
  parseEntityCode,
};
