"use strict";

/**
 * The assignment lifecycle: whether an agent↔operator relationship exists, and
 * whether it currently permits selling.
 *
 * Split from agent-assignment-terms.js because the two have different readers.
 * This file is read by the invite, accept, decline, suspend and revoke flows and
 * by the selling guard — everything that asks "is this relationship live?". The
 * terms file is read by the operator's terms editor and the commission report,
 * which ask "on what conditions?". Nothing needs both at once.
 *
 * Separate from agent-enums.js for a stronger reason: those describe the
 * *person* — identity and KYC, which is the platform's business — while these
 * describe the *relationship*, which is the operator's. The two are granted and
 * revoked independently. An operator suspending an agent must not touch that
 * agent's KYC, and the platform suspending an agent must not silently rewrite
 * an operator's terms.
 */

/**
 *   INVITED → ACTIVE ⇄ SUSPENDED → REVOKED
 *      └→ DECLINED | EXPIRED
 *
 * The agent must accept (master plan D3): an operator cannot conscript someone
 * into selling for them, so a fresh row is INVITED and never ACTIVE.
 */
const ASSIGNMENT_STATUSES = Object.freeze({
  INVITED: "INVITED",
  ACTIVE: "ACTIVE",
  SUSPENDED: "SUSPENDED",
  REVOKED: "REVOKED",
  DECLINED: "DECLINED",
  EXPIRED: "EXPIRED",
});

/**
 * Statuses in which the relationship still exists in some form.
 *
 * This list is what the partial unique index on (agentId, operatorId) filters
 * on, and the distinction is the whole reason the index is partial. The
 * invariant we need is "at most one *live* assignment per agent per operator".
 * "Only one row ever" is a different and wrong invariant: an agent who was
 * revoked and is later re-hired needs a second row, and the first has to stay
 * put as history.
 */
const LIVE_ASSIGNMENT_STATUSES = Object.freeze([
  ASSIGNMENT_STATUSES.INVITED,
  ASSIGNMENT_STATUSES.ACTIVE,
  ASSIGNMENT_STATUSES.SUSPENDED,
]);

/** Completed relationships retained only as history. */
const TERMINAL_ASSIGNMENT_STATUSES = Object.freeze([
  ASSIGNMENT_STATUSES.REVOKED,
  ASSIGNMENT_STATUSES.DECLINED,
  ASSIGNMENT_STATUSES.EXPIRED,
]);

/**
 * The only status that permits selling. Stated here rather than hardcoded in
 * the selling guard so "may this agent sell for this operator?" has one answer
 * in one place.
 */
const SELLABLE_ASSIGNMENT_STATUSES = Object.freeze([ASSIGNMENT_STATUSES.ACTIVE]);

/**
 * Legal transitions, not actor authorization. This table says a move can exist;
 * it never says who may perform it. Every endpoint must pin its actor-specific
 * starting status literally in its atomic write. Using canTransition as a gate
 * lets an agent self-reinstate or an operator accept an invite for the agent.
 *
 * REVOKED, DECLINED and EXPIRED are terminal — they map to an
 * empty list, which is deliberately not the same as being absent from the table.
 *
 * A Map, not a plain object: statuses arrive from request bodies, and on a plain
 * object a lookup of "constructor" resolves truthy off the prototype chain.
 */
const ASSIGNMENT_TRANSITIONS = new Map([
  [ASSIGNMENT_STATUSES.INVITED, Object.freeze([
    ASSIGNMENT_STATUSES.ACTIVE,
    ASSIGNMENT_STATUSES.DECLINED,
    ASSIGNMENT_STATUSES.EXPIRED,
    // An operator may withdraw an invite before it is answered.
    ASSIGNMENT_STATUSES.REVOKED,
  ])],
  [ASSIGNMENT_STATUSES.ACTIVE, Object.freeze([
    ASSIGNMENT_STATUSES.SUSPENDED,
    ASSIGNMENT_STATUSES.REVOKED,
  ])],
  [ASSIGNMENT_STATUSES.SUSPENDED, Object.freeze([
    ASSIGNMENT_STATUSES.ACTIVE,
    ASSIGNMENT_STATUSES.REVOKED,
  ])],
  [ASSIGNMENT_STATUSES.REVOKED, Object.freeze([])],
  [ASSIGNMENT_STATUSES.DECLINED, Object.freeze([])],
  [ASSIGNMENT_STATUSES.EXPIRED, Object.freeze([])],
]);

/** An unanswered invite goes stale rather than sitting open forever. */
const INVITE_EXPIRY_DAYS = 7;

const isAssignmentStatus = (value) => Object.hasOwn(ASSIGNMENT_STATUSES, String(value));

/** The relationship exists — not necessarily that it may sell. */
const isAssignmentLive = (status) => LIVE_ASSIGNMENT_STATUSES.includes(status);

/** The relationship permits selling right now. */
const isAssignmentSellable = (status) => SELLABLE_ASSIGNMENT_STATUSES.includes(status);

/**
 * Whether `from → to` is a legal move. Never use this as an authorization gate;
 * the caller still has to prove the actor and pin its permitted starting state.
 *
 * An unrecognised `from` returns false rather than throwing. This is asked of
 * stored rows, and a row written before this slice existed must fail closed
 * instead of taking down the request that read it.
 */
const canTransition = (from, to) => Boolean(ASSIGNMENT_TRANSITIONS.get(from)?.includes(to));

/** When an invite sent at `sentAt` goes stale. */
const inviteExpiryFrom = (sentAt) => new Date(
  new Date(sentAt).getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
);

module.exports = {
  ASSIGNMENT_STATUSES,
  ASSIGNMENT_TRANSITIONS,
  INVITE_EXPIRY_DAYS,
  LIVE_ASSIGNMENT_STATUSES,
  SELLABLE_ASSIGNMENT_STATUSES,
  TERMINAL_ASSIGNMENT_STATUSES,
  canTransition,
  inviteExpiryFrom,
  isAssignmentLive,
  isAssignmentSellable,
  isAssignmentStatus,
};
