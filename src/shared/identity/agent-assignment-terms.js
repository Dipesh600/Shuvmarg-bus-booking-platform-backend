"use strict";

/**
 * The assignment terms: how much of the operator's inventory an assignment opens
 * up, what the agent may do with it, and what the operator says they pay.
 *
 * Split from agent-assignment-status.js by reader — see the note there.
 *
 * There is no cash balance and no credit limit in this file, and there will not
 * be one (master plan D8). We record commission for the operator to read and
 * compute it on the way out; we never hold the money, so there is nothing to
 * settle and no float to reconcile. Adding a balance field here would create a
 * number that looks authoritative and that nothing in the system maintains.
 */

/** How much of the operator's inventory the assignment opens up. */
const ACCESS_SCOPES = Object.freeze({
  ALL_BUSES: "ALL_BUSES",
  ROUTES: "ROUTES",
  SCHEDULES: "SCHEDULES",
});

/**
 * How the operator describes what they pay the agent. Recorded for reporting and
 * computed on read, never paid out by us (master plan D4).
 */
const COMMISSION_MODES = Object.freeze({
  PERCENT: "PERCENT",
  FLAT_PER_SEAT: "FLAT_PER_SEAT",
  FLAT_PER_BOOKING: "FLAT_PER_BOOKING",
});

/**
 * What an agent may do before the operator narrows it in the terms step.
 *
 * `canCancel` is off by default because cancellation moves both money and
 * inventory, and a permissive default is a default that grants it to every
 * agent nobody got around to configuring. `cancelWindowMins` is 0 to match — it
 * caps a capability that is not granted yet, so any other value would be
 * describing a permission that does not exist.
 *
 * `maxSeatsPerBooking` is null, meaning uncapped. No such limit exists anywhere
 * in this codebase today, so picking a number here would be inventing policy
 * under the guise of a default; the operator sets it when they set the rest.
 */
const DEFAULT_PERMISSIONS = Object.freeze({
  canSellCash: true,
  canSellOnline: true,
  canCancel: false,
  cancelWindowMins: 0,
  maxSeatsPerBooking: null,
  maxDiscountPct: 0,
});

/**
 * The commission an assignment starts on: nothing, stated explicitly.
 *
 * PERCENT/0 rather than a null mode so that every row answers "how is this agent
 * paid?" with a shape the reporter can read. A missing mode would push a
 * null-check into every caller that formats a commission line.
 */
const DEFAULT_COMMISSION = Object.freeze({
  mode: COMMISSION_MODES.PERCENT,
  value: 0,
});

/** Percent modes are bounded by their unit; flat modes only by being positive. */
const MAX_COMMISSION_PERCENT = 100;

const isAccessScope = (value) => Object.hasOwn(ACCESS_SCOPES, String(value));

const isCommissionMode = (value) => Object.hasOwn(COMMISSION_MODES, String(value));

/**
 * Whether a commission pair is coherent.
 *
 * PERCENT is capped at 100 because more than the fare is not a commission. The
 * flat modes have no upper bound to check against here — the fare is not known
 * at the time the terms are set, and rejecting a large flat rate would be us
 * second-guessing a deal we are not party to.
 */
const isCommissionValid = (mode, value) => {
  if (!isCommissionMode(mode)) {
    return false;
  }
  if (!Number.isFinite(value) || value < 0) {
    return false;
  }
  return mode !== COMMISSION_MODES.PERCENT || value <= MAX_COMMISSION_PERCENT;
};

module.exports = {
  ACCESS_SCOPES,
  COMMISSION_MODES,
  DEFAULT_COMMISSION,
  DEFAULT_PERMISSIONS,
  MAX_COMMISSION_PERCENT,
  isAccessScope,
  isCommissionMode,
  isCommissionValid,
};
