"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const policy = require("../../../../src/shared/identity/agent-assignability.js");

/** Checksum-valid, generated from entity-code's own formatter. */
const VALID_CODE = "SM-AG-MAVSKNF";
const LEGACY_ID = "SHV-AG-KTM-001";

const operatorAgent = (over = {}) => ({
  scope: "OPERATOR",
  applicationStatus: "DRAFT",
  outletType: "TRAVEL_AGENCY",
  district: "Kathmandu",
  municipality: "Kathmandu Metropolitan City",
  user: { name: "Ram Bahadur", phoneVerified: true },
  ...over,
});

test("agentFilterFromInput", async (t) => {
  await t.test("accepts a canonical code", () => {
    assert.deepEqual(policy.agentFilterFromInput(VALID_CODE), { code: VALID_CODE });
  });

  await t.test("canonicalises what a human pastes", () => {
    assert.deepEqual(
      policy.agentFilterFromInput(`  ${VALID_CODE.toLowerCase()}  `),
      { code: VALID_CODE },
    );
  });

  await t.test("accepts the legacy form on its own field", () => {
    assert.deepEqual(policy.agentFilterFromInput(LEGACY_ID), { agentId: LEGACY_ID });
  });

  await t.test("returns null for anything that cannot be a code", () => {
    // Null means "do not query" — the caller turns this into a 404 without
    // touching the database.
    assert.equal(policy.agentFilterFromInput("SM-AG-MAVSKNG"), null, "a bad check symbol is not a code");
    assert.equal(policy.agentFilterFromInput("SM-BR-MAVSKNF"), null, "a brand code is not an agent code");
    assert.equal(policy.agentFilterFromInput("nonsense"), null);
    assert.equal(policy.agentFilterFromInput(""), null);
    assert.equal(policy.agentFilterFromInput(undefined), null);
    assert.equal(policy.agentFilterFromInput(null), null);
    assert.equal(policy.agentFilterFromInput(12345), null);
  });

  await t.test("refuses input too long to be a typo", () => {
    assert.equal(policy.agentFilterFromInput("A".repeat(policy.MAX_CODE_INPUT_LENGTH + 1)), null);
    // A regex-flavoured payload never reaches the query builder.
    assert.equal(policy.agentFilterFromInput(`${VALID_CODE}${"|".repeat(64)}`), null);
  });

  await t.test("rejects an object, so no operator filter can be smuggled in", () => {
    assert.equal(policy.agentFilterFromInput({ $ne: null }), null);
    assert.equal(policy.agentFilterFromInput(["SM-AG-MAVSKNF"]), null);
  });
});

test("isAssignableByOperator", async (t) => {
  await t.test("accepts an operator-scope agent", () => {
    assert.equal(policy.isAssignableByOperator(operatorAgent()), true);
  });

  await t.test("refuses a platform-scope agent (master plan D7)", () => {
    assert.equal(policy.isAssignableByOperator(operatorAgent({ scope: "PLATFORM" })), false);
  });

  await t.test("classifies a legacy row by its agentType", () => {
    // The reason every projection carries `agentType`: without it these rows read
    // as PLATFORM and every legacy operator agent becomes unassignable.
    const legacy = { agentType: "OPERATOR_LINKED", applicationStatus: "APPROVED" };
    assert.equal(policy.isAssignableByOperator(legacy), true);
    assert.equal(policy.isAssignableByOperator({ agentType: "DEFAULT" }), false);
  });

  await t.test("treats an unclassifiable agent as platform, so it is refused", () => {
    assert.equal(policy.isAssignableByOperator({}), false);
    assert.equal(policy.isAssignableByOperator(null), false);
  });
});

test("effectiveKycStatus", async (t) => {
  await t.test("corrects a stale stored DRAFT", () => {
    // The whole point of deriving here. An owner-created agent is stored at
    // DRAFT; once they verify their phone and their outlet details are on file
    // they have earned VERIFIED_BASIC, and an operator looking them up must see
    // that rather than the value nobody has recomputed yet.
    assert.equal(policy.effectiveKycStatus(operatorAgent()), "VERIFIED_BASIC");
  });

  await t.test("stops at PHONE_VERIFIED when outlet details are missing", () => {
    const partial = operatorAgent({ district: null, municipality: null });
    assert.equal(policy.effectiveKycStatus(partial), "PHONE_VERIFIED");
  });

  await t.test("stays at DRAFT until the phone is proven", () => {
    const unproven = operatorAgent({ user: { name: "Ram", phoneVerified: false } });
    assert.equal(policy.effectiveKycStatus(unproven), "DRAFT");
  });

  await t.test("falls back to the stored value when phoneVerified is unknown", () => {
    // A missing user document, or a projection that dropped the field. Deriving
    // from `undefined` would demote the agent to DRAFT; the stored value stands.
    assert.equal(policy.effectiveKycStatus(operatorAgent({ user: null })), "DRAFT");
    const approved = operatorAgent({ applicationStatus: "APPROVED", user: null });
    assert.equal(policy.effectiveKycStatus(approved), "APPROVED");
  });

  await t.test("leaves a terminal status alone", () => {
    // SUSPENDED is not derivable: nothing about a verified phone un-suspends an
    // agent.
    const suspended = operatorAgent({ applicationStatus: "SUSPENDED" });
    assert.equal(policy.effectiveKycStatus(suspended), "SUSPENDED");
  });
});

test("hasVerifiedBadge", async (t) => {
  await t.test("is earned at VERIFIED_BASIC for an operator agent", () => {
    assert.equal(policy.hasVerifiedBadge(operatorAgent(), "VERIFIED_BASIC"), true);
  });

  await t.test("is withheld part-way through verification", () => {
    assert.equal(policy.hasVerifiedBadge(operatorAgent(), "PHONE_VERIFIED"), false);
    assert.equal(policy.hasVerifiedBadge(operatorAgent(), "DRAFT"), false);
    assert.equal(policy.hasVerifiedBadge(operatorAgent(), "SUSPENDED"), false);
  });

  await t.test("is answered against the derived status, not the stored one", () => {
    // Stored DRAFT, derived VERIFIED_BASIC: the badge must agree with what the
    // response shows beside it.
    const agent = operatorAgent({ applicationStatus: "DRAFT" });
    assert.equal(policy.hasVerifiedBadge(agent, policy.effectiveKycStatus(agent)), true);
  });

  await t.test("honours APPROVED regardless of scope", () => {
    assert.equal(policy.hasVerifiedBadge({ scope: "PLATFORM" }, "APPROVED"), true);
  });
});
