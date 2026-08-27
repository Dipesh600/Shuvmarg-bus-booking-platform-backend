"use strict";

/**
 * Agent verification: the state an agent's own checks are in, and whether that
 * state opens the verified-only routes.
 *
 * Separate from `agent-enums.js` on purpose. That file states the *vocabulary* —
 * which statuses exist, which are legal for which scope. The questions here are
 * *decisions* read off that vocabulary, and more than one caller needs the same
 * answer: the route gate and the `/me` mapper. While they each answered for
 * themselves, an agent could be told `kycCleared: false` and still reach the
 * dashboard.
 */

const {
  AGENT_SCOPES,
  KYC_STATUSES,
  isKycSellable,
  outletTypeOf,
  scopeOf,
} = require("./agent-enums.js");

/**
 * The only statuses this module will ever write.
 *
 * Everything outside this list is a human's decision: SUSPENDED and REJECTED are
 * an admin's, and APPROVED / PENDING / MORE_INFO belong to the PLATFORM review
 * machine. Derivation that touched them would silently overrule a reviewer — and
 * would demote the admin-created `agentType: OPERATOR_LINKED` agents who sit at
 * APPROVED today.
 */
const DERIVABLE_STATUSES = Object.freeze([
  KYC_STATUSES.DRAFT,
  KYC_STATUSES.PHONE_VERIFIED,
  KYC_STATUSES.VERIFIED_BASIC,
]);

/**
 * What an OPERATOR agent must have on file before VERIFIED_BASIC: a kind of
 * outlet, and a place.
 *
 * Deliberately not `businessName` or `shopAddress`. A SOLO agent working from a
 * phone has neither, and they are exactly who this scope exists for — requiring
 * a shopfront would lock out the population the redesign is for.
 */
const REQUIRED_OUTLET_FIELDS = Object.freeze(["outletType", "district", "municipality", "placeName"]);

const isFilled = (value) => typeof value === "string" && value.trim().length > 0;

/**
 * `outletType` goes through outletTypeOf rather than a presence check, so a
 * recognised legacy `operationType` counts and an unrecognised string does not.
 */
const hasRequiredOutletDetails = (agent) => REQUIRED_OUTLET_FIELDS.every(
  (field) => (field === "outletType" ? Boolean(outletTypeOf(agent)) : isFilled(agent?.[field])),
);

/**
 * The status an OPERATOR-scope agent has earned, or `null` when this module has
 * no business writing one.
 *
 *   DRAFT           the phone is not proven yet
 *   PHONE_VERIFIED  proven, outlet details still missing
 *   VERIFIED_BASIC  proven, outlet details on file
 *
 * `phoneVerified` is passed in rather than read off a user document, and a
 * non-boolean returns `null`. That guard is the whole point of the signature: a
 * caller loading the user with a projection that omits `phoneVerified` would
 * otherwise read `undefined` as "not verified" and quietly demote every agent it
 * touched to DRAFT.
 */
const deriveOperatorKycStatus = (agent, { phoneVerified } = {}) => {
  if (typeof phoneVerified !== "boolean") return null;
  if (scopeOf(agent) !== AGENT_SCOPES.OPERATOR) return null;
  if (!DERIVABLE_STATUSES.includes(agent?.applicationStatus)) return null;
  if (!phoneVerified) return KYC_STATUSES.DRAFT;
  return hasRequiredOutletDetails(agent)
    ? KYC_STATUSES.VERIFIED_BASIC
    : KYC_STATUSES.PHONE_VERIFIED;
};

/**
 * Does this agent's own verification open the verified-only routes?
 *
 * APPROVED clears regardless of scope, and that is what makes this safe to
 * deploy: it is *monotone* against the rule it replaces
 * (`applicationStatus === "APPROVED"`), so nobody who can reach /profile or
 * /dashboard today loses access to them. That allowance is load-bearing, not
 * decorative — the admin wizard's `OPERATOR_LINKED` agents sit at APPROVED, and
 * a scope-only rule would have started 403ing every one of them.
 *
 * Cleared verification is still not permission to sell. Selling additionally
 * requires an ACTIVE assignment from the operator whose seats are being sold —
 * slice 3 adds that check on top of this one, it does not replace it.
 */
const isAgentVerificationCleared = (agent) => {
  if (agent?.applicationStatus === KYC_STATUSES.APPROVED) return true;
  return isKycSellable(scopeOf(agent), agent?.applicationStatus);
};

module.exports = {
  DERIVABLE_STATUSES,
  REQUIRED_OUTLET_FIELDS,
  deriveOperatorKycStatus,
  hasRequiredOutletDetails,
  isAgentVerificationCleared,
};
