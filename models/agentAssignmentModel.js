"use strict";

const mongoose = require("mongoose");

const {
  ASSIGNMENT_STATUSES,
  LIVE_ASSIGNMENT_STATUSES,
} = require("../src/shared/identity/agent-assignment-status.js");
const {
  ACCESS_SCOPES,
  COMMISSION_MODES,
  DEFAULT_COMMISSION,
  DEFAULT_PERMISSIONS,
  isCommissionValid,
} = require("../src/shared/identity/agent-assignment-terms.js");

/**
 * AgentAssignment — the operator-owned permission for one agent to sell one
 * operator's inventory.
 *
 * This is the row that makes the agent model many-to-many. `Agent` holds the
 * portable identity: one person, one published code, owned by nobody. The
 * relationship lives here, one row per (agent, operator), because a single
 * `Agent.linkedOperatorId` cannot express an agent that three operators have
 * each hired on their own terms. The six deprecated fields on `Agent` move
 * here.
 *
 * The operator grants it, the agent accepts it, and either may end it. We are
 * not a party to it: the commission below is recorded so the operator can
 * report on it, and there is no balance, no credit limit and no ledger, because
 * the operator pays the agent directly (master plan D8).
 */

/**
 * What the agent may do with the access. Narrowed by the operator in the terms
 * step; see DEFAULT_PERMISSIONS for why the defaults are the conservative end.
 */
const permissionsSchema = new mongoose.Schema({
  canSellCash: { type: Boolean, default: DEFAULT_PERMISSIONS.canSellCash },
  canSellOnline: { type: Boolean, default: DEFAULT_PERMISSIONS.canSellOnline },
  canCancel: { type: Boolean, default: DEFAULT_PERMISSIONS.canCancel },
  cancelWindowMins: { type: Number, default: DEFAULT_PERMISSIONS.cancelWindowMins, min: 0 },
  // null means uncapped. `min: 1` is not contradicted by the null default —
  // Mongoose skips validators for null on a non-required path.
  maxSeatsPerBooking: { type: Number, default: DEFAULT_PERMISSIONS.maxSeatsPerBooking, min: 1 },
  maxDiscountPct: { type: Number, default: DEFAULT_PERMISSIONS.maxDiscountPct, min: 0, max: 100 },
}, { _id: false });

/** What the operator says they pay. Display and reporting only (D4). */
const commissionSchema = new mongoose.Schema({
  mode: {
    type: String,
    enum: Object.values(COMMISSION_MODES),
    default: DEFAULT_COMMISSION.mode,
  },
  value: {
    type: Number,
    default: DEFAULT_COMMISSION.value,
    min: 0,
    // The cap depends on the sibling field, which a plain `max` cannot see: 100
    // is the ceiling for PERCENT and meaningless for the flat modes.
    validate: {
      validator(value) { return isCommissionValid(this.mode, value); },
      message: "commission value is out of range for its mode",
    },
  },
}, { _id: false });

const agentAssignmentSchema = new mongoose.Schema({
  agentId: {
    type: mongoose.Schema.Types.ObjectId, ref: "Agent", required: true, index: true,
  },
  operatorId: {
    type: mongoose.Schema.Types.ObjectId, ref: "OperatorBrand", required: true, index: true,
  },
  // Denormalised from the brand so that "which agents work for me?" does not
  // need a join through every brand the owner holds. Refs "User" to match
  // OperatorBrand.ownerId and Agent.createdByOwnerId — owners are Users, and
  // the separate BusOwner collection is not what those ids point into.
  ownerId: {
    type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true,
  },

  status: {
    type: String,
    enum: Object.values(ASSIGNMENT_STATUSES),
    default: ASSIGNMENT_STATUSES.INVITED,
    index: true,
  },
  // Why the status is where it is: shown to both sides, so it is user-visible
  // text authored by the agent when declining and length-capped.
  statusReason: { type: String, trim: true, maxlength: 500, default: null },
  // Operator-authored suspend/revoke context is separate so an agent-facing
  // mapper can never accidentally expose an internal note from the shared
  // statusReason field. This is operational context, not agent PII.
  operatorNote: { type: String, trim: true, maxlength: 500, default: null },

  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  invitedAt: { type: Date, default: Date.now },
  /**
   * When an unanswered invite goes stale. Meaningful only while INVITED.
   *
   * Deliberately NOT a TTL index: a TTL would delete the row, and an expired
   * invite is a fact both sides may need to see. Expiry is a transition to
   * EXPIRED, not a disappearance.
   */
  expiresAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  declinedAt: { type: Date, default: null },
  suspendedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

  accessScope: {
    type: String,
    enum: Object.values(ACCESS_SCOPES),
    default: ACCESS_SCOPES.ALL_BUSES,
  },
  allowedRouteIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "BusRoute" }],
  // Recurring Schedule grants automatically cover the dated Trips they generate.
  allowedScheduleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Schedule" }],

  permissions: { type: permissionsSchema, default: () => ({}) },
  operatorCommission: { type: commissionSchema, default: () => ({}) },
}, { timestamps: true });

/**
 * At most one LIVE assignment per (agent, operator).
 *
 * Partial, not plain unique. The master plan asks for uniqueness on the pair and
 * also makes REVOKED terminal; together those would make re-hiring a revoked
 * agent impossible. Filtering to the live statuses keeps the invariant that
 * matters and lets terminal rows accumulate as history.
 */
agentAssignmentSchema.index(
  { agentId: 1, operatorId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [...LIVE_ASSIGNMENT_STATUSES] } },
    name: "one_live_assignment_per_agent_operator",
  },
);

// The two list views: an operator's agents, and an agent's operators.
agentAssignmentSchema.index({ operatorId: 1, status: 1, createdAt: -1 });
agentAssignmentSchema.index({ agentId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model("AgentAssignment", agentAssignmentSchema);
