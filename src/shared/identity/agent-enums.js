"use strict";

/**
 * The agent vocabulary: who owns the relationship, what kind of shopfront, and
 * how far through verification the agent is.
 *
 * WHY THE KYC MACHINE LIVES ON `applicationStatus` AND NOT A NEW `kycStatus`
 * FIELD. The master plan writes both state machines against "Agent.kycStatus",
 * but `applicationStatus` already holds the PLATFORM machine verbatim — DRAFT,
 * PENDING, MORE_INFO, APPROVED, REJECTED, SUSPENDED. Adding a second status
 * field would give us two sources of truth for one question, and every reader
 * would have to know which to trust. So the OPERATOR machine's two extra values
 * are added to the existing field instead. The rename to `kycStatus` is a rename
 * like the others, and renames are slice 5 by design.
 *
 * Adding enum members is backward compatible: every agent that exists today
 * carries a PLATFORM-machine value, and those values keep their meaning.
 */

/** Who owns the relationship. Replaces `agentType: DEFAULT | OPERATOR_LINKED`. */
const AGENT_SCOPES = Object.freeze({
  /** Self-registered, sells any operator's inventory, the platform pays them. */
  PLATFORM: "PLATFORM",
  /**
   * The near-term focus: a portable identity that sells only for operators
   * holding an ACTIVE assignment. The operator pays them; the platform pays
   * nothing and settles nothing.
   */
  OPERATOR: "OPERATOR",
});
/**
 * What kind of shopfront the agent runs.
 *
 * Note "SOLO" rather than "individual". The old `operationType` enum used
 * "individual" for a one-person outlet while `agentType` used DEFAULT/
 * OPERATOR_LINKED for something else entirely, and the word ended up doing
 * double duty across the codebase. Avoid it here.
 */const OUTLET_TYPES = Object.freeze({
  TICKET_COUNTER: "TICKET_COUNTER",
  TRAVEL_AGENCY: "TRAVEL_AGENCY",
  MOBILE_SHOP: "MOBILE_SHOP",
  HOTEL: "HOTEL",
  SOLO: "SOLO",
});

/** Every value `applicationStatus` may hold, across both machines. */
const KYC_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  PHONE_VERIFIED: "PHONE_VERIFIED",
  VERIFIED_BASIC: "VERIFIED_BASIC",
  PENDING: "PENDING",
  MORE_INFO: "MORE_INFO",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
});

/**
 * Which values are legal for which scope. The schema enum cannot express this —
 * it is one field serving two machines — so the constraint is enforced here and
 * asserted by the policy layer.
 *
 *   OPERATOR  DRAFT → PHONE_VERIFIED → VERIFIED_BASIC → SUSPENDED
 *   PLATFORM  DRAFT → PENDING → MORE_INFO → APPROVED | REJECTED → SUSPENDED
 *
 * The OPERATOR path is short on purpose: we never pay these agents, so we never
 * need their PAN, bank details or citizenship. A verified phone and a name is
 * the whole of it.
 */
const SCOPE_KYC_STATUSES = Object.freeze({
  OPERATOR: Object.freeze(["DRAFT", "PHONE_VERIFIED", "VERIFIED_BASIC", "SUSPENDED"]),
  PLATFORM: Object.freeze(["DRAFT", "PENDING", "MORE_INFO", "APPROVED", "REJECTED", "SUSPENDED"]),
});

/**
 * The one status per scope that clears an agent to hold an ACTIVE assignment.
 * Read by the selling guard in slice 3 — stated here so both scopes answer the
 * question in one place rather than each caller hardcoding "APPROVED".
 */
const SELLABLE_KYC_STATUSES = Object.freeze({
  OPERATOR: Object.freeze(["VERIFIED_BASIC"]),
  PLATFORM: Object.freeze(["APPROVED"]),
});
/**
 * Legacy → current translations, for reading rows written before this slice.
 *
 * Maps, not plain objects: some of these keys come from request bodies, and on a
 * plain object a lookup of "constructor" resolves truthy off the prototype
 * chain. A Map has no inherited keys.
 */
const LEGACY_AGENT_TYPE_TO_SCOPE = new Map([
  ["DEFAULT", AGENT_SCOPES.PLATFORM],
  ["OPERATOR_LINKED", AGENT_SCOPES.OPERATOR],
]);

const LEGACY_OPERATION_TYPE_TO_OUTLET = new Map([
  ["ticket_counter", OUTLET_TYPES.TICKET_COUNTER],
  ["travel_agent", OUTLET_TYPES.TRAVEL_AGENCY],
  ["mobile_shop", OUTLET_TYPES.MOBILE_SHOP],
  ["hotel", OUTLET_TYPES.HOTEL],
  ["individual", OUTLET_TYPES.SOLO],
  // "other" has no equivalent: it carried no information. Reads as null.
  ["other", null],
]);

const isAgentScope = (value) => Object.hasOwn(AGENT_SCOPES, String(value));

const isOutletType = (value) => Object.hasOwn(OUTLET_TYPES, String(value));

// Own-property guard, not a plain lookup: SCOPE_KYC_STATUSES['constructor']
// resolves off the prototype chain and would blow up on .includes().
const statusesFor = (table, scope) => (Object.hasOwn(table, String(scope)) ? table[scope] : null);

const isKycStatusLegalForScope = (scope, status) => Boolean(
  statusesFor(SCOPE_KYC_STATUSES, scope)?.includes(status),
);

/** True when this agent's own verification state permits selling. */
const isKycSellable = (scope, status) => Boolean(
  statusesFor(SELLABLE_KYC_STATUSES, scope)?.includes(status),
);

/** An agent's scope, falling back to the legacy `agentType` for old rows. */
// Validates the stored value rather than trusting it: a row written before the
// enum existed, or by a bulk script that bypasses schema validation, must not
// leak an unrecognised scope into responses or authorisation checks.
const scopeOf = (agent) => (isAgentScope(agent?.scope) ? agent.scope : null)
  || LEGACY_AGENT_TYPE_TO_SCOPE.get(agent?.agentType)
  || AGENT_SCOPES.PLATFORM;

/** An agent's outlet type, falling back to the legacy `operationType`. */
const outletTypeOf = (agent) => (isOutletType(agent?.outletType) ? agent.outletType : null)
  || LEGACY_OPERATION_TYPE_TO_OUTLET.get(agent?.operationType)
  || null;

module.exports = {
  AGENT_SCOPES,
  KYC_STATUSES,
  LEGACY_AGENT_TYPE_TO_SCOPE,
  LEGACY_OPERATION_TYPE_TO_OUTLET,
  OUTLET_TYPES,
  SCOPE_KYC_STATUSES,
  SELLABLE_KYC_STATUSES,
  isAgentScope,
  isKycSellable,
  isKycStatusLegalForScope,
  isOutletType,
  outletTypeOf,
  scopeOf,
};
