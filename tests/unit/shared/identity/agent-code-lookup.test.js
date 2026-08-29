"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const { ENTITY_TYPE_CODES } = require("../../../../src/shared/identity/entity-type-codes.js");
const { generateEntityCode } = require("../../../../src/shared/identity/entity-code.js");
const {
  agentCodeFilter,
  displayAgentCode,
} = require("../../../../src/shared/identity/agent-code-lookup.js");

describe("agent code lookup — new scheme", () => {
  test("matches on the canonical code field", () => {
    const code = generateEntityCode(ENTITY_TYPE_CODES.AGENT);
    assert.deepEqual(agentCodeFilter(code), { code });
  });

  test("canonicalises before matching so any transcription reaches the same agent", () => {
    const code = generateEntityCode(ENTITY_TYPE_CODES.AGENT);
    assert.deepEqual(agentCodeFilter(code.toLowerCase()), { code });
    assert.deepEqual(agentCodeFilter(`  ${code}  `), { code });
    assert.deepEqual(agentCodeFilter(code.replace(/-/g, "")), { code });
  });

  test("never returns an $or, so the query stays on one index", () => {
    const filter = agentCodeFilter(generateEntityCode(ENTITY_TYPE_CODES.AGENT));
    assert.deepEqual(Object.keys(filter), ["code"]);
  });

  test("refuses a valid code belonging to another entity", () => {
    // Pasting a booking code into "find agent" must not become a query.
    assert.equal(agentCodeFilter(generateEntityCode(ENTITY_TYPE_CODES.BOOKING)), null);
  });

  test("refuses a code whose checksum does not hold", () => {
    const code = generateEntityCode(ENTITY_TYPE_CODES.AGENT);
    // Substitute the last body symbol for a guaranteed-different one. A single
    // substitution is always caught, so this must never reach the database.
    const body = code.slice(6, 12);
    const replacement = body[5] === "0" ? "1" : "0";
    const typo = `SM-AG-${body.slice(0, 5)}${replacement}${code.slice(-1)}`;
    assert.equal(agentCodeFilter(typo), null, typo);
  });
});

describe("agent code lookup — legacy ids", () => {
  test("matches a legacy id on its own field", () => {
    assert.deepEqual(agentCodeFilter("SHV-AG-KRM-042"), { agentId: "SHV-AG-KRM-042" });
    assert.deepEqual(agentCodeFilter("  SHV-AG-KRM-042 "), { agentId: "SHV-AG-KRM-042" });
  });

  test("matches legacy ids exactly rather than normalising them", () => {
    // SHV-AG bodies can contain I, L, O and U, so folding O->0 or I->1 the way
    // the new scheme does could resolve to a different agent entirely.
    assert.equal(agentCodeFilter("shv-ag-krm-042"), null);
    assert.equal(agentCodeFilter("SHVAGKRM042"), null);
  });

  test("rejects near-misses of the legacy shape", () => {
    for (const input of [
      "SHV-AG-KRM-04",     // too few digits
      "SHV-AG-KRM-0424",   // too many digits
      "SHV-AG-KR-042",     // too few body symbols
      "SHV-AG-KRM-ABC",    // letters in the numeric tail
      "SHV-XX-KRM-042",    // wrong entity segment
    ]) {
      assert.equal(agentCodeFilter(input), null, `accepted ${input}`);
    }
  });
});

describe("agent code lookup — junk and precedence", () => {
  test("returns null instead of a filter that would scan", () => {
    for (const input of [null, undefined, 12345, {}, "", "   ", "nonsense", "SM-AG-"]) {
      assert.equal(agentCodeFilter(input), null, `accepted ${JSON.stringify(input)}`);
    }
  });

  test("displays the new code once an agent has one", () => {
    assert.equal(
      displayAgentCode({ code: "SM-AG-7K4QP2X", agentId: "SHV-AG-KRM-042" }),
      "SM-AG-7K4QP2X"
    );
  });

  test("falls back to the legacy id until the agent is backfilled", () => {
    assert.equal(displayAgentCode({ agentId: "SHV-AG-KRM-042" }), "SHV-AG-KRM-042");
    assert.equal(displayAgentCode({ code: null, agentId: "SHV-AG-KRM-042" }), "SHV-AG-KRM-042");
  });

  test("returns null rather than undefined for an agent with neither", () => {
    assert.equal(displayAgentCode({}), null);
    assert.equal(displayAgentCode(null), null);
    assert.equal(displayAgentCode(undefined), null);
  });
});
