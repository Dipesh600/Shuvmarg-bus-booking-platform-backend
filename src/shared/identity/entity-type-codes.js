"use strict";

/**
 * The entity-type namespace for human-facing codes (the TT in SM-<TT>-...).
 *
 * This namespace is APPEND-ONLY. Never reassign a two-letter code: issued codes
 * are permanent and live in printed material, SMS history and other people's
 * records, so reassigning a prefix would make two different entities share an
 * identifier shape forever.
 *
 * Reserving a code here does NOT mean that entity mints codes today. ROUTE_VARIANT
 * and ROUTE_CORRIDOR already carry sequential semantic codes issued by
 * src/modules/admin/platform-registry/variant-code-allocation.service.js; they
 * are listed only so nobody reuses those two letters for something else.
 *
 * "SE" is deliberately absent. It was reserved for Settlement, and settlement was
 * dropped from the model — we record an operator's commission terms but never
 * settle money on their behalf. The gap is intentional: do not fill it with Seat
 * or Session.
 */
const ENTITY_TYPE_CODES = Object.freeze({
  AGENT: "AG",
  AGENT_ASSIGNMENT: "AS",
  BOOKING: "BK",
  BUS_OWNER: "OW",
  CONDUCTOR: "CD",
  DRIVER: "DR",
  FLEET: "FL",
  OPERATOR: "OP",
  ROUTE_CORRIDOR: "CR",
  ROUTE_VARIANT: "RV",
  SCHEDULE: "SC",
  STOP: "ST",
  TRANSACTION: "TX",
  TRIP: "TR",
  USER: "US",
});

const KNOWN_TYPE_CODES = Object.freeze(new Set(Object.values(ENTITY_TYPE_CODES)));

function isKnownTypeCode(typeCode) {
  return KNOWN_TYPE_CODES.has(typeCode);
}

/**
 * Throws on an unregistered type code. Passing one is a programmer mistake, not
 * bad user input, so it fails loudly rather than returning a result object.
 */
function assertKnownTypeCode(typeCode) {
  if (!KNOWN_TYPE_CODES.has(typeCode)) {
    throw new RangeError(
      `Unknown entity type code "${typeCode}". Register it in ENTITY_TYPE_CODES first.`
    );
  }
}

module.exports = {
  ENTITY_TYPE_CODES,
  KNOWN_TYPE_CODES,
  assertKnownTypeCode,
  isKnownTypeCode,
};
